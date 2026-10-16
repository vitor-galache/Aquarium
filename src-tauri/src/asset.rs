//! Imagens coladas no editor: ficam em `assets/` ao lado da nota.

use crate::note::slugify;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Pasta das imagens, relativa à pasta da nota.
pub const ASSETS_DIR: &str = "assets";
const EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Grava a imagem e devolve o caminho relativo à nota (ex.: `assets/x.png`).
fn save(note: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    let extension = extension.to_ascii_lowercase();
    if !EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("Formato de imagem não suportado: {extension}"));
    }
    let dir = note
        .parent()
        .ok_or("Caminho de nota inválido.")?
        .join(ASSETS_DIR);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Não foi possível criar {}: {e}", dir.display()))?;
    let stem = note.file_stem().and_then(|s| s.to_str()).unwrap_or("nota");
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    let base = format!("{}-{millis}", slugify(stem));
    let mut name = format!("{base}.{extension}");
    let mut n = 2;
    while dir.join(&name).exists() {
        name = format!("{base}-{n}.{extension}");
        n += 1;
    }
    let path = dir.join(&name);
    fs::write(&path, bytes)
        .map_err(|e| format!("Não foi possível salvar {}: {e}", path.display()))?;
    Ok(format!("{ASSETS_DIR}/{name}"))
}

#[tauri::command]
pub fn save_image(note: String, bytes: Vec<u8>, extension: String) -> Result<String, String> {
    save(Path::new(&note), &bytes, &extension)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grava_ao_lado_da_nota() {
        let dir = std::env::temp_dir().join(format!("aquarium-asset-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let note = dir.join("Minha nota.md");
        let a = save(&note, b"x", "PNG").unwrap();
        let b = save(&note, b"y", "png").unwrap();
        assert!(a.starts_with("assets/") && a.ends_with(".png"));
        assert_ne!(a, b);
        assert_eq!(fs::read(dir.join(&a)).unwrap(), b"x");
        assert!(save(&note, b"z", "exe").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}
