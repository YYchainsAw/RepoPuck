#![allow(linker_messages)]

mod commands;
mod git;
mod windowing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::RepositoryState::default())
        .manage(windowing::ShellState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(windowing::setup)
        .on_window_event(windowing::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::select_repository,
            commands::get_snapshot,
            commands::get_change_count,
            commands::set_staged,
            commands::commit,
            commands::amend_last_commit,
            commands::push,
            commands::commit_and_push,
            commands::switch_branch,
            commands::create_branch,
            commands::fetch,
            commands::pull,
            commands::stash,
            commands::open_terminal,
            commands::open_explorer,
            windowing::show_panel,
            windowing::set_panel_pinned,
            windowing::save_puck_position,
            windowing::open_settings,
            windowing::show_puck_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RepoPuck");
}
