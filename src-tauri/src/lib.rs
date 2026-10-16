mod aquarium;
mod capture;
mod depth;
mod index;
mod note;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(index::IndexState::default())
        .setup(|app| Ok(capture::setup(app)?))
        .invoke_handler(tauri::generate_handler![
            aquarium::startup,
            aquarium::open_aquarium,
            index::index_status,
            note::read_note,
            note::create_note,
            note::save_note,
            note::bring_to_surface
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
