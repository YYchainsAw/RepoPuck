use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;

use crate::git::{
    model::{CommitAndPushResult, OperationResult, RepositorySnapshot},
    runner::{GitCancellation, GitError},
    service::GitService,
};

#[derive(Default)]
pub struct RepositoryState {
    service: Mutex<Option<GitService>>,
    mutation: Mutex<()>,
    active_cancellation: Mutex<Option<GitCancellation>>,
    selection_intent: AtomicU64,
}

struct ActiveCancellationGuard<'a> {
    slot: &'a Mutex<Option<GitCancellation>>,
}

impl Drop for ActiveCancellationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.slot.lock() {
            *active = None;
        }
    }
}

impl RepositoryState {
    #[cfg(test)]
    pub(crate) fn select(&self, path: PathBuf) -> Result<bool, GitError> {
        let intent = self.reserve_selection();
        self.select_reserved(path, intent)
    }

    pub(crate) fn select_reserved(&self, path: PathBuf, intent: u64) -> Result<bool, GitError> {
        // Repository discovery runs Git. Keep it outside the session lock so an in-flight
        // operation can finish without also blocking validation of the next selection.
        let service = GitService::open(&path)?;
        self.install_selection(service, intent, false)
    }

    pub(crate) fn reserve_selection(&self) -> u64 {
        self.selection_intent
            .fetch_add(1, Ordering::AcqRel)
            .wrapping_add(1)
    }

    pub(crate) fn selection_generation(&self) -> u64 {
        self.selection_intent.load(Ordering::Acquire)
    }

    pub(crate) fn reserve_selection_if_current(&self, expected: u64) -> Option<u64> {
        let next = expected.wrapping_add(1);
        self.selection_intent
            .compare_exchange(expected, next, Ordering::AcqRel, Ordering::Acquire)
            .ok()
            .map(|_| next)
    }

    fn install_selection(
        &self,
        service: GitService,
        intent: u64,
        only_if_empty: bool,
    ) -> Result<bool, GitError> {
        let mut selected = self
            .service
            .lock()
            .map_err(|_| GitError::safe("Repository state is unavailable"))?;
        if self.selection_intent.load(Ordering::Acquire) != intent
            || (only_if_empty && selected.is_some())
        {
            return Ok(false);
        }
        *selected = Some(service);
        Ok(true)
    }

    #[cfg(test)]
    pub(crate) fn restore_if_empty(&self, path: PathBuf) -> Result<bool, GitError> {
        let intent = self.reserve_selection();
        self.restore_if_empty_reserved(path, intent)
    }

    pub(crate) fn restore_if_empty_reserved(
        &self,
        path: PathBuf,
        intent: u64,
    ) -> Result<bool, GitError> {
        // Startup restoration may finish after the user has explicitly selected another
        // repository. Validate outside the lock, then install only if state is still empty.
        let service = GitService::open(&path)?;
        self.install_selection(service, intent, true)
    }

    pub(crate) fn with_service<T>(
        &self,
        operation: impl FnOnce(&GitService) -> Result<T, GitError>,
    ) -> Result<T, String> {
        let service = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?
            .as_ref()
            .cloned()
            .ok_or_else(|| "No repository is selected".to_owned())?;
        operation(&service).map_err(error_message)
    }

    pub(crate) fn with_mutation_service<T>(
        &self,
        cancellable: bool,
        operation: impl FnOnce(&GitService) -> Result<T, GitError>,
    ) -> Result<T, String> {
        let _mutation = self
            .mutation
            .lock()
            .map_err(|_| "Git mutation state is unavailable".to_owned())?;
        let service = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?
            .as_ref()
            .cloned()
            .ok_or_else(|| "No repository is selected".to_owned())?;
        let cancellation = cancellable.then(GitCancellation::default);
        if let Some(token) = cancellation.as_ref() {
            *self
                .active_cancellation
                .lock()
                .map_err(|_| "Git cancellation state is unavailable".to_owned())? =
                Some(token.clone());
        }
        let _active_guard = cancellation.as_ref().map(|_| ActiveCancellationGuard {
            slot: &self.active_cancellation,
        });
        let service = cancellation
            .map(|token| service.with_cancellation(token))
            .unwrap_or(service);
        operation(&service).map_err(error_message)
    }

    pub(crate) fn cancel_active_operation(&self) -> Result<bool, String> {
        let active = self
            .active_cancellation
            .lock()
            .map_err(|_| "Git cancellation state is unavailable".to_owned())?;
        let Some(cancellation) = active.as_ref() else {
            return Ok(false);
        };
        cancellation.cancel();
        Ok(true)
    }

    pub(crate) fn selected_path(&self) -> Result<PathBuf, String> {
        let selected = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?;
        selected
            .as_ref()
            .map(|service| service.repository_path().to_owned())
            .ok_or_else(|| "No repository is selected".to_owned())
    }

    pub(crate) fn selected_selection_path(&self) -> Result<PathBuf, String> {
        let selected = self
            .service
            .lock()
            .map_err(|_| "Repository state is unavailable".to_owned())?;
        selected
            .as_ref()
            .map(|service| service.selection_path().to_owned())
            .ok_or_else(|| "No repository is selected".to_owned())
    }
}

#[tauri::command]
pub async fn select_repository(
    path: String,
    app: AppHandle,
    window: WebviewWindow,
) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    let selected = PathBuf::from(path);
    let intent = app.state::<RepositoryState>().reserve_selection();
    let persistence_app = app.clone();
    match with_repository(app, move |state| {
        if !state
            .select_reserved(selected, intent)
            .map_err(error_message)?
        {
            return Err("A newer repository selection took precedence".to_owned());
        }
        state.selected_selection_path()
    })
    .await
    {
        Ok(path) if persist_recent_repository(&persistence_app, &path).is_ok() => {
            OperationResult::success("Repository selected")
        }
        Ok(_) => {
            OperationResult::success("Repository selected, but recent history could not be saved")
        }
        Err(message) => OperationResult::failure(message),
    }
}

#[tauri::command]
pub async fn get_snapshot(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<RepositorySnapshot, String> {
    require_panel(&window)?;
    with_repository(app, |state| state.with_service(GitService::snapshot)).await
}

#[tauri::command]
pub async fn get_change_count(app: AppHandle) -> Result<usize, String> {
    with_repository(app, |state| state.with_service(GitService::change_count)).await
}

#[tauri::command]
pub async fn get_refresh_token(app: AppHandle, window: WebviewWindow) -> Result<String, String> {
    require_panel(&window)?;
    with_repository(app, |state| state.with_service(GitService::refresh_token)).await
}

#[tauri::command]
pub async fn set_staged(
    paths: Vec<String>,
    staged: bool,
    app: AppHandle,
    window: WebviewWindow,
) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(
        app,
        move |service| service.set_staged(&paths, staged),
        "Staging updated",
    )
    .await
}

#[tauri::command]
pub async fn commit(message: String, app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(
        app,
        move |service| service.commit(&message),
        "Changes committed",
    )
    .await
}

#[tauri::command]
pub async fn amend_last_commit(
    message: Option<String>,
    app: AppHandle,
    window: WebviewWindow,
) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(
        app,
        move |service| service.amend_last_commit(message.as_deref()),
        "Last commit amended",
    )
    .await
}

#[tauri::command]
pub async fn push(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(app, GitService::push, "Changes pushed").await
}

#[tauri::command]
pub async fn commit_and_push(
    message: String,
    app: AppHandle,
    window: WebviewWindow,
) -> CommitAndPushResult {
    if let Err(message) = require_panel(&window) {
        return CommitAndPushResult::commit_failed(message);
    }
    match with_repository(app, move |state| {
        state.with_mutation_service(false, |service| {
            Ok(execute_commit_and_push(
                || service.commit(&message),
                || service.push(),
            ))
        })
    })
    .await
    {
        Ok(result) => result,
        Err(message) => CommitAndPushResult::commit_failed(message),
    }
}

fn execute_commit_and_push(
    commit: impl FnOnce() -> Result<(), GitError>,
    push: impl FnOnce() -> Result<(), GitError>,
) -> CommitAndPushResult {
    if let Err(error) = commit() {
        return CommitAndPushResult::commit_failed(error.message());
    }

    match push() {
        Ok(()) => CommitAndPushResult::complete("Changes committed and pushed"),
        Err(error) => CommitAndPushResult::push_failed(error.message()),
    }
}

#[tauri::command]
pub async fn switch_branch(
    branch: String,
    app: AppHandle,
    window: WebviewWindow,
) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(
        app,
        move |service| service.switch_branch(&branch),
        "Branch switched",
    )
    .await
}

#[tauri::command]
pub async fn create_branch(
    branch: String,
    app: AppHandle,
    window: WebviewWindow,
) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(
        app,
        move |service| service.create_branch(&branch),
        "Branch created",
    )
    .await
}

#[tauri::command]
pub async fn fetch(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_cancellable(app, GitService::fetch, "Fetch complete").await
}

#[tauri::command]
pub async fn pull(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(app, GitService::pull, "Pull complete").await
}

#[tauri::command]
pub async fn stash(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    operate_blocking(app, GitService::stash, "Changes stashed").await
}

#[tauri::command]
pub async fn cancel_git_operation(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    match with_repository(app, |state| state.cancel_active_operation()).await {
        Ok(true) => OperationResult::success("Cancellation requested"),
        Ok(false) => OperationResult::failure("No cancellable Git operation is running"),
        Err(message) => OperationResult::failure(message),
    }
}

#[tauri::command]
pub async fn open_terminal(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    match with_repository(app, |state| {
        state.selected_path().and_then(|path| spawn_terminal(&path))
    })
    .await
    {
        Ok(()) => OperationResult::success("Terminal opened"),
        Err(message) => OperationResult::failure(message),
    }
}

#[tauri::command]
pub async fn open_explorer(app: AppHandle, window: WebviewWindow) -> OperationResult {
    if let Err(message) = require_panel(&window) {
        return OperationResult::failure(message);
    }
    match with_repository(app, |state| {
        state.selected_path().and_then(|path| spawn_explorer(&path))
    })
    .await
    {
        Ok(()) => OperationResult::success("Explorer opened"),
        Err(message) => OperationResult::failure(message),
    }
}

async fn operate_blocking(
    app: AppHandle,
    operation: impl FnOnce(&GitService) -> Result<(), GitError> + Send + 'static,
    success_message: &'static str,
) -> OperationResult {
    operate(app, operation, success_message, false).await
}

async fn operate_cancellable(
    app: AppHandle,
    operation: impl FnOnce(&GitService) -> Result<(), GitError> + Send + 'static,
    success_message: &'static str,
) -> OperationResult {
    operate(app, operation, success_message, true).await
}

async fn operate(
    app: AppHandle,
    operation: impl FnOnce(&GitService) -> Result<(), GitError> + Send + 'static,
    success_message: &'static str,
    cancellable: bool,
) -> OperationResult {
    match with_repository(app, move |state| {
        state.with_mutation_service(cancellable, operation)
    })
    .await
    {
        Ok(()) => OperationResult::success(success_message),
        Err(message) => OperationResult::failure(message),
    }
}

async fn with_repository<T>(
    app: AppHandle,
    operation: impl FnOnce(&RepositoryState) -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<RepositoryState>();
        operation(&state)
    })
    .await
    .map_err(|_| "Git operation could not be scheduled".to_owned())?
}

pub(crate) fn require_panel(window: &WebviewWindow) -> Result<(), String> {
    if panel_label_allowed(window.label()) {
        Ok(())
    } else {
        Err("This action is available from the RepoPuck panel only".to_owned())
    }
}

fn panel_label_allowed(label: &str) -> bool {
    label == crate::windowing::PANEL_LABEL
}

fn error_message(error: GitError) -> String {
    error.message().to_owned()
}

pub(crate) fn persist_recent_repository(app: &AppHandle, path: &Path) -> Result<(), ()> {
    let store = app.store("settings.json").map_err(|_| ())?;
    let existing = store
        .get("recentRepositories")
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .unwrap_or_default();
    let recent =
        crate::windowing::settings::remember_repository(&existing, &path.to_string_lossy());
    store.set("recentRepositories", serde_json::json!(recent));
    store.save().map_err(|_| ())
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

    use super::{execute_commit_and_push, panel_label_allowed, RepositoryState};
    use crate::git::{model::CommitAndPushStage, runner::GitError, service::GitService};
    use std::cell::Cell;

    static NEXT_REPOSITORY: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn privileged_git_actions_are_limited_to_the_panel_window() {
        assert!(panel_label_allowed("panel"));
        assert!(!panel_label_allowed("puck"));
        assert!(!panel_label_allowed("main"));
    }

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
    fn mutation_session_serializes_mutations_without_blocking_reads_or_selection() {
        let repository = TestRepository::new();
        let state = Arc::new(RepositoryState::default());
        state
            .select(repository.0.clone())
            .expect("select repository");
        let (first_entered_tx, first_entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let first_state = Arc::clone(&state);
        let first = thread::spawn(move || {
            first_state.with_mutation_service(false, |_| {
                first_entered_tx.send(()).expect("signal first entered");
                release_rx.recv().expect("release first operation");
                Ok(())
            })
        });
        first_entered_rx.recv().expect("first operation entered");

        let (read_entered_tx, read_entered_rx) = mpsc::channel();
        let reading_state = Arc::clone(&state);
        let reading = thread::spawn(move || {
            reading_state.with_service(|_| {
                read_entered_tx.send(()).expect("signal read entered");
                Ok(())
            })
        });
        read_entered_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("read entered while mutation was running");
        reading
            .join()
            .expect("read thread")
            .expect("read operation");

        let (second_entered_tx, second_entered_rx) = mpsc::channel();
        let second_state = Arc::clone(&state);
        let second = thread::spawn(move || {
            second_state.with_mutation_service(false, |_| {
                second_entered_tx.send(()).expect("signal second entered");
                Ok(())
            })
        });

        let replacement = TestRepository::new();
        let replacement_path = replacement.0.clone();
        let (selection_done_tx, selection_done_rx) = mpsc::channel();
        let selecting_state = Arc::clone(&state);
        let selecting = thread::spawn(move || {
            let result = selecting_state.select(replacement_path);
            selection_done_tx
                .send(result)
                .expect("report repository selection");
        });

        assert!(matches!(
            second_entered_rx.recv_timeout(Duration::from_millis(150)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        selection_done_rx
            .recv_timeout(Duration::from_secs(15))
            .expect("selection finished while mutation was running")
            .expect("select replacement repository");
        selecting.join().expect("selection thread");
        release_tx.send(()).expect("release first operation");
        first
            .join()
            .expect("first thread")
            .expect("first operation");
        // Git process startup can be delayed when the full Windows test suite runs in parallel.
        // Keep a generous deadlock guard without treating runner scheduling as a performance test.
        let completion_timeout = Duration::from_secs(15);
        second_entered_rx
            .recv_timeout(completion_timeout)
            .expect("second operation entered after release");
        second
            .join()
            .expect("second thread")
            .expect("second operation");
    }

    #[test]
    fn cancellable_mutation_can_be_stopped_without_poisoning_the_next_operation() {
        let repository = TestRepository::new();
        let state = Arc::new(RepositoryState::default());
        state
            .select(repository.0.clone())
            .expect("select repository");
        let (entered_tx, entered_rx) = mpsc::channel();
        let (continue_tx, continue_rx) = mpsc::channel();
        let operation_state = Arc::clone(&state);
        let operation = thread::spawn(move || {
            operation_state.with_mutation_service(true, |service| {
                entered_tx.send(()).expect("signal cancellable operation");
                continue_rx.recv().expect("continue cancellable operation");
                service.change_count().map(|_| ())
            })
        });

        entered_rx.recv().expect("cancellable operation entered");
        assert!(state
            .cancel_active_operation()
            .expect("request cancellation"));
        continue_tx.send(()).expect("continue after cancellation");
        let error = operation
            .join()
            .expect("cancellable operation thread")
            .expect_err("operation should observe cancellation");
        assert_eq!(error, "Git operation was cancelled");
        assert!(!state
            .cancel_active_operation()
            .expect("cancellation state cleared"));
        state
            .with_mutation_service(false, |_| Ok(()))
            .expect("next mutation remains available");
    }

    #[test]
    fn startup_restore_never_replaces_an_explicit_selection() {
        let restored_repository = TestRepository::new();
        let explicit_repository = TestRepository::new();
        let state = RepositoryState::default();

        assert!(state
            .restore_if_empty(restored_repository.0.clone())
            .expect("restore initial repository"));
        state
            .select(explicit_repository.0.clone())
            .expect("select explicit repository");
        assert!(!state
            .restore_if_empty(restored_repository.0.clone())
            .expect("ignore late startup restore"));
        assert_eq!(
            state
                .selected_path()
                .expect("selected path")
                .canonicalize()
                .expect("canonical selected path"),
            explicit_repository
                .0
                .canonicalize()
                .expect("canonical explicit repository")
        );
    }

    #[test]
    fn an_older_selection_intent_cannot_replace_a_newer_repository() {
        let older_repository = TestRepository::new();
        let newer_repository = TestRepository::new();
        let state = RepositoryState::default();

        let older_intent = state.reserve_selection();
        let older_service =
            GitService::open(&older_repository.0).expect("prepare older repository");
        let newer_intent = state.reserve_selection();
        let newer_service =
            GitService::open(&newer_repository.0).expect("prepare newer repository");

        assert!(state
            .install_selection(newer_service, newer_intent, false)
            .expect("install newer selection"));
        assert!(!state
            .install_selection(older_service, older_intent, false)
            .expect("ignore stale selection"));
        assert_eq!(
            state
                .selected_path()
                .expect("selected path")
                .canonicalize()
                .expect("canonical selected path"),
            newer_repository
                .0
                .canonicalize()
                .expect("canonical newer repository")
        );
    }

    #[test]
    fn a_confirmation_can_reserve_only_if_no_newer_selection_arrived() {
        let state = RepositoryState::default();
        let observed = state.selection_generation();

        assert_eq!(state.reserve_selection_if_current(observed), Some(1));
        assert_eq!(state.reserve_selection_if_current(observed), None);

        let newer = state.reserve_selection();
        assert_eq!(newer, 2);
        assert_eq!(state.reserve_selection_if_current(1), None);
    }

    #[test]
    fn commit_and_push_stops_before_push_when_commit_fails() {
        let push_called = Cell::new(false);

        let result = execute_commit_and_push(
            || Err(GitError::safe("Nothing staged to commit")),
            || {
                push_called.set(true);
                Ok(())
            },
        );

        assert!(!result.success);
        assert!(!result.committed);
        assert!(!result.pushed);
        assert_eq!(result.stage, CommitAndPushStage::Commit);
        assert_eq!(result.message, "Nothing staged to commit");
        assert!(!push_called.get());
    }

    #[test]
    fn commit_and_push_reports_a_completed_commit_when_push_fails() {
        let result = execute_commit_and_push(
            || Ok(()),
            || Err(GitError::safe("Git authentication failed")),
        );

        assert!(!result.success);
        assert!(result.committed);
        assert!(!result.pushed);
        assert_eq!(result.stage, CommitAndPushStage::Push);
        assert_eq!(result.message, "Git authentication failed");
        assert_eq!(
            serde_json::to_value(&result).expect("serialize partial result"),
            serde_json::json!({
                "success": false,
                "committed": true,
                "pushed": false,
                "stage": "push",
                "message": "Git authentication failed",
            })
        );
    }

    #[test]
    fn commit_and_push_reports_both_completed_stages() {
        let result = execute_commit_and_push(|| Ok(()), || Ok(()));

        assert!(result.success);
        assert!(result.committed);
        assert!(result.pushed);
        assert_eq!(result.stage, CommitAndPushStage::Complete);
        assert_eq!(result.message, "Changes committed and pushed");
    }
}
