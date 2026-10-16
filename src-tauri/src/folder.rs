//! Pastas do aquário e a ordem manual do explorador.
//!
//! A ordem fica em `.aquarium/order.json`: para cada pasta (relativa, com `/`),
//! a lista de itens na ordem escolhida — `nome.md` para notas e `nome/` para pastas.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::aquarium::INTERNAL_DIR;
use crate::index::IndexState;

const ORDER_FILE: &str = "order.json";

pub type Order = BTreeMap<String, Vec<String>>;

fn root(state: &IndexState) -> Result<std::path::PathBuf, String> {
    state
        .root()
        .ok_or_else(|| "Nenhum aquário aberto.".to_string())
}

/// Pastas visíveis do usuário: ignora ocultas (`.aquarium`) e `assets/`.
fn is_user_dir(name: &str) -> bool {
    !name.starts_with('.') && name != crate::asset::ASSETS_DIR
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !path.is_dir() || !is_user_dir(&name) {
            continue;
        }
        if let Ok(rel) = path.strip_prefix(root) {
            out.push(
                rel.components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/"),
            );
        }
        collect(root, &path, out);
    }
}

pub fn folders(root: &Path) -> Vec<String> {
    let mut out = Vec::new();
    collect(root, root, &mut out);
    out.sort();
    out
}

/// Cria `name` dentro de `parent` (relativo ao aquário) e devolve o caminho relativo.
pub fn create(root: &Path, parent: &str, name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\']) || !is_user_dir(name) || name == ".." {
        return Err(format!("Nome de pasta inválido: {name}"));
    }
    let parent_dir =
        parent
            .split('/')
            .filter(|p| !p.is_empty())
            .try_fold(root.to_path_buf(), |dir, part| {
                if part == ".." || part.starts_with('.') {
                    Err(format!("Pasta inválida: {parent}"))
                } else {
                    Ok(dir.join(part))
                }
            })?;
    let dir = parent_dir.join(name);
    if dir.exists() {
        return Err(format!("Já existe uma pasta chamada {name}."));
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Não foi possível criar a pasta: {e}"))?;
    let parent = parent.trim_matches('/');
    Ok(if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    })
}

fn order_path(root: &Path) -> std::path::PathBuf {
    root.join(INTERNAL_DIR).join(ORDER_FILE)
}

pub fn load_order(root: &Path) -> Order {
    fs::read_to_string(order_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_order(root: &Path, order: &Order) -> Result<(), String> {
    let json = serde_json::to_string_pretty(order).map_err(|e| e.to_string())?;
    fs::write(order_path(root), json).map_err(|e| format!("Não foi possível salvar a ordem: {e}"))
}

#[tauri::command]
pub fn list_folders(state: tauri::State<IndexState>) -> Result<Vec<String>, String> {
    Ok(folders(&root(&state)?))
}

#[tauri::command]
pub fn create_folder(
    state: tauri::State<IndexState>,
    parent: String,
    name: String,
) -> Result<String, String> {
    create(&root(&state)?, &parent, &name)
}

#[tauri::command]
pub fn get_order(state: tauri::State<IndexState>) -> Result<Order, String> {
    Ok(load_order(&root(&state)?))
}

/// Grava a ordem manual de uma pasta.
#[tauri::command]
pub fn set_order(
    state: tauri::State<IndexState>,
    folder: String,
    items: Vec<String>,
) -> Result<(), String> {
    let root = root(&state)?;
    let mut order = load_order(&root);
    order.insert(folder, items);
    save_order(&root, &order)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cria_lista_e_ordena_pastas() {
        let root = std::env::temp_dir().join(format!("aquarium-folder-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(INTERNAL_DIR)).unwrap();
        fs::create_dir_all(root.join(".lixeira")).unwrap();
        fs::create_dir_all(root.join("assets")).unwrap();

        assert_eq!(create(&root, "", "Estudos").unwrap(), "Estudos");
        assert_eq!(create(&root, "Estudos", "Cache").unwrap(), "Estudos/Cache");
        assert!(create(&root, "", "Estudos").is_err());
        assert!(create(&root, "", "../fora").is_err());
        assert!(create(&root, "", ".oculta").is_err());
        assert!(create(&root, "..", "x").is_err());
        assert_eq!(folders(&root), vec!["Estudos", "Estudos/Cache"]);

        let mut order = Order::new();
        order.insert("".into(), vec!["b.md".into(), "Estudos/".into()]);
        save_order(&root, &order).unwrap();
        assert_eq!(load_order(&root), order);

        fs::remove_dir_all(&root).unwrap();
    }
}
