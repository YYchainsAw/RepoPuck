use std::{thread, time::Duration, time::Instant};

use tauri::{AppHandle, Manager};

use super::{
    drawer_hover_intent, drawer_is_active, perform_drawer_intent,
    position::{padded_rect, top_center_hot_zone, Point, Rect},
    state::{PanelIntent, PanelPhase},
    PANEL_LABEL,
};

const POLL_INTERVAL: Duration = Duration::from_millis(40);
const IDLE_INTERVAL: Duration = Duration::from_millis(120);
const MONITOR_CACHE_LIFETIME: Duration = Duration::from_secs(2);
const HOT_ZONE_LOGICAL_HEIGHT: f64 = 6.0;
const HOT_ZONE_LOGICAL_EXTRA_WIDTH: f64 = 48.0;
const HOT_ZONE_LOGICAL_MIN_WIDTH: f64 = 280.0;
const PANEL_HIT_PADDING_LOGICAL: f64 = 12.0;
const DEFAULT_PANEL_LOGICAL_WIDTH: f64 = 420.0;

#[derive(Clone, Debug)]
struct MonitorSample {
    name: Option<String>,
    bounds: Rect,
    work_area: Rect,
    scale_factor: f64,
}

#[derive(Clone, Copy, Debug)]
struct PanelSample {
    rect: Rect,
    interaction_active: bool,
}

pub fn start(app: AppHandle) {
    let _ = thread::Builder::new()
        .name("repopuck-drawer-hover".to_owned())
        .spawn(move || watch(app));
}

fn watch(app: AppHandle) {
    let mut monitors = Vec::new();
    let mut refreshed_at = Instant::now()
        .checked_sub(MONITOR_CACHE_LIFETIME)
        .unwrap_or_else(Instant::now);

    loop {
        if super::drawer_shutdown_requested(&app) {
            return;
        }
        if !drawer_is_active(&app) {
            thread::sleep(IDLE_INTERVAL);
            continue;
        }

        let now = Instant::now();
        if monitors.is_empty() || now.duration_since(refreshed_at) >= MONITOR_CACHE_LIFETIME {
            monitors = monitor_samples(&app);
            refreshed_at = now;
        }
        let Some(cursor) = cursor_position() else {
            thread::sleep(POLL_INTERVAL);
            continue;
        };
        let cursor_monitor = monitors
            .iter()
            .find(|monitor| monitor.bounds.contains(cursor));
        let phase = super::panel_phase(&app);
        let panel = panel_sample(&app, phase);
        let panel_width = panel
            .map(|sample| sample.rect.width)
            .or_else(|| {
                cursor_monitor.map(|monitor| {
                    logical_to_physical(DEFAULT_PANEL_LOGICAL_WIDTH, monitor.scale_factor)
                })
            })
            .unwrap_or(DEFAULT_PANEL_LOGICAL_WIDTH as u32);
        let in_hot_zone = cursor_monitor.is_some_and(|monitor| {
            let zone = top_center_hot_zone(
                monitor.work_area,
                panel_width,
                logical_to_physical(HOT_ZONE_LOGICAL_EXTRA_WIDTH, monitor.scale_factor),
                logical_to_physical(HOT_ZONE_LOGICAL_MIN_WIDTH, monitor.scale_factor),
                logical_to_physical(HOT_ZONE_LOGICAL_HEIGHT, monitor.scale_factor),
            );
            zone.contains(cursor)
        });
        let in_panel = panel.is_some_and(|sample| {
            if sample.interaction_active {
                return true;
            }
            let scale_factor = cursor_monitor
                .map(|monitor| monitor.scale_factor)
                .unwrap_or(1.0);
            padded_rect(
                sample.rect,
                logical_to_physical(PANEL_HIT_PADDING_LOGICAL, scale_factor),
            )
            .contains(cursor)
        });

        if let Some(intent) = drawer_hover_intent(&app, now, in_hot_zone, in_panel) {
            let monitor_name = if intent == PanelIntent::Show {
                cursor_monitor.and_then(|monitor| monitor.name.clone())
            } else {
                None
            };
            let callback_app = app.clone();
            let dispatch_app = app.clone();
            let _ = dispatch_app.run_on_main_thread(move || {
                let _ = perform_drawer_intent(&callback_app, intent, monitor_name);
            });
        }

        thread::sleep(POLL_INTERVAL);
    }
}

fn monitor_samples(app: &AppHandle) -> Vec<MonitorSample> {
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let bounds_position = monitor.position();
            let bounds_size = monitor.size();
            let work_area = monitor.work_area();
            MonitorSample {
                name: monitor.name().cloned(),
                bounds: Rect::new(
                    bounds_position.x,
                    bounds_position.y,
                    bounds_size.width,
                    bounds_size.height,
                ),
                work_area: Rect::new(
                    work_area.position.x,
                    work_area.position.y,
                    work_area.size.width,
                    work_area.size.height,
                ),
                scale_factor: monitor.scale_factor(),
            }
        })
        .collect()
}

fn panel_sample(app: &AppHandle, phase: PanelPhase) -> Option<PanelSample> {
    if phase == PanelPhase::Hidden {
        return None;
    }
    let panel = app.get_webview_window(PANEL_LABEL)?;
    let position = panel.outer_position().ok()?;
    let size = panel.outer_size().ok()?;
    Some(PanelSample {
        rect: Rect::new(position.x, position.y, size.width, size.height),
        interaction_active: panel.is_focused().unwrap_or(false)
            || foreground_is_panel_or_owned(&panel),
    })
}

fn owner_chain_contains<T: Copy + Eq>(
    mut window: T,
    expected_owner: T,
    mut owner_of: impl FnMut(T) -> Option<T>,
) -> bool {
    for _ in 0..16 {
        if window == expected_owner {
            return true;
        }
        let Some(owner) = owner_of(window) else {
            return false;
        };
        window = owner;
    }
    false
}

#[cfg(windows)]
fn foreground_is_panel_or_owned(panel: &tauri::WebviewWindow) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindow, GW_OWNER};

    let Ok(panel) = panel.hwnd() else {
        return false;
    };
    // SAFETY: Both functions only query HWND relationships. Handles are used
    // for the duration of this call and are never retained or dereferenced.
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return false;
    }
    owner_chain_contains(foreground, panel.0, |window| {
        let owner = unsafe { GetWindow(window, GW_OWNER) };
        (!owner.is_null()).then_some(owner)
    })
}

#[cfg(not(windows))]
fn foreground_is_panel_or_owned(_: &tauri::WebviewWindow) -> bool {
    false
}

fn logical_to_physical(value: f64, scale_factor: f64) -> u32 {
    (value * scale_factor)
        .round()
        .clamp(1.0, f64::from(u32::MAX)) as u32
}

#[cfg(windows)]
fn cursor_position() -> Option<Point> {
    use windows_sys::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};

    let mut point = POINT { x: 0, y: 0 };
    // SAFETY: GetCursorPos writes one initialized POINT and does not retain the pointer.
    (unsafe { GetCursorPos(&mut point) } != 0).then_some(Point::new(point.x, point.y))
}

#[cfg(not(windows))]
fn cursor_position() -> Option<Point> {
    None
}

#[cfg(test)]
mod tests {
    use super::{logical_to_physical, owner_chain_contains};

    #[test]
    fn drawer_dimensions_follow_mixed_monitor_dpi() {
        assert_eq!(logical_to_physical(6.0, 1.0), 6);
        assert_eq!(logical_to_physical(6.0, 1.75), 11);
        assert_eq!(logical_to_physical(280.0, 2.0), 560);
    }

    #[test]
    fn owned_native_dialogs_keep_the_drawer_interaction_active() {
        let owner_of = |window| match window {
            30 => Some(20),
            20 => Some(10),
            _ => None,
        };

        assert!(owner_chain_contains(30, 10, owner_of));
        assert!(owner_chain_contains(10, 10, |_| None));
        assert!(!owner_chain_contains(30, 99, owner_of));
    }
}
