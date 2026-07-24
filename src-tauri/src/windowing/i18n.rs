use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const SETTINGS_FILE: &str = "settings.json";

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum InterfaceLanguage {
    #[default]
    English,
    SimplifiedChinese,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InterfaceLanguageChanged {
    pub(crate) preference: String,
    pub(crate) resolved: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct TrayCopy {
    pub(crate) open_panel: &'static str,
    pub(crate) refresh: &'static str,
    pub(crate) settings: &'static str,
    pub(crate) quit: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ActivationCopy {
    pub(crate) confirmation_title: &'static str,
    pub(crate) confirmation_intro: &'static str,
    pub(crate) confirmation_guidance: &'static str,
    pub(crate) error_title: &'static str,
    pub(crate) error_intro: &'static str,
}

pub(crate) fn parse_language_changed(payload: &str) -> Option<InterfaceLanguageChanged> {
    let event = serde_json::from_str::<InterfaceLanguageChanged>(payload).ok()?;
    let resolved_is_valid = matches!(event.resolved.as_str(), "zh-CN" | "en");
    let preference_is_valid = match event.preference.as_str() {
        "system" => true,
        "zh-CN" | "en" => event.preference == event.resolved,
        _ => false,
    };
    (resolved_is_valid && preference_is_valid).then_some(event)
}

pub(crate) fn language_from_tag(tag: &str) -> InterfaceLanguage {
    let normalized = tag.trim().replace('_', "-").to_ascii_lowercase();
    if normalized == "zh" || normalized.starts_with("zh-") {
        InterfaceLanguage::SimplifiedChinese
    } else {
        InterfaceLanguage::English
    }
}

pub(crate) fn language_for_preference(preference: &str) -> InterfaceLanguage {
    match preference.trim() {
        "zh-CN" => InterfaceLanguage::SimplifiedChinese,
        "en" => InterfaceLanguage::English,
        _ => system_language(),
    }
}

pub(crate) fn current_language(app: &AppHandle) -> InterfaceLanguage {
    let preference = app
        .store(SETTINGS_FILE)
        .ok()
        .and_then(|store| store.get("language"))
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "system".to_owned());
    language_for_preference(&preference)
}

pub(crate) fn persist_preference(
    app: &AppHandle,
    preference: &str,
) -> Result<(), tauri_plugin_store::Error> {
    let store = app.store(SETTINGS_FILE)?;
    store.set("language", preference);
    store.save()
}

pub(crate) const fn tray_copy(language: InterfaceLanguage) -> TrayCopy {
    match language {
        InterfaceLanguage::English => TrayCopy {
            open_panel: "Open panel",
            refresh: "Refresh",
            settings: "Settings",
            quit: "Quit",
        },
        InterfaceLanguage::SimplifiedChinese => TrayCopy {
            open_panel: "打开面板",
            refresh: "刷新",
            settings: "设置",
            quit: "退出",
        },
    }
}

pub(crate) const fn activation_copy(language: InterfaceLanguage) -> ActivationCopy {
    match language {
        InterfaceLanguage::English => ActivationCopy {
            confirmation_title: "Open project in RepoPuck?",
            confirmation_intro: "An external link wants RepoPuck to open this project:",
            confirmation_guidance:
                "Continue only if you trust this link and recognize the project.",
            error_title: "Could not open project",
            error_intro: "RepoPuck could not open this project:",
        },
        InterfaceLanguage::SimplifiedChinese => ActivationCopy {
            confirmation_title: "要在 RepoPuck 中打开项目吗？",
            confirmation_intro: "一个外部链接想让 RepoPuck 打开此项目：",
            confirmation_guidance: "仅当你信任此链接并确认这是你的项目时才继续。",
            error_title: "无法打开项目",
            error_intro: "RepoPuck 无法打开此项目：",
        },
    }
}

pub(crate) fn activation_error_detail(language: InterfaceLanguage, message: &str) -> String {
    if language == InterfaceLanguage::SimplifiedChinese {
        if message == "The selected directory is not a Git repository"
            || message.starts_with("Git repository was not found")
        {
            return "所选目录不是 Git 仓库。".to_owned();
        }
        if message.starts_with("Git operation failed") {
            return "Git 操作失败。".to_owned();
        }
    }
    message.to_owned()
}

#[cfg(windows)]
fn system_language() -> InterfaceLanguage {
    use windows_sys::Win32::Globalization::GetUserDefaultUILanguage;

    language_from_windows_ui_language(unsafe { GetUserDefaultUILanguage() })
}

const fn language_from_windows_ui_language(language_id: u16) -> InterfaceLanguage {
    const PRIMARY_LANGUAGE_MASK: u16 = 0x03ff;
    const PRIMARY_LANGUAGE_CHINESE: u16 = 0x0004;
    if language_id & PRIMARY_LANGUAGE_MASK == PRIMARY_LANGUAGE_CHINESE {
        InterfaceLanguage::SimplifiedChinese
    } else {
        InterfaceLanguage::English
    }
}

#[cfg(not(windows))]
fn system_language() -> InterfaceLanguage {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .into_iter()
        .find_map(|name| {
            std::env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .map(|tag| language_from_tag(&tag))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_chinese_locale_variants() {
        assert_eq!(
            language_from_tag("zh-CN"),
            InterfaceLanguage::SimplifiedChinese
        );
        assert_eq!(
            language_from_tag("zh_Hans_CN.UTF-8"),
            InterfaceLanguage::SimplifiedChinese
        );
        assert_eq!(language_from_tag("en-US"), InterfaceLanguage::English);
    }

    #[test]
    fn recognizes_chinese_windows_ui_language_ids() {
        assert_eq!(
            language_from_windows_ui_language(0x0804),
            InterfaceLanguage::SimplifiedChinese
        );
        assert_eq!(
            language_from_windows_ui_language(0x0404),
            InterfaceLanguage::SimplifiedChinese
        );
        assert_eq!(
            language_from_windows_ui_language(0x0409),
            InterfaceLanguage::English
        );
    }

    #[test]
    fn parses_frontend_language_event_contract() {
        assert_eq!(
            parse_language_changed(r#"{"preference":"system","resolved":"zh-CN"}"#),
            Some(InterfaceLanguageChanged {
                preference: "system".to_owned(),
                resolved: "zh-CN".to_owned(),
            })
        );
        assert_eq!(parse_language_changed(r#""zh-CN""#), None);
    }

    #[test]
    fn rejects_invalid_or_contradictory_language_events() {
        assert_eq!(
            parse_language_changed(r#"{"preference":"invalid","resolved":"zh-CN"}"#),
            None
        );
        assert_eq!(
            parse_language_changed(r#"{"preference":"zh-CN","resolved":"en"}"#),
            None
        );
        assert_eq!(
            parse_language_changed(r#"{"preference":"system","resolved":"fr"}"#),
            None
        );
    }

    #[test]
    fn provides_complete_chinese_native_copy() {
        assert_eq!(
            tray_copy(InterfaceLanguage::SimplifiedChinese),
            TrayCopy {
                open_panel: "打开面板",
                refresh: "刷新",
                settings: "设置",
                quit: "退出",
            }
        );
        assert_eq!(
            activation_copy(InterfaceLanguage::SimplifiedChinese).error_title,
            "无法打开项目"
        );
        assert_eq!(
            activation_error_detail(
                InterfaceLanguage::SimplifiedChinese,
                "Git repository was not found (exit code 128)"
            ),
            "所选目录不是 Git 仓库。"
        );
        assert_eq!(
            activation_error_detail(InterfaceLanguage::English, "Custom diagnostic"),
            "Custom diagnostic"
        );
    }
}
