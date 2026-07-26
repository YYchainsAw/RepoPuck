#![allow(linker_messages)]

mod ai;
mod commands;
mod external_launch;
mod game_projects;
mod git;
mod project_activation;
mod windowing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(
        |app, arguments, current_directory| {
            project_activation::activate_secondary_request(app, arguments, current_directory);
        },
    ));

    builder
        .manage(commands::RepositoryState::default())
        .manage(windowing::ShellState::default())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            windowing::setup(app)?;
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            Ok(())
        })
        .on_window_event(windowing::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            ai::get_ai_key_status,
            ai::save_ai_api_key,
            ai::delete_ai_api_key,
            ai::generate_commit_message,
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
            windowing::toggle_panel,
            windowing::get_shell_state,
            windowing::set_shell_mode,
            windowing::complete_panel_transition,
            windowing::set_panel_pinned,
            windowing::save_puck_position,
            windowing::open_settings,
            windowing::show_puck_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RepoPuck");
}
