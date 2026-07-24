use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};

use super::i18n::{self, InterfaceLanguage};

const OPEN_PANEL: &str = "open-panel";
const REFRESH: &str = "refresh";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub(crate) fn tray_left_click_action() -> super::PanelAction {
    super::PanelAction::Show
}

pub fn setup(app: &App) -> Result<super::PuckMenu, Box<dyn std::error::Error>> {
    let copy = i18n::tray_copy(i18n::current_language(app.handle()));
    let open_panel = MenuItem::with_id(app, OPEN_PANEL, copy.open_panel, true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, REFRESH, copy.refresh, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, SETTINGS, copy.settings, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, copy.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_panel, &refresh, &settings, &quit])?;
    let mut builder = TrayIconBuilder::with_id("repopuck-tray")
        .tooltip("RepoPuck")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_PANEL => {
                let _ = super::perform_panel_action(app, super::PanelAction::Show);
            }
            REFRESH => {
                let _ = super::request_refresh(app);
            }
            SETTINGS => {
                let _ = super::open_settings_window(app);
            }
            QUIT => {
                super::request_drawer_shutdown(app);
                super::save_window_geometry(app);
                app.exit(0);
            }
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
                let _ = super::perform_panel_action(tray.app_handle(), tray_left_click_action());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(super::PuckMenu {
        menu,
        open_panel,
        refresh,
        settings,
        quit,
    })
}

pub(crate) fn set_language(
    app: &AppHandle,
    language: InterfaceLanguage,
) -> Result<(), tauri::Error> {
    let copy = i18n::tray_copy(language);
    let menu = app.state::<super::PuckMenu>();
    menu.open_panel.set_text(copy.open_panel)?;
    menu.refresh.set_text(copy.refresh)?;
    menu.settings.set_text(copy.settings)?;
    menu.quit.set_text(copy.quit)
}

#[cfg(test)]
mod tests {
    use super::i18n::{tray_copy, InterfaceLanguage};

    #[test]
    fn tray_always_shows_while_puck_toggles_the_panel() {
        assert_eq!(
            super::tray_left_click_action(),
            super::super::PanelAction::Show
        );
        assert_eq!(
            super::super::toggle_panel_action(false),
            super::super::PanelAction::Show
        );
        assert_eq!(
            super::super::toggle_panel_action(true),
            super::super::PanelAction::Hide
        );
    }

    #[test]
    fn tray_copy_keeps_stable_actions_in_both_languages() {
        assert_eq!(
            tray_copy(InterfaceLanguage::English).open_panel,
            "Open panel"
        );
        assert_eq!(
            tray_copy(InterfaceLanguage::SimplifiedChinese).open_panel,
            "打开面板"
        );
    }
}
