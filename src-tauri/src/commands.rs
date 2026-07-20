use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

use crate::git::{
    model::{OperationResult, RepositorySnapshot},
    runner::GitError,
    service::GitService,
};

#[derive(Default)]
pub struct RepositoryState {
    service: Mutex<Option<GitService>>,
}

impl RepositoryState {
    pub(crate) fn select(&self, path: PathBuf) -> Result<(), GitError> {
        let service = GitService::open(&path)?;
        let mut selected = self
            .service
            .lock()
            .map_err(|_| GitError::safe("Repository state is unavailable"))?;
        *selected = Some(service);
        Ok(())
    }

    fn with_service<T>(
        &self,
        operation: impl FnOnce(&GitService) -> Result<T, GitError>,
    ) -> Result<T, String> {
        let selected = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?;
        let service = selected
            .as_ref()
            .ok_or_else(|| "No repository is selected".to_owned())?;
        operation(service).map_err(error_message)
    }

    fn selected_path(&self) -> Result<PathBuf, String> {
        let selected = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?;
        selected
            .as_ref()
            .map(|service| service.repository_path().to_owned())
            .ok_or_else(|| "No repository is selected".to_owned())
    }
}

#[tauri::command]
pub fn select_repository(
    path: String,
    app: AppHandle,
    state: State<'_, RepositoryState>,
) -> OperationResult {
    let selected = PathBuf::from(path);
    match state.select(selected) {
        Ok(()) => {
            if let Ok(path) = state.selected_path() {
                persist_recent_repository(&app, &path);
            }
            OperationResult::success("Repository selected")
        }
        Err(error) => failure(error),
    }
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, RepositoryState>) -> Result<RepositorySnapshot, String> {
    state.with_service(GitService::snapshot)
}

#[tauri::command]
pub fn set_staged(
    paths: Vec<String>,
    staged: bool,
    state: State<'_, RepositoryState>,
) -> OperationResult {
    operate(
        &state,
        |service| service.set_staged(&paths, staged),
        "Staging updated",
    )
}

#[tauri::command]
pub fn commit(message: String, state: State<'_, RepositoryState>) -> OperationResult {
    operate(
        &state,
        |service| service.commit(&message),
        "Changes committed",
    )
}

#[tauri::command]
pub fn push(state: State<'_, RepositoryState>) -> OperationResult {
    operate(&state, GitService::push, "Changes pushed")
}

#[tauri::command]
pub fn commit_and_push(message: String, state: State<'_, RepositoryState>) -> OperationResult {
    operate(
        &state,
        |service| {
            service.commit(&message)?;
            service.push()
        },
        "Changes committed and pushed",
    )
}

#[tauri::command]
pub fn switch_branch(branch: String, state: State<'_, RepositoryState>) -> OperationResult {
    operate(
        &state,
        |service| service.switch_branch(&branch),
        "Branch switched",
    )
}

#[tauri::command]
pub fn create_branch(branch: String, state: State<'_, RepositoryState>) -> OperationResult {
    operate(
        &state,
        |service| service.create_branch(&branch),
        "Branch created",
    )
}

#[tauri::command]
pub fn fetch(state: State<'_, RepositoryState>) -> OperationResult {
    operate(&state, GitService::fetch, "Fetch complete")
}

#[tauri::command]
pub fn pull(state: State<'_, RepositoryState>) -> OperationResult {
    operate(&state, GitService::pull, "Pull complete")
}

#[tauri::command]
pub fn stash(state: State<'_, RepositoryState>) -> OperationResult {
    operate(&state, GitService::stash, "Changes stashed")
}

#[tauri::command]
pub fn open_terminal(state: State<'_, RepositoryState>) -> OperationResult {
    match state.selected_path().and_then(|path| spawn_terminal(&path)) {
        Ok(()) => OperationResult::success("Terminal opened"),
        Err(message) => OperationResult::failure(message),
    }
}

#[tauri::command]
pub fn open_explorer(state: State<'_, RepositoryState>) -> OperationResult {
    match state.selected_path().and_then(|path| spawn_explorer(&path)) {
        Ok(()) => OperationResult::success("Explorer opened"),
        Err(message) => OperationResult::failure(message),
    }
}

fn operate(
    state: &State<'_, RepositoryState>,
    operation: impl FnOnce(&GitService) -> Result<(), GitError>,
    success_message: &str,
) -> OperationResult {
    match state.with_service(operation) {
        Ok(()) => OperationResult::success(success_message),
        Err(message) => OperationResult::failure(message),
    }
}

fn failure(error: GitError) -> OperationResult {
    OperationResult::failure(error_message(error))
}

fn error_message(error: GitError) -> String {
    error.message().to_owned()
}

fn persist_recent_repository(app: &AppHandle, path: &Path) {
    let Ok(store) = app.store("settings.json") else {
        return;
    };
    let existing = store
        .get("recentRepositories")
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .unwrap_or_default();
    let recent =
        crate::windowing::settings::remember_repository(&existing, &path.to_string_lossy());
    store.set("recentRepositories", serde_json::json!(recent));
    let _ = store.save();
}

#[cfg(windows)]
fn spawn_terminal(path: &Path) -> Result<(), String> {
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
    Command::new("cmd.exe")
        .current_dir(path)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open a terminal".to_owned())
}

#[cfg(not(windows))]
fn spawn_terminal(_path: &Path) -> Result<(), String> {
    Err("Opening a terminal is supported on Windows only".to_owned())
}

#[cfg(windows)]
fn spawn_explorer(path: &Path) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open Explorer".to_owned())
}

#[cfg(not(windows))]
fn spawn_explorer(_path: &Path) -> Result<(), String> {
    Err("Opening Explorer is supported on Windows only".to_owned())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        process::Command,
        sync::{
            atomic::{AtomicU64, Ordering},
            mpsc, Arc,
        },
        thread,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use super::RepositoryState;
    use std::sync::TryLockError;

    static NEXT_REPOSITORY: AtomicU64 = AtomicU64::new(0);

    struct TestRepository(PathBuf);

    impl TestRepository {
        fn new() -> Self {
            let unique = NEXT_REPOSITORY.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "repopuck-command-lock-test-{}-{timestamp}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create temporary repository");
            let output = Command::new("git")
                .current_dir(&path)
                .args(["init", "--initial-branch=main"])
                .output()
                .expect("Git available on PATH");
            assert!(output.status.success());
            Self(path)
        }
    }

    impl Drop for TestRepository {
        fn drop(&mut self) {
            if self.0.starts_with(std::env::temp_dir()) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
    }

    #[test]
    fn repository_session_serializes_complete_operations() {
        let repository = TestRepository::new();
        let state = Arc::new(RepositoryState::default());
        state
            .select(repository.0.clone())
            .expect("select repository");
        let (first_entered_tx, first_entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let first_state = Arc::clone(&state);
        let first = thread::spawn(move || {
            first_state.with_service(|_| {
                first_entered_tx.send(()).expect("signal first entered");
                release_rx.recv().expect("release first operation");
                Ok(())
            })
        });
        first_entered_rx.recv().expect("first operation entered");
        assert!(matches!(
            state.service.try_lock(),
            Err(TryLockError::WouldBlock)
        ));

        let (second_entered_tx, second_entered_rx) = mpsc::channel();
        let second_state = Arc::clone(&state);
        let second = thread::spawn(move || {
            second_state.with_service(|_| {
                second_entered_tx.send(()).expect("signal second entered");
                Ok(())
            })
        });

        assert!(matches!(
            second_entered_rx.recv_timeout(Duration::from_millis(150)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        release_tx.send(()).expect("release first operation");
        first
            .join()
            .expect("first thread")
            .expect("first operation");
        second_entered_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("second operation entered after release");
        second
            .join()
            .expect("second thread")
            .expect("second operation");
    }
}
