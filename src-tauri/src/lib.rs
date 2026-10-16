mod aquarium;
mod index;
mod note;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(index::IndexState::default())
        .invoke_handler(tauri::generate_handler![
            aquarium::startup,
            aquarium::open_aquarium,
            index::index_status,
            note::read_note,
            note::create_note,
            note::save_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
