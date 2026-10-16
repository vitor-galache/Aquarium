//! Pasta local do aquário: sugestão inicial, abertura e lembrança da última pasta.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Pasta interna para índice e configuração do aquário.
const INTERNAL_DIR: &str = ".aquarium";
const CONFIG_FILE: &str = "config.json";
/// Estado do app (fora da pasta do usuário) com a última pasta aberta.
const STATE_FILE: &str = "state.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aquarium {
    path: String,
    note_count: usize,
    is_new: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Startup {
    suggested_path: Option<String>,
    aquarium: Option<Aquarium>,
    error: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppState {
    last_path: Option<PathBuf>,
}

#[derive(Serialize, Deserialize)]
struct AquariumConfig {
    version: u32,
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Não foi possível localizar a configuração do app: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

fn load_state(app: &AppHandle) -> AppState {
    state_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_state(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let path = state_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn count_notes(dir: &Path) -> Result<usize, String> {
    let mut count = 0;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            count += count_notes(&path)?;
        } else if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            count += 1;
        }
    }
    Ok(count)
}

/// Prepara a pasta como aquário: cria se faltar, garante `.aquarium/` e conta as notas.
fn prepare(path: &Path) -> Result<Aquarium, String> {
    let inaccessible =
        |e: std::io::Error| format!("A pasta {} está inacessível: {e}", path.display());

    if path.exists() && !path.is_dir() {
        return Err(format!("{} não é uma pasta.", path.display()));
    }
    fs::create_dir_all(path).map_err(inaccessible)?;

    let internal = path.join(INTERNAL_DIR);
    let is_new = !internal.exists();
    fs::create_dir_all(&internal).map_err(inaccessible)?;
    let config = internal.join(CONFIG_FILE);
    if !config.exists() {
        let json = serde_json::to_string_pretty(&AquariumConfig { version: 1 })
            .map_err(|e| e.to_string())?;
        fs::write(&config, json).map_err(inaccessible)?;
    }

    let note_count = count_notes(path)
        .map_err(|e| format!("A pasta {} está inacessível: {e}", path.display()))?;
    Ok(Aquarium {
        path: path.display().to_string(),
        note_count,
        is_new,
    })
}

/// Estado inicial: reabre a última pasta ou sugere `Documentos/Aquarium`.
#[tauri::command]
pub fn startup(app: AppHandle) -> Startup {
    let suggested_path = app
        .path()
        .document_dir()
        .ok()
        .map(|d| d.join("Aquarium").display().to_string());

    let Some(last) = load_state(&app).last_path else {
        return Startup {
            suggested_path,
            aquarium: None,
            error: None,
        };
    };

    // Não recria a pasta lembrada: se sumiu (disco removido, renomeada), avisamos.
    let result = if last.is_dir() {
        prepare(&last)
    } else {
        Err(format!(
            "Não encontramos a pasta {}. Ela pode ter sido movida, renomeada ou estar em um disco desconectado.",
            last.display()
        ))
    };
    match result {
        Ok(aquarium) => Startup {
            suggested_path,
            aquarium: Some(aquarium),
            error: None,
        },
        Err(error) => Startup {
            suggested_path: Some(last.display().to_string()),
            aquarium: None,
            error: Some(error),
        },
    }
}

/// Abre (ou cria) o aquário na pasta escolhida e lembra dela.
#[tauri::command]
pub fn open_aquarium(app: AppHandle, path: String) -> Result<Aquarium, String> {
    let path = PathBuf::from(path);
    let aquarium = prepare(&path)?;
    save_state(
        &app,
        &AppState {
            last_path: Some(path),
        },
    )?;
    Ok(aquarium)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepara_pasta_nova_e_existente() {
        let root = std::env::temp_dir().join(format!("aquarium-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);

        let novo = prepare(&root).unwrap();
        assert!(novo.is_new);
        assert_eq!(novo.note_count, 0);
        assert!(root.join(INTERNAL_DIR).join(CONFIG_FILE).exists());

        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("a.md"), "# A").unwrap();
        fs::write(root.join("sub/b.MD"), "# B").unwrap();
        fs::write(root.join("c.txt"), "c").unwrap();
        let existente = prepare(&root).unwrap();
        assert!(!existente.is_new);
        assert_eq!(existente.note_count, 2);

        fs::remove_dir_all(&root).unwrap();
    }
}
