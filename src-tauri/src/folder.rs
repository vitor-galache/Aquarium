//! Subpastas da pasta de notas e a ordem manual do explorador.
//!
//! A ordem fica em `.notesea/order.json`: para cada pasta (relativa, com `/`),
//! a lista de itens na ordem escolhida — `nome.md` para notas e `nome/` para pastas.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::index::IndexState;
use crate::vault::INTERNAL_DIR;

const ORDER_FILE: &str = "order.json";

pub type Order = BTreeMap<String, Vec<String>>;

fn root(state: &IndexState) -> Result<PathBuf, String> {
    state
        .root()
        .ok_or_else(|| "Nenhuma pasta aberta.".to_string())
}

/// Pastas visíveis do usuário: ignora ocultas (`.notesea`) e `assets/`.
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

/// Caminho no disco de uma pasta relativa, sem sair da pasta de notas.
fn resolve(root: &Path, folder: &str) -> Result<PathBuf, String> {
    folder
        .split('/')
        .filter(|p| !p.is_empty())
        .try_fold(root.to_path_buf(), |dir, part| {
            if part == ".." || part.starts_with('.') {
                Err(format!("Pasta inválida: {folder}"))
            } else {
                Ok(dir.join(part))
            }
        })
}

/// Nomes de imagens em `assets/` citados no texto da nota.
fn asset_refs(text: &str) -> Vec<String> {
    let prefix = format!("{}/", crate::asset::ASSETS_DIR);
    let mut names = Vec::new();
    for (i, _) in text.match_indices(&prefix) {
        // Só links relativos: `(assets/x`, `(./assets/x`, `"assets/x`…
        let before = text[..i].trim_end_matches("./");
        if !before.ends_with(['(', '"', '\'', '<', ' ']) {
            continue;
        }
        let rest = &text[i + prefix.len()..];
        let end = rest
            .find(|c: char| c.is_whitespace() || ")\"'>]".contains(c))
            .unwrap_or(rest.len());
        let name = &rest[..end];
        if !name.is_empty() && !name.contains(['/', '\\']) && !names.iter().any(|n| n == name) {
            names.push(name.to_string());
        }
    }
    names
}

/// Outra nota da pasta ainda usa a imagem? (ex.: nota duplicada)
fn shared_asset(dir: &Path, note: &Path, name: &str) -> bool {
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().map(|e| e.path()).any(|p| {
        p != note
            && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("md"))
            && fs::read_to_string(&p).is_ok_and(|t| asset_refs(&t).iter().any(|n| n == name))
    })
}

/// Leva as imagens da nota para `assets/` da nova pasta e devolve o texto
/// com os links ajustados (quando um nome já existia lá).
fn move_assets(text: &str, from: &Path, note: &Path, to: &Path) -> Result<String, String> {
    let assets = crate::asset::ASSETS_DIR;
    let mut text = text.to_string();
    for name in asset_refs(&text.clone()) {
        let src = from.join(assets).join(&name);
        if !src.is_file() {
            continue;
        }
        let dest_dir = to.join(assets);
        fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("Não foi possível criar {assets}/: {e}"))?;
        let (stem, ext) = match name.rsplit_once('.') {
            Some((s, e)) => (s.to_string(), format!(".{e}")),
            None => (name.clone(), String::new()),
        };
        let mut target = name.clone();
        let mut n = 2;
        loop {
            let dest = dest_dir.join(&target);
            if !dest.exists() {
                break;
            }
            // Mesma imagem já está lá (ida e volta): reaproveita.
            if fs::read(&dest).ok() == fs::read(&src).ok() {
                break;
            }
            target = format!("{stem}-{n}{ext}");
            n += 1;
        }
        let dest = dest_dir.join(&target);
        if !dest.exists() {
            if shared_asset(from, note, &name) {
                fs::copy(&src, &dest).map(|_| ())
            } else {
                fs::rename(&src, &dest).or_else(|_| {
                    fs::copy(&src, &dest)?;
                    fs::remove_file(&src)
                })
            }
            .map_err(|e| format!("Não foi possível mover a imagem {name}: {e}"))?;
        }
        if target != name {
            text = text.replace(&format!("{assets}/{name}"), &format!("{assets}/{target}"));
        }
    }
    Ok(text)
}

/// Move a nota (e suas imagens) para outra pasta; se o nome existir, ganha sufixo.
pub fn move_into(root: &Path, note: &Path, folder: &str) -> Result<PathBuf, String> {
    let dir = resolve(root, folder)?;
    if !dir.is_dir() {
        return Err(format!("A pasta {folder} não existe."));
    }
    if !note.starts_with(root) || !note.is_file() {
        return Err("Nota inválida.".into());
    }
    let from = note.parent().ok_or("Nota inválida.")?;
    if from == dir {
        return Ok(note.to_path_buf());
    }
    let stem = note
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Nota inválida.")?;
    let target = crate::note::free_path(&dir, stem)?;
    let text = fs::read_to_string(note).map_err(|e| format!("Não foi possível ler a nota: {e}"))?;
    let moved = move_assets(&text, from, note, &dir)?;
    if moved == text {
        fs::rename(note, &target).map_err(|e| format!("Não foi possível mover a nota: {e}"))?;
    } else {
        fs::write(&target, moved).map_err(|e| format!("Não foi possível mover a nota: {e}"))?;
        fs::remove_file(note).map_err(|e| format!("Não foi possível mover a nota: {e}"))?;
    }
    Ok(target)
}

/// Move a pasta `folder` para dentro de `parent`; devolve o novo caminho relativo.
pub fn move_folder_into(root: &Path, folder: &str, parent: &str) -> Result<String, String> {
    let folder = folder.trim_matches('/');
    let parent = parent.trim_matches('/');
    let name = folder.rsplit('/').next().unwrap_or(folder);
    if folder.is_empty() || parent == folder || parent.starts_with(&format!("{folder}/")) {
        return Err("Não dá para mover uma pasta para dentro dela mesma.".into());
    }
    let src = resolve(root, folder)?;
    let dest_parent = resolve(root, parent)?;
    if !src.is_dir() || !dest_parent.is_dir() {
        return Err("Pasta inválida.".into());
    }
    let new_path = if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    };
    if new_path == folder {
        return Ok(new_path);
    }
    let dest = dest_parent.join(name);
    if dest.exists() {
        return Err(format!("Já existe uma pasta chamada {name} ali."));
    }
    fs::rename(&src, &dest).map_err(|e| format!("Não foi possível mover a pasta: {e}"))?;

    // A ordem salva das subpastas acompanha o novo caminho.
    let order = load_order(root);
    let renamed: Order = order
        .into_iter()
        .map(|(key, items)| {
            let key = if key == folder {
                new_path.clone()
            } else if let Some(rest) = key.strip_prefix(&format!("{folder}/")) {
                format!("{new_path}/{rest}")
            } else {
                key
            };
            (key, items)
        })
        .collect();
    save_order(root, &renamed)?;
    Ok(new_path)
}

/// Cria `name` dentro de `parent` (relativo à pasta de notas) e devolve o caminho relativo.
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

fn order_path(root: &Path) -> PathBuf {
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

/// Move a nota para `folder` e devolve o novo caminho.
#[tauri::command]
pub async fn move_note(
    state: tauri::State<'_, IndexState>,
    path: String,
    folder: String,
) -> Result<String, String> {
    let target = move_into(&root(&state)?, Path::new(&path), &folder)?;
    state.resync();
    Ok(target.display().to_string())
}

/// Move a pasta para dentro de `parent` e devolve o novo caminho relativo.
#[tauri::command]
pub async fn move_folder(
    state: tauri::State<'_, IndexState>,
    folder: String,
    parent: String,
) -> Result<String, String> {
    let moved = move_folder_into(&root(&state)?, &folder, &parent)?;
    state.resync();
    Ok(moved)
}

/// Manda a pasta inteira (com as notas) para a lixeira do sistema.
///
/// `async` roda fora da thread principal, então a janela não congela.
#[tauri::command]
pub async fn trash_folder(
    state: tauri::State<'_, IndexState>,
    folder: String,
) -> Result<(), String> {
    let root = root(&state)?;
    let dir = resolve(&root, &folder)?;
    if dir == root || !dir.is_dir() {
        return Err(format!("Pasta inválida: {folder}"));
    }
    crate::note::trash(&dir)?;
    state.resync();
    Ok(())
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
        let root = std::env::temp_dir().join(format!("notesea-folder-{}", std::process::id()));
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

        fs::write(root.join("a.md"), "# A").unwrap();
        fs::write(root.join("Estudos/a.md"), "# outra").unwrap();
        let movida = move_into(&root, &root.join("a.md"), "Estudos").unwrap();
        assert_eq!(movida, root.join("Estudos/a-2.md"));
        assert!(!root.join("a.md").exists());
        assert!(move_into(&root, &movida, "Nada").is_err());
        assert_eq!(move_into(&root, &movida, "").unwrap(), root.join("a-2.md"));

        // Imagens vão junto; a compartilhada com outra nota é copiada.
        fs::create_dir_all(root.join("assets")).unwrap();
        fs::write(root.join("assets/x.png"), "x").unwrap();
        fs::write(root.join("assets/y.png"), "y").unwrap();
        fs::write(root.join("img.md"), "![](assets/x.png) ![](./assets/y.png)").unwrap();
        fs::write(root.join("dup.md"), "![](assets/y.png)").unwrap();
        fs::create_dir_all(root.join("Estudos/assets")).unwrap();
        fs::write(root.join("Estudos/assets/x.png"), "outra").unwrap();
        let img = move_into(&root, &root.join("img.md"), "Estudos").unwrap();
        let texto = fs::read_to_string(&img).unwrap();
        assert_eq!(texto, "![](assets/x-2.png) ![](./assets/y.png)");
        assert_eq!(
            fs::read_to_string(root.join("Estudos/assets/x-2.png")).unwrap(),
            "x"
        );
        assert!(!root.join("assets/x.png").exists());
        assert!(root.join("assets/y.png").exists());
        assert!(root.join("Estudos/assets/y.png").exists());

        // Pastas: para dentro de outra, nunca dentro de si mesma.
        assert_eq!(
            move_folder_into(&root, "Estudos/Cache", "").unwrap(),
            "Cache"
        );
        assert!(root.join("Cache").is_dir());
        assert!(move_folder_into(&root, "Estudos", "Estudos/Sub").is_err());
        assert_eq!(
            move_folder_into(&root, "Cache", "Estudos").unwrap(),
            "Estudos/Cache"
        );

        let mut order = Order::new();
        order.insert("".into(), vec!["b.md".into(), "Estudos/".into()]);
        save_order(&root, &order).unwrap();
        assert_eq!(load_order(&root), order);

        fs::remove_dir_all(&root).unwrap();
    }
}
