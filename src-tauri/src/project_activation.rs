use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_store::StoreExt;

use crate::{
    commands::{persist_recent_repository, RepositoryState},
    external_launch::{parse_external_open_request, ExternalOpenRequest, ExternalOpenSource},
    windowing,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RepositoryActivation {
    path: PathBuf,
    source: ExternalOpenSource,
}

pub(crate) fn initial_repository_activation() -> Option<RepositoryActivation> {
    let arguments = std::env::args_os().collect::<Vec<_>>();
    let request = parse_external_open_request(arguments).ok().flatten()?;
    Some(resolve_repository_activation(request, &current_directory()))
}

pub(crate) fn activate_secondary_request(
    app: &AppHandle,
    arguments: Vec<String>,
    current_directory: String,
) {
    let Some(activation) = parse_activation(
        arguments.into_iter().map(OsString::from).collect(),
        PathBuf::from(current_directory),
    ) else {
        return;
    };
    schedule_activation(app, activation);
}

fn parse_activation(
    arguments: Vec<OsString>,
    current_directory: PathBuf,
) -> Option<RepositoryActivation> {
    let request = parse_external_open_request(arguments).ok().flatten()?;
    Some(resolve_repository_activation(request, &current_directory))
}

pub(crate) fn schedule_activation(app: &AppHandle, activation: RepositoryActivation) {
    let repository_state = app.state::<RepositoryState>();
    let confirmation_required =
        activation.source == ExternalOpenSource::Protocol && !is_preapproved(app, &activation.path);
    let observed_generation =
        confirmation_required.then(|| repository_state.selection_generation());
    let reserved_intent = (!confirmation_required).then(|| repository_state.reserve_selection());
    let activation_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = activation_app.state::<RepositoryState>();
        let intent = if let Some(observed_generation) = observed_generation {
            if !confirm_protocol_activation(&activation_app, &activation.path) {
                return;
            }
            let Some(intent) = state.reserve_selection_if_current(observed_generation) else {
                return;
            };
            intent
        } else {
            let Some(intent) = reserved_intent else {
                return;
            };
            intent
        };
        match state.select_reserved(activation.path.clone(), intent) {
            Ok(true) => {}
            Ok(false) => return,
            Err(error) => {
                show_activation_error(&activation_app, &activation.path, error.message());
                return;
            }
        }
        let Ok(selection_path) = state.selected_selection_path() else {
            return;
        };
        let _ = persist_recent_repository(&activation_app, &selection_path);
        let _ = windowing::request_refresh(&activation_app);
    });
}

fn resolve_repository_activation(
    request: ExternalOpenRequest,
    current_directory: &Path,
) -> RepositoryActivation {
    let (path, source) = request.into_parts();
    let path = if path.is_absolute() {
        path
    } else {
        current_directory.join(path)
    };
    RepositoryActivation { path, source }
}

fn is_preapproved(app: &AppHandle, path: &Path) -> bool {
    let Ok(store) = app.store("settings.json") else {
        return false;
    };
    let recent = store
        .get("recentRepositories")
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .unwrap_or_default();
    let requested = path_key(path);
    recent
        .iter()
        .any(|recent| path_key(Path::new(recent)) == requested)
}

fn confirm_protocol_activation(app: &AppHandle, path: &Path) -> bool {
    let copy = windowing::i18n::activation_copy(windowing::i18n::current_language(app));
    app.dialog()
        .message(format!(
            "{}\n\n{}\n\n{}",
            copy.confirmation_intro,
            path.display(),
            copy.confirmation_guidance
        ))
        .title(copy.confirmation_title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}

fn show_activation_error(app: &AppHandle, path: &Path, message: &str) {
    let language = windowing::i18n::current_language(app);
    let copy = windowing::i18n::activation_copy(language);
    let detail = windowing::i18n::activation_error_detail(language, message);
    app.dialog()
        .message(format!(
            "{}\n\n{}\n\n{}",
            copy.error_intro,
            path.display(),
            detail
        ))
        .title(copy.error_title)
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::Ok)
        .blocking_show();
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn current_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_absolute_windows_repository_paths() {
        let request =
            parse_external_open_request(["repopuck.exe", "open", r"D:\Games\OrbitTactics"])
                .expect("valid command")
                .expect("open request");

        assert_eq!(
            resolve_repository_activation(request, Path::new(r"C:\Ignored")).path,
            PathBuf::from(r"D:\Games\OrbitTactics"),
        );
    }

    #[test]
    fn resolves_relative_cli_paths_from_the_callers_working_directory() {
        let request = parse_external_open_request(["open", r"..\NeonFrontier"])
            .expect("valid command")
            .expect("open request");

        assert_eq!(
            resolve_repository_activation(request, Path::new(r"D:\Games\Tools")).path,
            PathBuf::from(r"D:\Games\Tools\..\NeonFrontier"),
        );
    }

    #[test]
    fn recent_path_matching_is_case_and_separator_insensitive() {
        assert_eq!(
            path_key(Path::new(r"D:\Games\OrbitTactics\\")),
            path_key(Path::new("d:/games/orbittactics"))
        );
    }
}
