//! Pasta local de notas: sugestão inicial, abertura e lembrança da última pasta.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Pasta interna para índice e configuração da pasta de notas.
pub const INTERNAL_DIR: &str = ".notesea";
/// Nome antigo da pasta interna (quando o app se chamava Aquarium), migrado ao abrir.
const LEGACY_INTERNAL_DIR: &str = ".aquarium";
/// Identificador antigo do app; o estado dele é migrado na primeira execução.
const LEGACY_IDENTIFIER: &str = "com.vitorgalache.aquarium";
const CONFIG_FILE: &str = "config.json";
/// Estado do app (fora da pasta do usuário) com a última pasta aberta.
const STATE_FILE: &str = "state.json";
/// Quantas pastas recentes o app lembra.
const MAX_RECENT: usize = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    path: String,
    note_count: usize,
    is_new: bool,
    config: VaultConfig,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Startup {
    suggested_path: Option<String>,
    vault: Option<Vault>,
    error: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppState {
    last_path: Option<PathBuf>,
    /// Pastas abertas, da mais recente para a mais antiga.
    #[serde(default)]
    recent: Vec<PathBuf>,
}

impl AppState {
    /// Marca a pasta como a última usada, no topo das recentes.
    fn touch(&mut self, path: &Path) {
        self.recent.retain(|p| p != path);
        self.recent.insert(0, path.to_path_buf());
        self.recent.truncate(MAX_RECENT);
        self.last_path = Some(path.to_path_buf());
    }

    /// Recentes, incluindo a última pasta de versões que ainda não tinham a lista.
    fn recent(&self) -> Vec<PathBuf> {
        match &self.last_path {
            Some(last) if !self.recent.contains(last) => {
                let mut list = vec![last.clone()];
                list.extend(self.recent.iter().cloned());
                list
            }
            _ => self.recent.clone(),
        }
    }
}

fn display(paths: Vec<PathBuf>) -> Vec<String> {
    paths.iter().map(|p| p.display().to_string()).collect()
}

/// Tema da interface; `sistema` segue o modo claro/escuro do sistema.
#[derive(Serialize, Deserialize, Clone, Copy, Default, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Sistema,
    Claro,
    Escuro,
}

/// Configurações da pasta de notas, em `.notesea/config.json`.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VaultConfig {
    #[serde(default = "config_version")]
    version: u32,
    #[serde(default = "default_shortcut")]
    capture_shortcut: String,
    #[serde(default)]
    theme: Theme,
}

fn config_version() -> u32 {
    1
}

fn default_shortcut() -> String {
    crate::capture::DEFAULT_SHORTCUT.to_string()
}

impl Default for VaultConfig {
    fn default() -> Self {
        Self {
            version: config_version(),
            capture_shortcut: default_shortcut(),
            theme: Theme::default(),
        }
    }
}

fn config_path(root: &Path) -> PathBuf {
    root.join(INTERNAL_DIR).join(CONFIG_FILE)
}

/// Lê a configuração; arquivo ausente ou corrompido volta ao padrão.
fn load_config(root: &Path) -> VaultConfig {
    fs::read_to_string(config_path(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_config(root: &Path, config: &VaultConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(root), json)
        .map_err(|e| format!("Não foi possível salvar as configurações: {e}"))
}

/// Aplica o que depende do app (atalho global); falhas não impedem abrir a pasta.
fn apply_config(app: &AppHandle, config: &VaultConfig) {
    if let Err(error) = crate::capture::set_shortcut(app, &config.capture_shortcut) {
        eprintln!("{error}");
    }
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Não foi possível localizar a configuração do app: {e}"))?;
    Ok(dir.join(STATE_FILE))
}

/// Estado da versão com o nome antigo, que ficava em outro diretório de dados.
fn legacy_state_path(path: &Path) -> Option<PathBuf> {
    Some(
        path.parent()?
            .parent()?
            .join(LEGACY_IDENTIFIER)
            .join(STATE_FILE),
    )
}

fn read_state(path: &Path) -> Option<AppState> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

/// Lê o estado; na primeira execução após a troca de nome, migra o do diretório antigo.
fn load_state(app: &AppHandle) -> AppState {
    let Ok(path) = state_path(app) else {
        return AppState::default();
    };
    if path.exists() {
        return read_state(&path).unwrap_or_default();
    }
    let Some(legacy) = legacy_state_path(&path).and_then(|p| read_state(&p)) else {
        return AppState::default();
    };
    if let Err(error) = save_state(app, &legacy) {
        eprintln!("{error}");
    }
    legacy
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

/// Prepara a pasta de notas: cria se faltar, garante `.notesea/` (migrando a antiga
/// `.notesea/`) e conta as notas.
fn prepare(path: &Path) -> Result<Vault, String> {
    let inaccessible =
        |e: std::io::Error| format!("A pasta {} está inacessível: {e}", path.display());

    if path.exists() && !path.is_dir() {
        return Err(format!("{} não é uma pasta.", path.display()));
    }
    fs::create_dir_all(path).map_err(inaccessible)?;

    let internal = path.join(INTERNAL_DIR);
    let legacy = path.join(LEGACY_INTERNAL_DIR);
    if !internal.exists() && legacy.is_dir() {
        fs::rename(&legacy, &internal).map_err(inaccessible)?;
    }
    let is_new = !internal.exists();
    fs::create_dir_all(&internal).map_err(inaccessible)?;
    if !config_path(path).exists() {
        write_config(path, &VaultConfig::default())?;
    }
    let config = load_config(path);

    let note_count = count_notes(path)
        .map_err(|e| format!("A pasta {} está inacessível: {e}", path.display()))?;
    Ok(Vault {
        path: path.display().to_string(),
        note_count,
        is_new,
        config,
    })
}

/// Estado inicial: reabre a última pasta ou sugere `Documentos/Notesea`.
#[tauri::command]
pub fn startup(app: AppHandle) -> Startup {
    let suggested_path = app
        .path()
        .document_dir()
        .ok()
        .map(|d| d.join("Notesea").display().to_string());

    let Some(last) = load_state(&app).last_path else {
        return Startup {
            suggested_path,
            vault: None,
            error: None,
        };
    };

    // Não recria a pasta lembrada: se sumiu (disco removido, renomeada), avisamos.
    let result = if last.is_dir() {
        prepare(&last)
            .and_then(|a| crate::index::start(&app, &last).map(|()| a))
            .inspect(|a| apply_config(&app, &a.config))
    } else {
        Err(format!(
            "Não encontramos a pasta {}. Ela pode ter sido movida, renomeada ou estar em um disco desconectado.",
            last.display()
        ))
    };
    match result {
        Ok(vault) => Startup {
            suggested_path,
            vault: Some(vault),
            error: None,
        },
        Err(error) => Startup {
            suggested_path: Some(last.display().to_string()),
            vault: None,
            error: Some(error),
        },
    }
}

/// Abre (ou cria) a pasta de notas escolhida e lembra dela.
#[tauri::command]
pub fn open_vault(app: AppHandle, path: String) -> Result<Vault, String> {
    let path = PathBuf::from(path);
    let vault = prepare(&path)?;
    crate::index::start(&app, &path)?;
    apply_config(&app, &vault.config);
    let mut state = load_state(&app);
    state.recent = state.recent();
    state.touch(&path);
    save_state(&app, &state)?;
    Ok(vault)
}

/// Pastas abertas recentemente, da mais nova para a mais antiga.
#[tauri::command]
pub fn recent_vaults(app: AppHandle) -> Vec<String> {
    display(load_state(&app).recent())
}

/// Tira a pasta da lista de recentes (os arquivos não são tocados).
#[tauri::command]
pub fn forget_vault(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(path);
    let mut state = load_state(&app);
    state.recent = state.recent();
    state.recent.retain(|p| *p != path);
    if state.last_path.as_ref() == Some(&path) {
        state.last_path = None;
    }
    save_state(&app, &state)?;
    Ok(display(state.recent))
}

/// Salva as configurações da pasta aberta; o atalho é validado antes de gravar.
#[tauri::command]
pub fn save_config(
    app: AppHandle,
    state: tauri::State<crate::index::IndexState>,
    config: VaultConfig,
) -> Result<VaultConfig, String> {
    let root = state.root().ok_or("Nenhuma pasta aberta.")?;
    crate::capture::set_shortcut(&app, &config.capture_shortcut)?;
    write_config(&root, &config)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recentes_sem_repeticao_e_com_limite() {
        let mut state: AppState = serde_json::from_str(r#"{ "lastPath": "/a" }"#).unwrap();
        assert_eq!(state.recent(), vec![PathBuf::from("/a")]);
        state.recent = state.recent();
        state.touch(Path::new("/b"));
        state.touch(Path::new("/a"));
        assert_eq!(state.recent, vec![PathBuf::from("/a"), PathBuf::from("/b")]);
        for i in 0..20 {
            state.touch(Path::new(&format!("/p{i}")));
        }
        assert_eq!(state.recent.len(), MAX_RECENT);
        assert_eq!(state.last_path, Some(PathBuf::from("/p19")));
    }

    #[test]
    fn prepara_pasta_nova_e_existente() {
        let root = std::env::temp_dir().join(format!("notesea-test-{}", std::process::id()));
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

    #[test]
    fn migra_pasta_interna_antiga() {
        let root = std::env::temp_dir().join(format!("notesea-legado-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(LEGACY_INTERNAL_DIR)).unwrap();
        fs::write(
            root.join(LEGACY_INTERNAL_DIR).join(CONFIG_FILE),
            r#"{ "version": 1, "theme": "escuro" }"#,
        )
        .unwrap();

        let migrado = prepare(&root).unwrap();
        assert!(!migrado.is_new);
        assert_eq!(migrado.config.theme, Theme::Escuro);
        assert!(!root.join(LEGACY_INTERNAL_DIR).exists());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn config_antiga_ganha_padroes_e_persiste() {
        let root = std::env::temp_dir().join(format!("notesea-config-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(INTERNAL_DIR)).unwrap();
        fs::write(config_path(&root), r#"{ "version": 1 }"#).unwrap();

        let config = prepare(&root).unwrap().config;
        assert_eq!(config, VaultConfig::default());

        let novo = VaultConfig {
            capture_shortcut: "Alt+KeyJ".into(),
            theme: Theme::Escuro,
            ..config
        };
        write_config(&root, &novo).unwrap();
        assert_eq!(load_config(&root), novo);
        let json = fs::read_to_string(config_path(&root)).unwrap();
        assert!(json.contains(r#""theme": "escuro""#));
        assert!(json.contains(r#""captureShortcut": "Alt+KeyJ""#));

        fs::remove_dir_all(&root).unwrap();
    }
}
