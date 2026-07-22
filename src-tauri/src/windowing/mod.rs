pub mod position;
pub mod settings;
pub mod tray;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize,
    WebviewWindow, Window, WindowEvent, Wry,
};
use tauri_plugin_store::StoreExt;

use self::position::{
    clamp_window_position, fit_window_inner_size, panel_placement, puck_position,
    restore_relative_position, window_frame_size, DockCorner, Point, Rect, Size,
};

const PANEL_LABEL: &str = "panel";
const PUCK_LABEL: &str = "puck";
const PANEL_VISIBILITY_EVENT: &str = "panel_visibility_changed";
const PANEL_OPENED_EVENT: &str = "panel_opened";
const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_PUCK_MARGIN: i32 = 24;
const PUCK_LOGICAL_SIZE: f64 = 58.0;
const PANEL_MIN_WIDTH: f64 = 360.0;
const PANEL_MIN_HEIGHT: f64 = 560.0;
const PANEL_MAX_WIDTH: f64 = 720.0;
const PANEL_MAX_HEIGHT: f64 = 960.0;

#[derive(Default)]
pub struct ShellState {
    pinned: AtomicBool,
    dock_corner: Mutex<Option<DockCorner>>,
}

pub struct PuckMenu(pub tauri::menu::Menu<Wry>);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PanelAction {
    Show,
    Hide,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPuckPosition {
    monitor_name: Option<String>,
    x: i32,
    y: i32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPanelSize {
    width: f64,
    height: f64,
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
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let restored = app_handle
                .state::<crate::commands::RepositoryState>()
                .restore_if_empty(path.into())
                .unwrap_or(false);
            if restored {
                let _ = request_refresh(&app_handle);
            }
        });
    }

    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        panel.set_always_on_top(pinned)?;
    }
    restore_panel_size(app)?;
    restore_puck_position(app)?;

    let menu = tray::setup(app)?;
    app.manage(PuckMenu(menu));
    Ok(())
}

#[tauri::command]
pub fn show_panel(app: AppHandle) -> Result<(), String> {
    perform_panel_action(&app, PanelAction::Show)
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    let is_visible = window(&app, PANEL_LABEL)?
        .is_visible()
        .map_err(safe_window_error)?;
    perform_panel_action(&app, toggle_panel_action(is_visible))
}

pub(crate) const fn toggle_panel_action(is_visible: bool) -> PanelAction {
    if is_visible {
        PanelAction::Hide
    } else {
        PanelAction::Show
    }
}

pub(crate) fn perform_panel_action(app: &AppHandle, action: PanelAction) -> Result<(), String> {
    match action {
        PanelAction::Show => show_panel_for(app),
        PanelAction::Hide => hide_panel_for(app),
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
            if window.label() == PANEL_LABEL {
                let _ = hide_panel_for(window.app_handle());
            } else {
                let _ = window.hide();
            }
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) if window.label() == PANEL_LABEL => {
            let _ = reposition_puck_for_panel(window.app_handle());
        }
        WindowEvent::ScaleFactorChanged {
            scale_factor,
            new_inner_size,
            ..
        } if window.label() == PANEL_LABEL => {
            let _ = reflow_panel_after_scale_change(
                window.app_handle(),
                *scale_factor,
                *new_inner_size,
            );
        }
        _ => {}
    }
}

pub(crate) fn show_panel_for(app: &AppHandle) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    if panel.is_visible().map_err(safe_window_error)? {
        let _ = panel.unminimize();
        let _ = panel.set_focus();
        return Ok(());
    }
    let corner = position_panel(app).unwrap_or_else(|error| {
        eprintln!("RepoPuck could not reposition the panel: {error}");
        current_dock_corner(app).unwrap_or(DockCorner::TopLeft)
    });
    let _ = panel.unminimize();
    // Prepare the hidden WebView with the correct transform origin before the
    // native window becomes visible, avoiding a fully-rendered flash.
    let _ = panel.emit(PANEL_OPENED_EVENT, corner.as_str());
    panel.show().map_err(safe_window_error)?;
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, true);
    let _ = panel.set_focus();
    Ok(())
}

pub(crate) fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    show_panel_for(app)?;
    window(app, PANEL_LABEL)?
        .emit("open_settings_requested", ())
        .map_err(|_| "Could not open settings".to_owned())
}

fn hide_panel_for(app: &AppHandle) -> Result<(), String> {
    save_window_geometry(app);
    let panel = window(app, PANEL_LABEL)?;
    panel.hide().map_err(safe_window_error)?;
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, false);
    Ok(())
}

pub(crate) fn request_refresh(app: &AppHandle) -> Result<(), String> {
    app.emit("refresh_requested", ())
        .map_err(|_| "Could not request a refresh".to_owned())
}

fn position_panel(app: &AppHandle) -> Result<DockCorner, String> {
    let puck = window(app, PUCK_LABEL)?;
    let panel = window(app, PANEL_LABEL)?;
    let puck_position = puck.outer_position().map_err(safe_window_error)?;
    let puck_size = puck_content_size(&puck)?;
    let monitor = current_monitor(&puck, app)?;
    let work_area = monitor_rect(&monitor);
    let logical_inner = panel_logical_inner_size(&panel)?;
    let estimated_outer = estimated_outer_size(&panel, logical_inner, monitor.scale_factor())?;
    let puck_rect = Rect::new(
        puck_position.x,
        puck_position.y,
        puck_size.width,
        puck_size.height,
    );
    let provisional = panel_placement(puck_rect, estimated_outer, work_area);
    set_window_position_if_changed(&panel, provisional.position)?;

    // Moving a hidden window between monitors may change its DPI and native
    // frame. Size it in the target monitor's physical pixels, then measure the
    // real outer bounds before choosing the final placement.
    let actual_outer =
        fit_panel_inner_to_work_area(&panel, logical_inner, monitor.scale_factor(), work_area)?;
    let placement = panel_placement(puck_rect, actual_outer, work_area);
    set_window_position_if_changed(&panel, placement.position)?;
    set_dock_corner(app, placement.corner);
    Ok(placement.corner)
}

fn estimated_outer_size(
    panel: &WebviewWindow,
    logical_inner: LogicalSize<f64>,
    target_scale: f64,
) -> Result<Size, String> {
    let current_scale = panel.scale_factor().map_err(safe_window_error)?;
    let inner = panel.inner_size().map_err(safe_window_error)?;
    let outer = panel.outer_size().map_err(safe_window_error)?;
    let frame = window_frame_size(
        Size::new(outer.width, outer.height),
        Size::new(inner.width, inner.height),
    );
    let logical_frame =
        PhysicalSize::new(frame.width, frame.height).to_logical::<f64>(current_scale);
    let target_frame = logical_frame.to_physical::<u32>(target_scale);
    let target_inner = logical_inner.to_physical::<u32>(target_scale);

    Ok(Size::new(
        target_inner.width.saturating_add(target_frame.width),
        target_inner.height.saturating_add(target_frame.height),
    ))
}

fn fit_panel_inner_to_work_area(
    panel: &WebviewWindow,
    logical_inner: LogicalSize<f64>,
    target_scale: f64,
    work_area: Rect,
) -> Result<Size, String> {
    let current_inner = panel.inner_size().map_err(safe_window_error)?;
    let current_outer = panel.outer_size().map_err(safe_window_error)?;
    let frame = window_frame_size(
        Size::new(current_outer.width, current_outer.height),
        Size::new(current_inner.width, current_inner.height),
    );
    let desired_inner = logical_inner.to_physical::<u32>(target_scale);
    let fitted_inner = fit_window_inner_size(
        Size::new(desired_inner.width, desired_inner.height),
        frame,
        Size::new(work_area.width, work_area.height),
    );
    if fitted_inner != Size::new(current_inner.width, current_inner.height) {
        panel
            .set_size(PhysicalSize::new(fitted_inner.width, fitted_inner.height))
            .map_err(safe_window_error)?;
    }

    let actual_outer = panel.outer_size().map_err(safe_window_error)?;
    Ok(Size::new(actual_outer.width, actual_outer.height))
}

fn reflow_panel_after_scale_change(
    app: &AppHandle,
    scale_factor: f64,
    new_inner_size: PhysicalSize<u32>,
) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    if !panel.is_visible().map_err(safe_window_error)? {
        return Ok(());
    }
    let monitor = current_monitor(&panel, app)?;
    let work_area = monitor_rect(&monitor);
    let raw_logical = new_inner_size.to_logical::<f64>(scale_factor);
    let (width, height) = clamp_panel_size(raw_logical.width, raw_logical.height);
    let actual_outer = fit_panel_inner_to_work_area(
        &panel,
        LogicalSize::new(width, height),
        scale_factor,
        work_area,
    )?;
    let current = panel.outer_position().map_err(safe_window_error)?;
    let clamped = clamp_window_position(
        Rect::new(
            current.x,
            current.y,
            actual_outer.width,
            actual_outer.height,
        ),
        work_area,
    );
    set_window_position_if_changed(&panel, clamped)?;
    reposition_puck_for_panel(app)
}

fn reposition_puck_for_panel(app: &AppHandle) -> Result<(), String> {
    let Some(corner) = current_dock_corner(app) else {
        return Ok(());
    };
    let puck = window(app, PUCK_LABEL)?;
    let panel = window(app, PANEL_LABEL)?;
    if !panel.is_visible().map_err(safe_window_error)? {
        return Ok(());
    }
    let mut panel_position = panel.outer_position().map_err(safe_window_error)?;
    let panel_size = panel.outer_size().map_err(safe_window_error)?;
    let puck_size = puck_content_size(&puck)?;
    let monitor = current_monitor(&panel, app)?;
    let work_area = monitor_rect(&monitor);
    let clamped_panel_position = clamp_window_position(
        Rect::new(
            panel_position.x,
            panel_position.y,
            panel_size.width,
            panel_size.height,
        ),
        work_area,
    );
    if set_window_position_if_changed(&panel, clamped_panel_position)? {
        panel_position = PhysicalPosition::new(clamped_panel_position.x, clamped_panel_position.y);
    }
    let position = puck_position(
        Rect::new(
            panel_position.x,
            panel_position.y,
            panel_size.width,
            panel_size.height,
        ),
        Size::new(puck_size.width, puck_size.height),
        corner,
        work_area,
    );
    set_window_position_if_changed(&puck, position).map(|_| ())
}

fn set_window_position_if_changed(window: &WebviewWindow, position: Point) -> Result<bool, String> {
    let current = window.outer_position().map_err(safe_window_error)?;
    if current.x == position.x && current.y == position.y {
        return Ok(false);
    }
    window
        .set_position(PhysicalPosition::new(position.x, position.y))
        .map_err(safe_window_error)?;
    Ok(true)
}

fn set_dock_corner(app: &AppHandle, corner: DockCorner) {
    if let Ok(mut current) = app.state::<ShellState>().dock_corner.lock() {
        *current = Some(corner);
    }
}

fn current_dock_corner(app: &AppHandle) -> Option<DockCorner> {
    app.state::<ShellState>()
        .dock_corner
        .lock()
        .ok()
        .and_then(|current| *current)
}

fn save_puck_position_for(app: &AppHandle) -> Result<(), String> {
    persist_puck_position_for(app)?;
    let panel = window(app, PANEL_LABEL)?;
    if panel.is_visible().map_err(safe_window_error)? {
        position_panel(app)?;
    }
    Ok(())
}

fn persist_puck_position_for(app: &AppHandle) -> Result<(), String> {
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

fn save_panel_size_for(app: &AppHandle) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    let logical = panel_logical_inner_size(&panel)?;
    let (width, height) = (logical.width, logical.height);
    let value = serde_json::to_value(PersistedPanelSize { width, height })
        .map_err(|_| "Could not save the panel size".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set("panelSize", value);
    store.save().map_err(safe_store_error)
}

fn panel_logical_inner_size(panel: &WebviewWindow) -> Result<LogicalSize<f64>, String> {
    let scale_factor = panel.scale_factor().map_err(safe_window_error)?;
    let logical = panel
        .inner_size()
        .map_err(safe_window_error)?
        .to_logical::<f64>(scale_factor);
    let (width, height) = clamp_panel_size(logical.width, logical.height);
    Ok(LogicalSize::new(width, height))
}

pub(crate) fn save_window_geometry(app: &AppHandle) {
    if let Err(error) = save_panel_size_for(app) {
        eprintln!("RepoPuck could not save the panel size: {error}");
    }
    if let Err(error) = persist_puck_position_for(app) {
        eprintln!("RepoPuck could not save the puck position: {error}");
    }
}

fn restore_panel_size(app: &App) -> Result<(), String> {
    let panel = app
        .get_webview_window(PANEL_LABEL)
        .ok_or_else(|| "The panel window is unavailable".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    let Some(saved) = store
        .get("panelSize")
        .and_then(|value| serde_json::from_value::<PersistedPanelSize>(value).ok())
    else {
        return Ok(());
    };
    let (width, height) = clamp_panel_size(saved.width, saved.height);
    panel
        .set_size(LogicalSize::new(width, height))
        .map_err(safe_window_error)
}

fn clamp_panel_size(width: f64, height: f64) -> (f64, f64) {
    (
        width.clamp(PANEL_MIN_WIDTH, PANEL_MAX_WIDTH),
        height.clamp(PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT),
    )
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
    let visual_size = puck_content_size_for_scale(monitor.scale_factor());
    let relative = saved
        .map(|position| Point::new(position.x, position.y))
        .unwrap_or_else(|| default_relative_position(visual_size, work_area));
    let position = restore_relative_position(relative, visual_size, work_area);
    set_window_position_if_changed(&puck, position).map(|_| ())
}

fn puck_content_size(puck: &WebviewWindow) -> Result<Size, String> {
    let scale_factor = puck.scale_factor().map_err(safe_window_error)?;
    Ok(puck_content_size_for_scale(scale_factor))
}

fn puck_content_size_for_scale(scale_factor: f64) -> Size {
    let physical =
        LogicalSize::new(PUCK_LOGICAL_SIZE, PUCK_LOGICAL_SIZE).to_physical::<u32>(scale_factor);
    Size::new(physical.width, physical.height)
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
    use super::{
        clamp_panel_size, puck_content_size_for_scale, Size, PANEL_MAX_HEIGHT, PANEL_MAX_WIDTH,
    };

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

    #[test]
    fn panel_can_query_native_visibility_for_polling_control() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/panel.json"))
                .expect("valid panel capability");
        let permissions = capability["permissions"]
            .as_array()
            .expect("permission array");

        assert!(permissions
            .iter()
            .any(|permission| permission == "core:window:allow-is-visible"));
        assert!(permissions
            .iter()
            .any(|permission| permission == "core:window:allow-start-resize-dragging"));
    }

    #[test]
    fn panel_has_bounded_resizable_dimensions() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("valid config");
        let panel = config["app"]["windows"]
            .as_array()
            .expect("window array")
            .iter()
            .find(|window| window["label"] == "panel")
            .expect("panel window");

        assert_eq!(panel["resizable"], true);
        assert_eq!(panel["minWidth"], 360);
        assert_eq!(panel["minHeight"], 560);
        assert_eq!(panel["maxWidth"], 720);
        assert_eq!(panel["maxHeight"], 960);
        assert_eq!(panel["maximizable"], false);
        assert_eq!(panel["minimizable"], false);
    }

    #[test]
    fn restored_panel_dimensions_are_clamped_to_supported_bounds() {
        assert_eq!(clamp_panel_size(200.0, 400.0), (360.0, 560.0));
        assert_eq!(
            clamp_panel_size(900.0, 1_200.0),
            (PANEL_MAX_WIDTH, PANEL_MAX_HEIGHT)
        );
        assert_eq!(clamp_panel_size(512.0, 800.0), (512.0, 800.0));
    }

    #[test]
    fn puck_geometry_uses_visible_content_instead_of_the_windows_minimum_frame() {
        assert_eq!(puck_content_size_for_scale(1.0), Size::new(58, 58));
        assert_eq!(puck_content_size_for_scale(1.75), Size::new(102, 102));
    }
}
