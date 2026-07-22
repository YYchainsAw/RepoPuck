pub mod position;
pub mod settings;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Emitter, Manager, Monitor, PhysicalPosition, WebviewWindow, Window,
    WindowEvent, Wry,
};
use tauri_plugin_store::StoreExt;

use self::position::{panel_position, restore_relative_position, Point, Rect, Size};

const PANEL_LABEL: &str = "panel";
const PUCK_LABEL: &str = "puck";
const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_PUCK_MARGIN: i32 = 24;

#[derive(Default)]
pub struct ShellState {
    pinned: AtomicBool,
}

pub struct PuckMenu(pub tauri::menu::Menu<Wry>);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PanelAction {
    Show,
    Toggle,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPuckPosition {
    monitor_name: Option<String>,
    x: i32,
    y: i32,
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store(SETTINGS_FILE)?;
    let pinned = store
        .get("pinned")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    app.state::<ShellState>()
        .pinned
        .store(pinned, Ordering::Relaxed);
    if let Some(path) = store
        .get("recentRepositories")
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .and_then(|recent| recent.into_iter().next())
    {
        let _ = app
            .state::<crate::commands::RepositoryState>()
            .select(path.into());
    }

    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        panel.set_always_on_top(pinned)?;
    }
    restore_puck_position(app)?;

    let menu = tray::setup(app)?;
    app.manage(PuckMenu(menu));
    Ok(())
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    perform_panel_action(&app, puck_click_action())
}

pub(crate) fn puck_click_action() -> PanelAction {
    PanelAction::Toggle
}

pub(crate) fn perform_panel_action(app: &AppHandle, action: PanelAction) -> Result<(), String> {
    match action {
        PanelAction::Show => show_panel(app),
        PanelAction::Toggle => toggle_panel_for(app),
    }
}

fn toggle_panel_for(app: &AppHandle) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    if panel.is_visible().map_err(safe_window_error)? {
        panel.hide().map_err(safe_window_error)
    } else {
        show_panel(app)
    }
}

#[tauri::command]
pub fn set_panel_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    app.state::<ShellState>()
        .pinned
        .store(pinned, Ordering::Relaxed);
    window(&app, PANEL_LABEL)?
        .set_always_on_top(pinned)
        .map_err(safe_window_error)?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set("pinned", pinned);
    store.save().map_err(safe_store_error)
}

#[tauri::command]
pub fn save_puck_position(app: AppHandle) -> Result<(), String> {
    save_puck_position_for(&app)
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app)
}

#[tauri::command]
pub fn show_puck_menu(
    window: WebviewWindow,
    menu: tauri::State<'_, PuckMenu>,
) -> Result<(), String> {
    if window.label() != PUCK_LABEL {
        return Err("The RepoPuck menu is only available from the puck".to_owned());
    }
    window.popup_menu(&menu.0).map_err(safe_window_error)
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. }
            if window.label() == PANEL_LABEL || window.label() == PUCK_LABEL =>
        {
            api.prevent_close();
            let _ = window.hide();
        }
        WindowEvent::Focused(false) if window.label() == PANEL_LABEL => {
            let pinned = window
                .app_handle()
                .state::<ShellState>()
                .pinned
                .load(Ordering::Relaxed);
            if !pinned {
                let _ = window.hide();
            }
        }
        _ => {}
    }
}

pub(crate) fn show_panel(app: &AppHandle) -> Result<(), String> {
    position_panel(app)?;
    let panel = window(app, PANEL_LABEL)?;
    panel.unminimize().map_err(safe_window_error)?;
    panel.show().map_err(safe_window_error)?;
    panel.set_focus().map_err(safe_window_error)
}

pub(crate) fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    show_panel(app)?;
    window(app, PANEL_LABEL)?
        .emit("open_settings_requested", ())
        .map_err(|_| "Could not open settings".to_owned())
}

pub(crate) fn request_refresh(app: &AppHandle) -> Result<(), String> {
    app.emit("refresh_requested", ())
        .map_err(|_| "Could not request a refresh".to_owned())
}

fn position_panel(app: &AppHandle) -> Result<(), String> {
    let puck = window(app, PUCK_LABEL)?;
    let panel = window(app, PANEL_LABEL)?;
    let puck_position = puck.outer_position().map_err(safe_window_error)?;
    let puck_size = puck.outer_size().map_err(safe_window_error)?;
    let panel_size = panel.outer_size().map_err(safe_window_error)?;
    let monitor = current_monitor(&puck, app)?;
    let work_area = monitor_rect(&monitor);
    let position = panel_position(
        Rect::new(
            puck_position.x,
            puck_position.y,
            puck_size.width,
            puck_size.height,
        ),
        Size::new(panel_size.width, panel_size.height),
        work_area,
    );
    panel
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(safe_window_error)
}

fn save_puck_position_for(app: &AppHandle) -> Result<(), String> {
    let puck = window(app, PUCK_LABEL)?;
    let absolute = puck.outer_position().map_err(safe_window_error)?;
    let monitor = current_monitor(&puck, app)?;
    let work_area = monitor_rect(&monitor);
    let persisted = PersistedPuckPosition {
        monitor_name: monitor.name().cloned(),
        x: absolute.x.saturating_sub(work_area.x),
        y: absolute.y.saturating_sub(work_area.y),
    };
    let value = serde_json::to_value(persisted)
        .map_err(|_| "Could not save the puck position".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set("puckPosition", value);
    store.save().map_err(safe_store_error)
}

fn restore_puck_position(app: &App) -> Result<(), String> {
    let puck = app
        .get_webview_window(PUCK_LABEL)
        .ok_or_else(|| "The puck window is unavailable".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    let saved = store
        .get("puckPosition")
        .and_then(|value| serde_json::from_value::<PersistedPuckPosition>(value).ok());
    let monitors = app.available_monitors().map_err(safe_window_error)?;
    let primary = app.primary_monitor().map_err(safe_window_error)?;
    let monitor = saved
        .as_ref()
        .and_then(|position| {
            position.monitor_name.as_ref().and_then(|name| {
                monitors
                    .iter()
                    .find(|monitor| monitor.name() == Some(name))
                    .cloned()
            })
        })
        .or(primary)
        .or_else(|| monitors.into_iter().next())
        .ok_or_else(|| "No monitor is available".to_owned())?;
    let work_area = monitor_rect(&monitor);
    let puck_size = puck.outer_size().map_err(safe_window_error)?;
    let size = Size::new(puck_size.width, puck_size.height);
    let relative = saved
        .map(|position| Point::new(position.x, position.y))
        .unwrap_or_else(|| default_relative_position(size, work_area));
    let position = restore_relative_position(relative, size, work_area);
    puck.set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(safe_window_error)
}

fn default_relative_position(puck: Size, work_area: Rect) -> Point {
    let x = i64::from(work_area.width)
        .saturating_sub(i64::from(puck.width))
        .saturating_sub(i64::from(DEFAULT_PUCK_MARGIN));
    let y = i64::from(work_area.height)
        .saturating_sub(i64::from(puck.height))
        .saturating_sub(i64::from(DEFAULT_PUCK_MARGIN));
    Point::new(
        x.clamp(0, i64::from(i32::MAX)) as i32,
        y.clamp(0, i64::from(i32::MAX)) as i32,
    )
}

fn current_monitor(window: &WebviewWindow, app: &AppHandle) -> Result<Monitor, String> {
    window
        .current_monitor()
        .map_err(safe_window_error)?
        .or(app.primary_monitor().map_err(safe_window_error)?)
        .ok_or_else(|| "No monitor is available".to_owned())
}

fn monitor_rect(monitor: &Monitor) -> Rect {
    let work_area = monitor.work_area();
    Rect::new(
        work_area.position.x,
        work_area.position.y,
        work_area.size.width,
        work_area.size.height,
    )
}

fn window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("The {label} window is unavailable"))
}

fn safe_window_error(_: tauri::Error) -> String {
    "RepoPuck could not update its native window".to_owned()
}

fn safe_store_error(_: tauri_plugin_store::Error) -> String {
    "RepoPuck could not save its settings".to_owned()
}

#[cfg(test)]
mod tests {
    #[test]
    fn puck_window_configuration_is_focusable_for_keyboard_access() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("valid config");
        let windows = config["app"]["windows"].as_array().expect("window array");
        let puck = windows
            .iter()
            .find(|window| window["label"] == "puck")
            .expect("puck window");

        assert_eq!(puck["focus"], false);
        assert_eq!(puck["focusable"], true);
    }

    #[test]
    fn bundled_webviews_have_a_restrictive_content_security_policy() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("valid config");
        let csp = &config["app"]["security"]["csp"];

        assert_eq!(csp["default-src"], "'self'");
        assert_eq!(csp["connect-src"], "ipc: http://ipc.localhost");
        assert_eq!(csp["object-src"], "'none'");
    }
}
