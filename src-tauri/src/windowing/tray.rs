use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Wry,
};

const OPEN_PANEL: &str = "open-panel";
const REFRESH: &str = "refresh";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub fn setup(app: &App) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let open_panel = MenuItem::with_id(app, OPEN_PANEL, "Open panel", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, REFRESH, "Refresh", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, SETTINGS, "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_panel, &refresh, &settings, &quit])?;
    let mut builder = TrayIconBuilder::with_id("repopuck-tray")
        .tooltip("RepoPuck")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_PANEL => {
                let _ = super::show_panel(app);
            }
            REFRESH => {
                let _ = super::request_refresh(app);
            }
            SETTINGS => {
                let _ = super::open_settings_window(app);
            }
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                let _ = super::toggle_panel(tray.app_handle().clone());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(menu)
}
