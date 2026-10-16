mod aquarium;
mod asset;
mod capture;
mod depth;
mod folder;
mod index;
mod note;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(index::IndexState::default())
        .manage(capture::CaptureShortcut::default())
        .setup(|app| Ok(capture::setup(app)?))
        .invoke_handler(tauri::generate_handler![
            aquarium::startup,
            aquarium::open_aquarium,
            aquarium::save_config,
            asset::save_image,
            folder::list_folders,
            folder::create_folder,
            folder::get_order,
            folder::set_order,
            folder::move_note,
            folder::trash_folder,
            index::index_status,
            index::list_notes,
            index::search_notes,
            note::read_note,
            note::create_note,
            note::save_note,
            note::peek_note,
            note::bring_to_surface,
            note::rename_note,
            note::duplicate_note,
            note::trash_note
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, _event| {
            // No macOS, clicar no ícone do Dock reabre a janela escondida.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                capture::show_main(_app);
            }
        });
}
