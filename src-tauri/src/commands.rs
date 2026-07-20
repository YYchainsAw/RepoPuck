use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::State;

use crate::git::{
    model::{OperationResult, RepositorySnapshot},
    runner::GitError,
    service::GitService,
};

#[derive(Default)]
pub struct RepositoryState {
    path: Mutex<Option<PathBuf>>,
}

#[tauri::command]
pub fn select_repository(path: String, state: State<'_, RepositoryState>) -> OperationResult {
    let selected = PathBuf::from(path);
    match GitService::open(&selected) {
        Ok(_) => match state.path.lock() {
            Ok(mut repository) => {
                *repository = Some(selected);
                OperationResult::success("Repository selected")
            }
            Err(_) => OperationResult::failure("Repository state is unavailable"),
        },
        Err(error) => failure(error),
    }
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, RepositoryState>) -> Result<RepositorySnapshot, String> {
    service(&state)?.snapshot().map_err(error_message)
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
    match repository_path(&state).and_then(|path| spawn_terminal(&path)) {
        Ok(()) => OperationResult::success("Terminal opened"),
        Err(message) => OperationResult::failure(message),
    }
}

#[tauri::command]
pub fn open_explorer(state: State<'_, RepositoryState>) -> OperationResult {
    match repository_path(&state).and_then(|path| spawn_explorer(&path)) {
        Ok(()) => OperationResult::success("Explorer opened"),
        Err(message) => OperationResult::failure(message),
    }
}

fn operate(
    state: &State<'_, RepositoryState>,
    operation: impl FnOnce(&GitService) -> Result<(), GitError>,
    success_message: &str,
) -> OperationResult {
    match service(state).and_then(|service| operation(&service).map_err(error_message)) {
        Ok(()) => OperationResult::success(success_message),
        Err(message) => OperationResult::failure(message),
    }
}

fn service(state: &State<'_, RepositoryState>) -> Result<GitService, String> {
    let path = repository_path(state)?;
    GitService::open(&path).map_err(error_message)
}

fn repository_path(state: &State<'_, RepositoryState>) -> Result<PathBuf, String> {
    state
        .path
        .lock()
        .map_err(|_| "Repository state is unavailable".to_owned())?
        .clone()
        .ok_or_else(|| "No repository is selected".to_owned())
}

fn failure(error: GitError) -> OperationResult {
    OperationResult::failure(error_message(error))
}

fn error_message(error: GitError) -> String {
    error.message().to_owned()
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
