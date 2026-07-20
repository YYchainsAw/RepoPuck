#![allow(linker_messages)]

mod commands;
mod git;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::RepositoryState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::select_repository,
            commands::get_snapshot,
            commands::set_staged,
            commands::commit,
            commands::push,
            commands::commit_and_push,
            commands::switch_branch,
            commands::create_branch,
            commands::fetch,
            commands::pull,
            commands::stash,
            commands::open_terminal,
            commands::open_explorer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RepoPuck");
}
