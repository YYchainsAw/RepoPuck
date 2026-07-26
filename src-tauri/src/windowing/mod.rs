pub mod drawer;
pub mod i18n;
pub mod position;
pub mod settings;
pub mod state;
pub mod tray;

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::{collections::HashMap, time::Duration, time::Instant};

use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Emitter, Listener, LogicalSize, Manager, Monitor, PhysicalPosition,
    PhysicalSize, WebviewWindow, Window, WindowEvent, Wry,
};
use tauri_plugin_store::StoreExt;

use self::position::{
    anchored_top_position, clamp_window_position, dock_safe_panel_work_area, fit_window_inner_size,
    horizontal_anchor_for_position, normalize_horizontal_anchor, panel_placement, puck_position,
    restore_relative_position, top_center_position, window_frame_size, work_area_below_anchor,
    DockCorner, Point, Rect, Size,
};
use self::state::{
    should_restore_panel_after_mode_change, stable_panel_phase, PanelIntent, PanelPhase,
    PhaseTransition, ShellMode, ShellRuntime, ShellSnapshot,
};

pub(crate) const PANEL_LABEL: &str = "panel";
pub(crate) const PUCK_LABEL: &str = "puck";
const PANEL_VISIBILITY_EVENT: &str = "panel_visibility_changed";
const PANEL_OPENED_EVENT: &str = "panel_opened";
const SHELL_STATE_EVENT: &str = "shell_state_changed";
const PANEL_TRANSITION_EVENT: &str = "panel_transition";
const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_PUCK_MARGIN: i32 = 24;
const PUCK_LOGICAL_SIZE: f64 = 58.0;
const ISLAND_LOGICAL_WIDTH: f64 = 260.0;
const ISLAND_LOGICAL_HEIGHT: f64 = 52.0;
const ISLAND_TOP_OFFSET: f64 = 0.0;
const PANEL_MIN_WIDTH: f64 = 360.0;
const PANEL_MIN_HEIGHT: f64 = 560.0;
const PANEL_MAX_WIDTH: f64 = 720.0;
const PANEL_MAX_HEIGHT: f64 = 960.0;
const PUCK_TRANSITION_MS: u64 = 160;
const ISLAND_TRANSITION_MS: u64 = 180;
const DRAWER_TRANSITION_MS: u64 = 220;
const TRANSITION_FALLBACK_GRACE_MS: u64 = 100;
const DEFAULT_DRAWER_ANCHOR: f64 = 0.5;

#[derive(Default)]
pub struct ShellState {
    pinned: AtomicBool,
    runtime: Mutex<ShellRuntime>,
    drawer_shutdown: AtomicBool,
}

pub struct PuckMenu {
    pub(crate) menu: tauri::menu::Menu<Wry>,
    pub(crate) open_panel: tauri::menu::MenuItem<Wry>,
    pub(crate) refresh: tauri::menu::MenuItem<Wry>,
    pub(crate) settings: tauri::menu::MenuItem<Wry>,
    pub(crate) quit: tauri::menu::MenuItem<Wry>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PanelAction {
    Show,
    Hide,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum TransitionDirection {
    Open,
    Close,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum TransitionAnimation {
    CornerScale,
    IslandDrop,
    DrawerRoll,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PanelTransitionPayload {
    transition_id: u64,
    mode: ShellMode,
    direction: TransitionDirection,
    animation: TransitionAnimation,
    anchor: String,
    duration_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPuckPosition {
    monitor_name: Option<String>,
    x: i32,
    y: i32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPanelSize {
    width: f64,
    height: f64,
}

#[derive(Clone, Debug)]
struct ModeSwitchRollback {
    mode: ShellMode,
    panel_visible: bool,
    panel_focused: bool,
    launcher_visible: bool,
    panel_size: PersistedPanelSize,
    dock_corner: Option<DockCorner>,
    active_monitor_name: Option<String>,
    drawer_anchors: HashMap<String, f64>,
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store(SETTINGS_FILE)?;
    let mut panel_sizes = decode_panel_sizes(store.get("panelSizes"));
    if !panel_sizes.contains_key(ShellMode::Puck.key()) {
        if let Some(legacy) = store
            .get("panelSize")
            .and_then(|value| serde_json::from_value::<PersistedPanelSize>(value).ok())
        {
            panel_sizes.insert(ShellMode::Puck.key().to_owned(), legacy);
            store.set("panelSizes", serde_json::to_value(panel_sizes)?);
            store.save()?;
        }
    }
    let pinned = store
        .get("pinned")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    app.state::<ShellState>()
        .pinned
        .store(pinned, Ordering::Relaxed);
    let mode = store
        .get("shellMode")
        .and_then(|value| serde_json::from_value::<ShellMode>(value).ok())
        .unwrap_or_default();
    let top_monitor_name = store
        .get("topSurfaceMonitorName")
        .and_then(|value| value.as_str().map(ToOwned::to_owned));
    let drawer_anchors = decode_drawer_anchors(store.get("drawerAnchors"));
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.mode = mode;
        runtime.active_monitor_name = top_monitor_name;
        runtime.drawer_anchors = drawer_anchors;
    }
    if let Some(activation) = crate::project_activation::initial_repository_activation() {
        crate::project_activation::schedule_activation(app.handle(), activation);
    } else if let Some(path) = store
        .get("recentRepositories")
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .and_then(|recent| recent.into_iter().next())
        .map(Into::into)
    {
        let intent = app
            .state::<crate::commands::RepositoryState>()
            .reserve_selection();
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let repository_state = app_handle.state::<crate::commands::RepositoryState>();
            if repository_state
                .restore_if_empty_reserved(path, intent)
                .unwrap_or(false)
            {
                let _ = request_refresh(&app_handle);
            }
        });
    }

    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        panel.set_always_on_top(effective_panel_pinned(mode, pinned))?;
    }
    restore_panel_size(app, mode)?;
    configure_launcher(app, mode)?;

    let menu = tray::setup(app)?;
    app.manage(menu);
    let language_app = app.handle().clone();
    app.listen("interface_language_changed", move |event| {
        let Some(payload) = i18n::parse_language_changed(event.payload()) else {
            return;
        };
        let language = i18n::language_from_tag(&payload.resolved);
        let _ = i18n::persist_preference(&language_app, &payload.preference);
        let _ = tray::set_language(&language_app, language);
    });
    drawer::start(app.handle().clone());
    Ok(())
}

#[tauri::command]
pub fn get_shell_state(app: AppHandle) -> Result<ShellSnapshot, String> {
    shell_snapshot(&app)
}

#[tauri::command]
pub fn set_shell_mode(app: AppHandle, mode: ShellMode) -> Result<ShellSnapshot, String> {
    set_shell_mode_for(&app, mode)
}

#[tauri::command]
pub fn complete_panel_transition(app: AppHandle, transition_id: u64) -> Result<(), String> {
    complete_panel_transition_for(&app, transition_id)
}

#[tauri::command]
pub fn show_panel(app: AppHandle) -> Result<(), String> {
    perform_panel_action(&app, PanelAction::Show)
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    perform_panel_intent(&app, PanelIntent::Toggle)
}

#[cfg(test)]
pub(crate) const fn toggle_panel_action(is_visible: bool) -> PanelAction {
    if is_visible {
        PanelAction::Hide
    } else {
        PanelAction::Show
    }
}

pub(crate) fn perform_panel_action(app: &AppHandle, action: PanelAction) -> Result<(), String> {
    perform_panel_intent(
        app,
        match action {
            PanelAction::Show => PanelIntent::Show,
            PanelAction::Hide => PanelIntent::Hide,
        },
    )
}

#[tauri::command]
pub fn set_panel_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    app.state::<ShellState>()
        .pinned
        .store(pinned, Ordering::Relaxed);
    let mode = shell_mode(&app);
    window(&app, PANEL_LABEL)?
        .set_always_on_top(effective_panel_pinned(mode, pinned))
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
    window.popup_menu(&menu.menu).map_err(safe_window_error)
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
        WindowEvent::Moved(_) if window.label() == PANEL_LABEL => {
            let app = window.app_handle();
            if shell_mode(app) == ShellMode::TopDrawer {
                let _ = constrain_and_track_drawer_panel(app);
            } else {
                let _ = reposition_surfaces_for_panel(app);
            }
        }
        WindowEvent::Resized(_) if window.label() == PANEL_LABEL => {
            let _ = reposition_surfaces_for_panel(window.app_handle());
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
        WindowEvent::ScaleFactorChanged { .. }
            if window.label() == PUCK_LABEL
                && shell_mode(window.app_handle()) == ShellMode::TopIsland =>
        {
            let _ = position_island_launcher(window.app_handle());
            let _ = reposition_top_panel(window.app_handle(), ShellMode::TopIsland);
        }
        _ => {}
    }
}

pub(crate) fn show_panel_for(app: &AppHandle) -> Result<(), String> {
    perform_panel_intent(app, PanelIntent::Show)
}

pub(crate) fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    show_panel_for(app)?;
    window(app, PANEL_LABEL)?
        .emit("open_settings_requested", ())
        .map_err(|_| "Could not open settings".to_owned())
}

fn hide_panel_for(app: &AppHandle) -> Result<(), String> {
    perform_panel_action(app, PanelAction::Hide)
}

fn perform_panel_intent(app: &AppHandle, intent: PanelIntent) -> Result<(), String> {
    perform_panel_intent_with_focus(app, intent, true)
}

fn perform_panel_intent_with_focus(
    app: &AppHandle,
    intent: PanelIntent,
    focus_on_open: bool,
) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    let native_visible_before = panel.is_visible().map_err(safe_window_error)?;
    let transition = {
        let state = app.state::<ShellState>();
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "RepoPuck could not update its window state".to_owned())?;
        runtime.apply_intent(intent)
    };
    let Some(transition) = transition else {
        if intent == PanelIntent::Show && focus_on_open {
            let _ = panel.unminimize();
            let _ = panel.set_focus();
        }
        return Ok(());
    };

    let result = match transition.phase {
        PanelPhase::Opening => begin_panel_open(app, &panel, transition, focus_on_open),
        PanelPhase::Closing => begin_panel_close(app, &panel, transition),
        PanelPhase::Hidden | PanelPhase::Open => Ok(()),
    };
    if let Err(error) = result {
        stabilize_transition_after_error(
            app,
            &panel,
            transition.transition_id,
            native_visible_before,
        );
        return Err(error);
    }
    Ok(())
}

fn begin_panel_open(
    app: &AppHandle,
    panel: &WebviewWindow,
    transition: PhaseTransition,
    focus_on_open: bool,
) -> Result<(), String> {
    let mode = shell_mode(app);
    position_panel_for_mode(app, mode)?;
    panel
        .set_always_on_top(effective_panel_pinned(
            mode,
            app.state::<ShellState>().pinned.load(Ordering::Relaxed),
        ))
        .map_err(safe_window_error)?;
    let payload = transition_payload(app, transition.transition_id, TransitionDirection::Open)?;

    // Preserve the old event for the existing corner animation while the
    // frontend migrates to the richer transition payload.
    if mode == ShellMode::Puck {
        if let Some(corner) = current_dock_corner(app) {
            let _ = panel.emit(PANEL_OPENED_EVENT, corner.as_str());
        }
    }
    let _ = panel.emit(PANEL_TRANSITION_EVENT, &payload);
    let _ = panel.unminimize();
    panel.show().map_err(safe_window_error)?;
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, true);
    if focus_on_open {
        let _ = panel.set_focus();
    }
    emit_shell_state(app);
    schedule_transition_fallback(app, transition.transition_id, payload.duration_ms);
    Ok(())
}

fn begin_panel_close(
    app: &AppHandle,
    panel: &WebviewWindow,
    transition: PhaseTransition,
) -> Result<(), String> {
    save_window_geometry(app);
    if !panel.is_visible().map_err(safe_window_error)? {
        return complete_panel_transition_for(app, transition.transition_id);
    }
    let payload = transition_payload(app, transition.transition_id, TransitionDirection::Close)?;
    let _ = panel.emit(PANEL_TRANSITION_EVENT, &payload);
    emit_shell_state(app);
    schedule_transition_fallback(app, transition.transition_id, payload.duration_ms);
    Ok(())
}

fn transition_payload(
    app: &AppHandle,
    transition_id: u64,
    direction: TransitionDirection,
) -> Result<PanelTransitionPayload, String> {
    let snapshot = shell_snapshot(app)?;
    let (animation, anchor, duration_ms) = match snapshot.mode {
        ShellMode::Puck => (
            TransitionAnimation::CornerScale,
            snapshot
                .dock_corner
                .unwrap_or_else(|| DockCorner::TopLeft.as_str().to_owned()),
            PUCK_TRANSITION_MS,
        ),
        ShellMode::TopIsland => (
            TransitionAnimation::IslandDrop,
            "top-center".to_owned(),
            ISLAND_TRANSITION_MS,
        ),
        ShellMode::TopDrawer => (
            TransitionAnimation::DrawerRoll,
            "top-center".to_owned(),
            DRAWER_TRANSITION_MS,
        ),
    };
    Ok(PanelTransitionPayload {
        transition_id,
        mode: snapshot.mode,
        direction,
        animation,
        anchor,
        duration_ms,
    })
}

fn schedule_transition_fallback(app: &AppHandle, transition_id: u64, duration_ms: u64) {
    let dispatch_app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(
            duration_ms.saturating_add(TRANSITION_FALLBACK_GRACE_MS),
        ))
        .await;
        let callback_app = dispatch_app.clone();
        let _ = dispatch_app.run_on_main_thread(move || {
            let _ = complete_panel_transition_for(&callback_app, transition_id);
        });
    });
}

fn complete_panel_transition_for(app: &AppHandle, transition_id: u64) -> Result<(), String> {
    let completed = {
        let state = app.state::<ShellState>();
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "RepoPuck could not update its window state".to_owned())?;
        runtime.complete_transition(transition_id)
    };
    match completed {
        Some(PanelPhase::Hidden) => {
            let panel = window(app, PANEL_LABEL)?;
            if let Err(error) = panel.hide() {
                stabilize_transition_after_error(app, &panel, transition_id, true);
                return Err(safe_window_error(error));
            }
            let _ = panel.emit(PANEL_VISIBILITY_EVENT, false);
            emit_shell_state(app);
        }
        Some(PanelPhase::Open) => emit_shell_state(app),
        _ => {}
    }
    Ok(())
}

fn stabilize_transition_after_error(
    app: &AppHandle,
    panel: &WebviewWindow,
    transition_id: u64,
    fallback_visible: bool,
) {
    let visible = panel.is_visible().unwrap_or(fallback_visible);
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        if runtime.transition_id == transition_id {
            runtime.phase = stable_panel_phase(visible);
        }
    }
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, visible);
    emit_shell_state(app);
}

pub(crate) fn request_refresh(app: &AppHandle) -> Result<(), String> {
    app.emit("refresh_requested", ())
        .map_err(|_| "Could not request a refresh".to_owned())
}

fn shell_snapshot(app: &AppHandle) -> Result<ShellSnapshot, String> {
    app.state::<ShellState>()
        .runtime
        .lock()
        .map(|runtime| runtime.snapshot())
        .map_err(|_| "RepoPuck could not read its window state".to_owned())
}

fn shell_mode(app: &AppHandle) -> ShellMode {
    app.state::<ShellState>()
        .runtime
        .lock()
        .map(|runtime| runtime.mode)
        .unwrap_or_default()
}

fn emit_shell_state(app: &AppHandle) {
    if let Ok(snapshot) = shell_snapshot(app) {
        let _ = app.emit(SHELL_STATE_EVENT, snapshot);
    }
}

fn effective_panel_pinned(mode: ShellMode, pinned: bool) -> bool {
    mode != ShellMode::Puck || pinned
}

fn set_shell_mode_for(app: &AppHandle, mode: ShellMode) -> Result<ShellSnapshot, String> {
    let rollback = capture_mode_switch_rollback(app)?;
    if rollback.mode == mode {
        return shell_snapshot(app);
    }
    save_window_geometry(app);
    let panel = window(app, PANEL_LABEL)?;
    let should_restore =
        should_restore_panel_after_mode_change(panel_phase(app), rollback.panel_visible);

    let result = apply_shell_mode_change(app, &panel, mode, should_restore);
    if let Err(error) = result {
        let rollback_error = rollback_shell_mode_change(app, &panel, &rollback).err();
        return Err(match rollback_error {
            Some(rollback_error) => {
                format!("{error}; RepoPuck also could not fully restore the previous mode: {rollback_error}")
            }
            None => error,
        });
    }
    shell_snapshot(app)
}

fn capture_mode_switch_rollback(app: &AppHandle) -> Result<ModeSwitchRollback, String> {
    let panel = window(app, PANEL_LABEL)?;
    let launcher = window(app, PUCK_LABEL)?;
    let panel_size = panel_logical_inner_size(&panel)?;
    let (mode, dock_corner, active_monitor_name, drawer_anchors) = {
        let state = app.state::<ShellState>();
        let runtime = state
            .runtime
            .lock()
            .map_err(|_| "RepoPuck could not read its window state".to_owned())?;
        (
            runtime.mode,
            runtime.dock_corner,
            runtime.active_monitor_name.clone(),
            runtime.drawer_anchors.clone(),
        )
    };
    Ok(ModeSwitchRollback {
        mode,
        panel_visible: panel.is_visible().map_err(safe_window_error)?,
        panel_focused: panel.is_focused().map_err(safe_window_error)?,
        launcher_visible: launcher.is_visible().map_err(safe_window_error)?,
        panel_size: PersistedPanelSize {
            width: panel_size.width,
            height: panel_size.height,
        },
        dock_corner,
        active_monitor_name,
        drawer_anchors,
    })
}

fn apply_shell_mode_change(
    app: &AppHandle,
    panel: &WebviewWindow,
    mode: ShellMode,
    should_restore: bool,
) -> Result<(), String> {
    panel.hide().map_err(safe_window_error)?;
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, false);

    {
        let state = app.state::<ShellState>();
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "RepoPuck could not update its window state".to_owned())?;
        runtime.change_mode(mode);
    }
    persist_shell_mode(app, mode)?;
    restore_panel_size_for_handle(app, mode)?;
    panel
        .set_always_on_top(effective_panel_pinned(
            mode,
            app.state::<ShellState>().pinned.load(Ordering::Relaxed),
        ))
        .map_err(safe_window_error)?;
    configure_launcher_for_handle(app, mode)?;
    emit_shell_state(app);
    if should_restore {
        perform_panel_intent_with_focus(app, PanelIntent::Show, true)?;
    }
    Ok(())
}

fn persist_shell_mode(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set(
        "shellMode",
        serde_json::to_value(mode).map_err(|_| "Could not save the shell mode".to_owned())?,
    );
    store.save().map_err(safe_store_error)
}

fn rollback_shell_mode_change(
    app: &AppHandle,
    panel: &WebviewWindow,
    rollback: &ModeSwitchRollback,
) -> Result<(), String> {
    let mut errors = Vec::new();
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.restore_mode_after_failed_change(
            rollback.mode,
            rollback.panel_visible,
            rollback.dock_corner,
            rollback.active_monitor_name.clone(),
            rollback.drawer_anchors.clone(),
        );
    } else {
        errors.push("could not restore the native state".to_owned());
    }

    if let Err(error) = persist_shell_mode(app, rollback.mode) {
        errors.push(error);
    }
    if let Err(error) = panel.set_size(LogicalSize::new(
        rollback.panel_size.width,
        rollback.panel_size.height,
    )) {
        errors.push(safe_window_error(error));
    }
    if let Err(error) = panel.set_always_on_top(effective_panel_pinned(
        rollback.mode,
        app.state::<ShellState>().pinned.load(Ordering::Relaxed),
    )) {
        errors.push(safe_window_error(error));
    }
    if let Err(error) = configure_launcher_for_handle(app, rollback.mode) {
        errors.push(error);
    } else if !rollback.launcher_visible {
        if let Ok(launcher) = window(app, PUCK_LABEL) {
            if let Err(error) = launcher.hide() {
                errors.push(safe_window_error(error));
            }
        }
    }

    if rollback.panel_visible {
        if let Err(error) = position_panel_for_mode(app, rollback.mode) {
            errors.push(error);
        }
        if let Err(error) = panel.show() {
            errors.push(safe_window_error(error));
        } else if rollback.panel_focused {
            let _ = panel.set_focus();
        }
    } else if let Err(error) = panel.hide() {
        errors.push(safe_window_error(error));
    }

    let actual_visible = match panel.is_visible() {
        Ok(visible) => visible,
        Err(error) => {
            errors.push(safe_window_error(error));
            rollback.panel_visible
        }
    };
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.phase = stable_panel_phase(actual_visible);
    } else {
        errors.push("could not stabilize the restored native state".to_owned());
    }
    let _ = panel.emit(PANEL_VISIBILITY_EVENT, actual_visible);
    emit_shell_state(app);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn position_panel_for_mode(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    match mode {
        ShellMode::Puck => position_puck_panel(app).map(|_| ()),
        ShellMode::TopIsland | ShellMode::TopDrawer => position_top_panel(app, mode),
    }
}

fn position_puck_panel(app: &AppHandle) -> Result<DockCorner, String> {
    let puck = window(app, PUCK_LABEL)?;
    let panel = window(app, PANEL_LABEL)?;
    let puck_position = puck.outer_position().map_err(safe_window_error)?;
    let puck_size = puck_content_size(&puck)?;
    let monitor = current_monitor(&puck, app)?;
    set_active_monitor(app, monitor.name().cloned());
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
    let provisional_work_area = dock_safe_panel_work_area(work_area, puck_size, provisional.corner);
    let actual_outer = fit_panel_inner_to_work_area(
        &panel,
        logical_inner,
        monitor.scale_factor(),
        provisional_work_area,
    )?;
    let placement = panel_placement(puck_rect, actual_outer, work_area);
    let final_work_area = dock_safe_panel_work_area(work_area, puck_size, placement.corner);
    let final_position = clamp_window_position(
        Rect::new(
            placement.position.x,
            placement.position.y,
            actual_outer.width,
            actual_outer.height,
        ),
        final_work_area,
    );
    set_window_position_if_changed(&panel, final_position)?;
    set_dock_corner(app, placement.corner);
    Ok(placement.corner)
}

fn position_top_panel(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    let monitor = top_surface_monitor(app, &panel)?;
    set_active_monitor(app, monitor.name().cloned());
    persist_top_monitor_name(app, monitor.name().cloned())?;
    let work_area = monitor_rect(&monitor);
    let panel_work_area = match mode {
        ShellMode::TopIsland => {
            let island = position_island_launcher_on_monitor(app, &monitor)?;
            work_area_below_anchor(work_area, island)
        }
        ShellMode::TopDrawer => work_area,
        ShellMode::Puck => return position_puck_panel(app).map(|_| ()),
    };
    let logical_inner = panel_logical_inner_size(&panel)?;
    let estimated_outer = estimated_outer_size(&panel, logical_inner, monitor.scale_factor())?;
    let provisional = top_panel_position(app, mode, estimated_outer, panel_work_area, &monitor);
    set_window_position_if_changed(&panel, provisional)?;
    let actual_outer = fit_panel_inner_to_work_area(
        &panel,
        logical_inner,
        monitor.scale_factor(),
        panel_work_area,
    )?;
    let final_position = top_panel_position(app, mode, actual_outer, panel_work_area, &monitor);
    set_window_position_if_changed(&panel, final_position)?;
    clear_dock_corner(app);
    Ok(())
}

fn reposition_top_panel(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    if !panel.is_visible().map_err(safe_window_error)? {
        return Ok(());
    }
    let monitor = top_surface_monitor(app, &panel)?;
    set_active_monitor(app, monitor.name().cloned());
    let work_area = monitor_rect(&monitor);
    let panel_work_area = match mode {
        ShellMode::TopIsland => {
            let island = position_island_launcher_on_monitor(app, &monitor)?;
            work_area_below_anchor(work_area, island)
        }
        ShellMode::TopDrawer => work_area,
        ShellMode::Puck => return reposition_puck_for_panel(app),
    };
    let outer = panel.outer_size().map_err(safe_window_error)?;
    set_window_position_if_changed(
        &panel,
        top_panel_position(
            app,
            mode,
            Size::new(outer.width, outer.height),
            panel_work_area,
            &monitor,
        ),
    )?;
    Ok(())
}

fn top_panel_position(
    app: &AppHandle,
    mode: ShellMode,
    panel: Size,
    work_area: Rect,
    monitor: &Monitor,
) -> Point {
    if mode == ShellMode::TopDrawer {
        anchored_top_position(panel, work_area, drawer_anchor_for_monitor(app, monitor))
    } else {
        top_center_position(panel, work_area, 0)
    }
}

fn constrain_and_track_drawer_panel(app: &AppHandle) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    let monitor = current_monitor(&panel, app)?;
    let work_area = monitor_rect(&monitor);
    let position = panel.outer_position().map_err(safe_window_error)?;
    let outer = panel.outer_size().map_err(safe_window_error)?;
    let size = Size::new(outer.width, outer.height);
    let anchor =
        horizontal_anchor_for_position(Point::new(position.x, work_area.y), size, work_area);
    let storage_key = monitor_storage_key_for_monitor(&monitor);
    set_active_monitor(app, monitor.name().cloned());
    set_drawer_anchor(app, storage_key, anchor);
    set_window_position_if_changed(&panel, anchored_top_position(size, work_area, anchor))?;
    Ok(())
}

fn position_island_launcher(app: &AppHandle) -> Result<Rect, String> {
    let launcher = window(app, PUCK_LABEL)?;
    let monitor = top_surface_monitor(app, &launcher)?;
    position_island_launcher_on_monitor(app, &monitor)
}

fn position_island_launcher_on_monitor(app: &AppHandle, monitor: &Monitor) -> Result<Rect, String> {
    let launcher = window(app, PUCK_LABEL)?;
    let (visible_size, top_offset) = island_layout_for_scale(monitor.scale_factor());
    let position = top_center_position(visible_size, monitor_rect(monitor), top_offset);

    // Move first so Windows applies the target monitor DPI before the final
    // physical size and position are committed.
    set_window_position_if_changed(&launcher, position)?;
    let current_inner = launcher.inner_size().map_err(safe_window_error)?;
    if current_inner.width != visible_size.width || current_inner.height != visible_size.height {
        launcher
            .set_size(PhysicalSize::new(visible_size.width, visible_size.height))
            .map_err(safe_window_error)?;
    }
    set_window_position_if_changed(&launcher, position)?;
    set_active_monitor(app, monitor.name().cloned());
    Ok(Rect::new(
        position.x,
        position.y,
        visible_size.width,
        visible_size.height,
    ))
}

fn island_layout_for_scale(scale_factor: f64) -> (Size, u32) {
    let visible_size = LogicalSize::new(ISLAND_LOGICAL_WIDTH, ISLAND_LOGICAL_HEIGHT)
        .to_physical::<u32>(scale_factor);
    let top_offset = LogicalSize::new(ISLAND_TOP_OFFSET, 0.0)
        .to_physical::<u32>(scale_factor)
        .width;
    (
        Size::new(visible_size.width, visible_size.height),
        top_offset,
    )
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
    let mode = shell_mode(app);
    if mode != ShellMode::Puck {
        return position_top_panel(app, mode);
    }
    let monitor = current_monitor(&panel, app)?;
    let work_area = monitor_rect(&monitor);
    let puck = window(app, PUCK_LABEL)?;
    let puck_size = puck_content_size(&puck)?;
    let corner = current_dock_corner(app).unwrap_or(DockCorner::TopLeft);
    let panel_work_area = dock_safe_panel_work_area(work_area, puck_size, corner);
    let raw_logical = new_inner_size.to_logical::<f64>(scale_factor);
    let (width, height) = clamp_panel_size(raw_logical.width, raw_logical.height);
    let actual_outer = fit_panel_inner_to_work_area(
        &panel,
        LogicalSize::new(width, height),
        scale_factor,
        panel_work_area,
    )?;
    let current = panel.outer_position().map_err(safe_window_error)?;
    let clamped = clamp_window_position(
        Rect::new(
            current.x,
            current.y,
            actual_outer.width,
            actual_outer.height,
        ),
        panel_work_area,
    );
    set_window_position_if_changed(&panel, clamped)?;
    reposition_puck_for_panel(app)
}

fn reposition_surfaces_for_panel(app: &AppHandle) -> Result<(), String> {
    match shell_mode(app) {
        ShellMode::Puck => reposition_puck_for_panel(app),
        mode @ (ShellMode::TopIsland | ShellMode::TopDrawer) => reposition_top_panel(app, mode),
    }
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
    let panel_work_area = dock_safe_panel_work_area(work_area, puck_size, corner);
    let clamped_panel_position = clamp_window_position(
        Rect::new(
            panel_position.x,
            panel_position.y,
            panel_size.width,
            panel_size.height,
        ),
        panel_work_area,
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
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.dock_corner = Some(corner);
    }
}

fn clear_dock_corner(app: &AppHandle) {
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.dock_corner = None;
    }
}

fn current_dock_corner(app: &AppHandle) -> Option<DockCorner> {
    app.state::<ShellState>()
        .runtime
        .lock()
        .ok()
        .and_then(|runtime| runtime.dock_corner)
}

fn set_active_monitor(app: &AppHandle, monitor_name: Option<String>) {
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime.active_monitor_name = monitor_name;
    }
}

fn save_puck_position_for(app: &AppHandle) -> Result<(), String> {
    if shell_mode(app) != ShellMode::Puck {
        return Ok(());
    }
    persist_puck_position_for(app)?;
    let panel = window(app, PANEL_LABEL)?;
    if panel.is_visible().map_err(safe_window_error)? {
        position_puck_panel(app)?;
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
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    let mut sizes = decode_panel_sizes(store.get("panelSizes"));
    sizes.insert(
        shell_mode(app).key().to_owned(),
        PersistedPanelSize { width, height },
    );
    store.set(
        "panelSizes",
        serde_json::to_value(sizes).map_err(|_| "Could not save the panel size".to_owned())?,
    );
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
    match shell_mode(app) {
        ShellMode::Puck => {
            if let Err(error) = persist_puck_position_for(app) {
                eprintln!("RepoPuck could not save the puck position: {error}");
            }
        }
        ShellMode::TopIsland | ShellMode::TopDrawer => {
            let monitor_name = shell_snapshot(app)
                .ok()
                .and_then(|snapshot| snapshot.active_monitor_name);
            if let Err(error) = persist_top_monitor_name(app, monitor_name) {
                eprintln!("RepoPuck could not save the top-surface monitor: {error}");
            }
            if shell_mode(app) == ShellMode::TopDrawer {
                if let Err(error) = persist_drawer_anchors(app) {
                    eprintln!("RepoPuck could not save the drawer positions: {error}");
                }
            }
        }
    }
}

fn restore_panel_size(app: &App, mode: ShellMode) -> Result<(), String> {
    let panel = app
        .get_webview_window(PANEL_LABEL)
        .ok_or_else(|| "The panel window is unavailable".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    let saved = panel_size_from_store(
        decode_panel_sizes(store.get("panelSizes")),
        store.get("panelSize"),
        mode,
    );
    let Some(saved) = saved else {
        return Ok(());
    };
    let (width, height) = clamp_panel_size(saved.width, saved.height);
    panel
        .set_size(LogicalSize::new(width, height))
        .map_err(safe_window_error)
}

fn restore_panel_size_for_handle(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    let panel = window(app, PANEL_LABEL)?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    let saved = panel_size_from_store(
        decode_panel_sizes(store.get("panelSizes")),
        store.get("panelSize"),
        mode,
    );
    let Some(saved) = saved else {
        return Ok(());
    };
    let (width, height) = clamp_panel_size(saved.width, saved.height);
    panel
        .set_size(LogicalSize::new(width, height))
        .map_err(safe_window_error)
}

fn decode_panel_sizes(value: Option<serde_json::Value>) -> HashMap<String, PersistedPanelSize> {
    value
        .and_then(|value| serde_json::from_value::<HashMap<String, PersistedPanelSize>>(value).ok())
        .unwrap_or_default()
}

fn panel_size_from_store(
    sizes: HashMap<String, PersistedPanelSize>,
    legacy: Option<serde_json::Value>,
    mode: ShellMode,
) -> Option<PersistedPanelSize> {
    sizes.get(mode.key()).cloned().or_else(|| {
        (mode == ShellMode::Puck)
            .then(|| legacy.and_then(|value| serde_json::from_value(value).ok()))
            .flatten()
    })
}

fn clamp_panel_size(width: f64, height: f64) -> (f64, f64) {
    (
        width.clamp(PANEL_MIN_WIDTH, PANEL_MAX_WIDTH),
        height.clamp(PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT),
    )
}

fn restore_puck_position(app: &AppHandle) -> Result<(), String> {
    let puck = window(app, PUCK_LABEL)?;
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
    set_window_position_if_changed(&puck, position)?;
    let current_inner = puck.inner_size().map_err(safe_window_error)?;
    if current_inner.width != visual_size.width || current_inner.height != visual_size.height {
        puck.set_size(PhysicalSize::new(visual_size.width, visual_size.height))
            .map_err(safe_window_error)?;
    }
    set_window_position_if_changed(&puck, position)?;
    set_active_monitor(app, monitor.name().cloned());
    Ok(())
}

fn configure_launcher(app: &App, mode: ShellMode) -> Result<(), String> {
    configure_launcher_for_handle(app.handle(), mode)
}

fn configure_launcher_for_handle(app: &AppHandle, mode: ShellMode) -> Result<(), String> {
    let launcher = window(app, PUCK_LABEL)?;
    launcher.hide().map_err(safe_window_error)?;
    launcher
        .set_always_on_top(true)
        .map_err(safe_window_error)?;
    match mode {
        ShellMode::Puck => {
            restore_puck_position(app)?;
            launcher.show().map_err(safe_window_error)
        }
        ShellMode::TopIsland => {
            position_island_launcher(app)?;
            persist_top_monitor_name(app, shell_snapshot(app)?.active_monitor_name)?;
            launcher.show().map_err(safe_window_error)
        }
        ShellMode::TopDrawer => Ok(()),
    }
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

fn top_surface_monitor(
    window_app: &AppHandle,
    fallback: &WebviewWindow,
) -> Result<Monitor, String> {
    let preferred_name = shell_snapshot(window_app)?.active_monitor_name;
    let monitors = window_app.available_monitors().map_err(safe_window_error)?;
    preferred_name
        .as_ref()
        .and_then(|name| {
            monitors
                .iter()
                .find(|monitor| monitor.name() == Some(name))
                .cloned()
        })
        .or(fallback.current_monitor().map_err(safe_window_error)?)
        .or(window_app.primary_monitor().map_err(safe_window_error)?)
        .or_else(|| monitors.into_iter().next())
        .ok_or_else(|| "No monitor is available".to_owned())
}

fn persist_top_monitor_name(app: &AppHandle, monitor_name: Option<String>) -> Result<(), String> {
    let Some(monitor_name) = monitor_name else {
        return Ok(());
    };
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set("topSurfaceMonitorName", monitor_name);
    store.save().map_err(safe_store_error)
}

fn persist_drawer_anchors(app: &AppHandle) -> Result<(), String> {
    let anchors = app
        .state::<ShellState>()
        .runtime
        .lock()
        .map(|runtime| runtime.drawer_anchors.clone())
        .map_err(|_| "RepoPuck could not read its drawer positions".to_owned())?;
    let store = app.store(SETTINGS_FILE).map_err(safe_store_error)?;
    store.set(
        "drawerAnchors",
        serde_json::to_value(anchors)
            .map_err(|_| "Could not save the drawer positions".to_owned())?,
    );
    store.save().map_err(safe_store_error)
}

fn decode_drawer_anchors(value: Option<serde_json::Value>) -> HashMap<String, f64> {
    value
        .and_then(|value| serde_json::from_value::<HashMap<String, f64>>(value).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|(key, anchor)| !key.trim().is_empty() && anchor.is_finite())
        .map(|(key, anchor)| (key, normalize_horizontal_anchor(anchor)))
        .collect()
}

fn drawer_anchor_for_monitor(app: &AppHandle, monitor: &Monitor) -> f64 {
    drawer_anchor_for_monitor_key(app, &monitor_storage_key_for_monitor(monitor))
}

pub(crate) fn drawer_anchor_for_monitor_key(app: &AppHandle, key: &str) -> f64 {
    app.state::<ShellState>()
        .runtime
        .lock()
        .ok()
        .and_then(|runtime| runtime.drawer_anchors.get(key).copied())
        .map(normalize_horizontal_anchor)
        .unwrap_or(DEFAULT_DRAWER_ANCHOR)
}

fn set_drawer_anchor(app: &AppHandle, key: String, anchor: f64) {
    if let Ok(mut runtime) = app.state::<ShellState>().runtime.lock() {
        runtime
            .drawer_anchors
            .insert(key, normalize_horizontal_anchor(anchor));
    }
}

pub(crate) fn drawer_is_active(app: &AppHandle) -> bool {
    shell_mode(app) == ShellMode::TopDrawer
        && !app
            .state::<ShellState>()
            .drawer_shutdown
            .load(Ordering::Relaxed)
}

pub(crate) fn drawer_shutdown_requested(app: &AppHandle) -> bool {
    app.state::<ShellState>()
        .drawer_shutdown
        .load(Ordering::Relaxed)
}

pub(crate) fn request_drawer_shutdown(app: &AppHandle) {
    app.state::<ShellState>()
        .drawer_shutdown
        .store(true, Ordering::Relaxed);
}

pub(crate) fn panel_phase(app: &AppHandle) -> PanelPhase {
    app.state::<ShellState>()
        .runtime
        .lock()
        .map(|runtime| runtime.phase)
        .unwrap_or_default()
}

pub(crate) fn drawer_hover_intent(
    app: &AppHandle,
    now: Instant,
    in_hot_zone: bool,
    in_panel: bool,
) -> Option<PanelIntent> {
    let state = app.state::<ShellState>();
    let mut runtime = state.runtime.lock().ok()?;
    if runtime.mode != ShellMode::TopDrawer {
        runtime.drawer_hover.reset();
        return None;
    }
    let phase = runtime.phase;
    runtime
        .drawer_hover
        .update(now, in_hot_zone, in_panel, phase)
}

pub(crate) fn perform_drawer_intent(
    app: &AppHandle,
    intent: PanelIntent,
    monitor_name: Option<String>,
) -> Result<(), String> {
    if shell_mode(app) != ShellMode::TopDrawer {
        return Ok(());
    }
    if intent == PanelIntent::Show {
        if let Some(name) = monitor_name {
            set_active_monitor(app, Some(name.clone()));
            persist_top_monitor_name(app, Some(name))?;
        }
    }
    perform_panel_intent_with_focus(app, intent, false)
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

fn monitor_bounds_rect(monitor: &Monitor) -> Rect {
    let position = monitor.position();
    let size = monitor.size();
    Rect::new(position.x, position.y, size.width, size.height)
}

fn monitor_storage_key_for_monitor(monitor: &Monitor) -> String {
    monitor_storage_key(
        monitor.name().map(String::as_str),
        monitor_bounds_rect(monitor),
    )
}

pub(crate) fn monitor_storage_key(name: Option<&str>, bounds: Rect) -> String {
    name.filter(|name| !name.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            format!(
                "@{},{},{}x{}",
                bounds.x, bounds.y, bounds.width, bounds.height
            )
        })
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
        clamp_panel_size, decode_drawer_anchors, effective_panel_pinned, island_layout_for_scale,
        monitor_storage_key, panel_size_from_store, puck_content_size_for_scale,
        top_center_position, work_area_below_anchor, PanelTransitionPayload, PersistedPanelSize,
        Point, Rect, ShellMode, Size, TransitionAnimation, TransitionDirection, PANEL_MAX_HEIGHT,
        PANEL_MAX_WIDTH,
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
        assert_eq!(puck["visible"], false);
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
            .any(|permission| permission == "core:window:allow-start-dragging"));
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
        assert_eq!(panel["shadow"], false);
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

    #[test]
    fn island_is_flush_with_the_top_and_panel_starts_at_its_bottom_edge() {
        assert_eq!(island_layout_for_scale(1.0), (Size::new(260, 52), 0));
        let (island_size, top_offset) = island_layout_for_scale(1.75);
        assert_eq!(island_size, Size::new(455, 91));
        assert_eq!(top_offset, 0);

        let work_area = Rect::new(-2_560, 40, 2_560, 1_400);
        let position = top_center_position(island_size, work_area, top_offset);
        assert_eq!(position, Point::new(-1_508, 40));
        let island = Rect::new(
            position.x,
            position.y,
            island_size.width,
            island_size.height,
        );
        assert_eq!(
            work_area_below_anchor(work_area, island),
            Rect::new(-2_560, 131, 2_560, 1_309)
        );
    }

    #[test]
    fn legacy_panel_size_only_migrates_to_puck_mode() {
        let legacy = serde_json::to_value(PersistedPanelSize {
            width: 512.0,
            height: 800.0,
        })
        .expect("legacy panel size");

        assert_eq!(
            panel_size_from_store(Default::default(), Some(legacy.clone()), ShellMode::Puck),
            Some(PersistedPanelSize {
                width: 512.0,
                height: 800.0,
            })
        );
        assert_eq!(
            panel_size_from_store(Default::default(), Some(legacy), ShellMode::TopIsland),
            None
        );
    }

    #[test]
    fn drawer_anchor_persistence_clamps_values_and_keys_unnamed_monitors() {
        let restored = decode_drawer_anchors(Some(serde_json::json!({
            "DISPLAY1": 0.25,
            "DISPLAY2": 2.0,
            "DISPLAY3": -1.0,
            "": 0.75
        })));
        assert_eq!(restored.get("DISPLAY1"), Some(&0.25));
        assert_eq!(restored.get("DISPLAY2"), Some(&1.0));
        assert_eq!(restored.get("DISPLAY3"), Some(&0.0));
        assert!(!restored.contains_key(""));
        assert_eq!(
            monitor_storage_key(None, Rect::new(-1_920, -40, 1_920, 1_080)),
            "@-1920,-40,1920x1080"
        );
        assert_eq!(
            monitor_storage_key(Some("\\\\.\\DISPLAY1"), Rect::new(0, 0, 1_920, 1_080)),
            "\\\\.\\DISPLAY1"
        );

        let round_trip = decode_drawer_anchors(Some(
            serde_json::to_value(restored.clone()).expect("drawer anchor map"),
        ));
        assert_eq!(round_trip, restored);
    }

    #[test]
    fn top_modes_are_always_on_top_while_puck_respects_pin_setting() {
        assert!(!effective_panel_pinned(ShellMode::Puck, false));
        assert!(effective_panel_pinned(ShellMode::Puck, true));
        assert!(effective_panel_pinned(ShellMode::TopIsland, false));
        assert!(effective_panel_pinned(ShellMode::TopDrawer, false));
    }

    #[test]
    fn transition_payload_matches_the_frontend_event_contract() {
        let payload = PanelTransitionPayload {
            transition_id: 7,
            mode: ShellMode::TopDrawer,
            direction: TransitionDirection::Open,
            animation: TransitionAnimation::DrawerRoll,
            anchor: "top-center".to_owned(),
            duration_ms: 220,
        };

        assert_eq!(
            serde_json::to_value(payload).expect("transition payload"),
            serde_json::json!({
                "transitionId": 7,
                "mode": "top-drawer",
                "direction": "open",
                "animation": "drawer-roll",
                "anchor": "top-center",
                "durationMs": 220,
            })
        );
    }
}
