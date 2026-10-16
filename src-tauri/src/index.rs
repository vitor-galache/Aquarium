//! Índice local em SQLite (`.aquarium/index.db`) e observação da pasta.
//!
//! O índice é descartável: os arquivos Markdown são a fonte da verdade e uma
//! sincronização compara caminho, data de modificação e tamanho para reindexar
//! só o que mudou. Apagar `.aquarium/` faz o próximo `open` reconstruir tudo.

use crate::{depth, note};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::{Connection, params};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const DB_FILE: &str = "index.db";
/// Evento emitido ao frontend quando o estado do índice muda.
pub const STATUS_EVENT: &str = "index-status";
/// Espera após o último evento da pasta antes de reindexar (salvamentos geram rajadas).
const DEBOUNCE: Duration = Duration::from_millis(300);

/// Versão do esquema; ao mudar, a tabela `notes` é reconstruída (os sinais ficam).
const SCHEMA_VERSION: i64 = 2;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS notes (
    path TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    depth TEXT NOT NULL,
    corrente TEXT,
    cardume TEXT,
    created TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    chars INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_id ON notes(id);
CREATE TABLE IF NOT EXISTS signals (
    note_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_note ON signals(note_id);
";

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    indexing: bool,
    note_count: usize,
}

/// Índice do aquário aberto e o observador que o mantém atualizado.
struct Session {
    root: PathBuf,
    _watcher: RecommendedWatcher,
}

/// Estado gerenciado pelo Tauri.
#[derive(Default)]
pub struct IndexState {
    session: Mutex<Option<Session>>,
    status: Arc<Mutex<IndexStatus>>,
}

pub fn open_db(root: &Path) -> Result<Connection, String> {
    let path = root.join(crate::aquarium::INTERNAL_DIR).join(DB_FILE);
    let conn = Connection::open(&path)
        .map_err(|e| format!("Não foi possível abrir o índice {}: {e}", path.display()))?;
    let err = |e: rusqlite::Error| e.to_string();
    // O índice de notas pode ser escrito por outra conexão (thread de indexação).
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if version < SCHEMA_VERSION {
        conn.execute_batch(&format!(
            "DROP TABLE IF EXISTS notes; PRAGMA user_version = {SCHEMA_VERSION};"
        ))
        .map_err(err)?;
    }
    conn.execute_batch(SCHEMA).map_err(err)?;
    Ok(conn)
}

/// Arquivos `.md` da pasta (ignorando ocultos, como `.aquarium/`) com mtime e tamanho.
fn scan(dir: &Path, out: &mut HashMap<PathBuf, (i64, i64)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            scan(&path, out);
        } else if is_note(&path) {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as i64);
            out.insert(path, (mtime, meta.len() as i64));
        }
    }
}

fn is_note(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

/// Sincroniza o índice com a pasta e devolve o número de notas.
pub fn sync(conn: &mut Connection, root: &Path) -> Result<usize, String> {
    let mut files = HashMap::new();
    scan(root, &mut files);

    let err = |e: rusqlite::Error| e.to_string();
    let tx = conn.transaction().map_err(err)?;
    let indexed: HashMap<PathBuf, (i64, i64)> = {
        let mut stmt = tx
            .prepare("SELECT path, mtime, size FROM notes")
            .map_err(err)?;
        stmt.query_map([], |r| {
            Ok((
                PathBuf::from(r.get::<_, String>(0)?),
                (r.get(1)?, r.get(2)?),
            ))
        })
        .map_err(err)?
        .collect::<Result<_, _>>()
        .map_err(err)?
    };

    for path in indexed.keys().filter(|p| !files.contains_key(*p)) {
        tx.execute(
            "DELETE FROM notes WHERE path = ?1",
            [path.display().to_string()],
        )
        .map_err(err)?;
    }
    for (path, (mtime, size)) in &files {
        if indexed.get(path) == Some(&(*mtime, *size)) {
            continue;
        }
        // Arquivo pode sumir ou estar em escrita; a próxima sincronização corrige.
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let (n, chars, excerpt) = note::summarize(path, &content);
        tx.execute(
            "INSERT OR REPLACE INTO notes (path, id, title, depth, corrente, cardume, created, excerpt, chars, mtime, size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![n.path, n.id, n.title, n.depth, n.corrente, n.cardume, n.created, excerpt, chars as i64, mtime, size],
        )
        .map_err(err)?;
    }
    let count: i64 = tx
        .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
        .map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(count as usize)
}

/// Recalcula a camada de todas as notas indexadas (ex.: as que afundaram no
/// lodo com o passar dos dias) e grava no arquivo só as que mudaram.
pub fn refresh_depths(conn: &Connection, today: i64) -> Result<usize, String> {
    let err = |e: rusqlite::Error| e.to_string();
    let rows: Vec<(String, String, String, String, bool, i64)> = {
        let mut stmt = conn
            .prepare("SELECT path, id, created, depth, corrente IS NOT NULL, chars FROM notes WHERE id != ''")
            .map_err(err)?;
        stmt.query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(err)?
        .collect::<Result<_, _>>()
        .map_err(err)?
    };
    let mut changed = 0;
    for (path, id, created, current, has_corrente, chars) in rows {
        let facts = depth::NoteFacts {
            id: &id,
            created: &created,
            depth: &current,
            chars: chars as usize,
            has_corrente,
        };
        let new = depth::depth_of(conn, &facts, today)?.as_str();
        if new != current {
            note::write_depth(Path::new(&path), new)?;
            changed += 1;
        }
    }
    Ok(changed)
}

fn set_status(app: &AppHandle, status: &Mutex<IndexStatus>, new: IndexStatus) {
    *status.lock().unwrap() = new.clone();
    let _ = app.emit(STATUS_EVENT, new);
}

/// Abre o índice do aquário, indexa em segundo plano e passa a observar a pasta.
pub fn start(app: &AppHandle, root: &Path) -> Result<(), String> {
    let state = app.state::<IndexState>();
    let mut session = state.session.lock().unwrap();
    if session.as_ref().is_some_and(|s| s.root == root) {
        return Ok(());
    }
    // Encerra o observador anterior antes de abrir outro aquário.
    *session = None;

    let mut conn = open_db(root)?;
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let relevant = res.is_ok_and(|e| {
            e.paths.iter().any(|p| {
                !p.components()
                    .any(|c| c.as_os_str() == crate::aquarium::INTERNAL_DIR)
            })
        });
        if relevant {
            let _ = tx.send(());
        }
    })
    .map_err(|e| format!("Não foi possível observar a pasta: {e}"))?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| format!("Não foi possível observar a pasta: {e}"))?;

    let status = state.status.clone();
    let app = app.clone();
    let dir = root.to_path_buf();
    // Lê fora da chamada: o guard temporário viveria até o fim da instrução
    // e `set_status` travaria no mesmo Mutex (deadlock e tela branca).
    let note_count = status.lock().unwrap().note_count;
    set_status(
        &app,
        &status,
        IndexStatus {
            indexing: true,
            note_count,
        },
    );
    thread::spawn(move || {
        let mut run = || match sync(&mut conn, &dir) {
            // As gravações de `depth` disparam o observador, que reindexa em seguida.
            Ok(_)
                if refresh_depths(&conn, note::today())
                    .inspect_err(|e| eprintln!("Falha ao recalcular profundidades: {e}"))
                    .is_ok_and(|n| n > 0) => {}
            Ok(note_count) => set_status(
                &app,
                &status,
                IndexStatus {
                    indexing: false,
                    note_count,
                },
            ),
            Err(e) => eprintln!("Falha ao indexar {}: {e}", dir.display()),
        };
        run();
        // O canal fecha quando o observador é descartado (outro aquário aberto).
        while rx.recv().is_ok() {
            while rx.recv_timeout(DEBOUNCE).is_ok() {}
            run();
        }
    });

    *session = Some(Session {
        root: root.to_path_buf(),
        _watcher: watcher,
    });
    Ok(())
}

impl IndexState {
    /// Conexão nova com o índice do aquário aberto, para registrar sinais.
    pub fn db(&self) -> Option<Connection> {
        let root = self.session.lock().unwrap().as_ref()?.root.clone();
        open_db(&root).ok()
    }
}

/// Estado atual do índice (para quem chegou depois do último evento).
#[tauri::command]
pub fn index_status(state: tauri::State<IndexState>) -> IndexStatus {
    state.status.lock().unwrap().clone()
}

/// Resumo de uma nota para os cards do aquário.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    path: String,
    title: String,
    excerpt: String,
    depth: String,
    corrente: Option<String>,
    cardume: Option<String>,
    created: String,
    /// Última edição do arquivo, em milissegundos desde a época Unix.
    modified: i64,
}

/// Notas indexadas, da última editada para a mais antiga.
pub fn notes(conn: &Connection) -> Result<Vec<NoteSummary>, String> {
    let err = |e: rusqlite::Error| e.to_string();
    let mut stmt = conn
        .prepare(
            "SELECT path, title, excerpt, depth, corrente, cardume, created, mtime
             FROM notes ORDER BY mtime DESC, title",
        )
        .map_err(err)?;
    stmt.query_map([], |r| {
        Ok(NoteSummary {
            path: r.get(0)?,
            title: r.get(1)?,
            excerpt: r.get(2)?,
            depth: r.get(3)?,
            corrente: r.get(4)?,
            cardume: r.get(5)?,
            created: r.get(6)?,
            modified: r.get(7)?,
        })
    })
    .map_err(err)?
    .collect::<Result<_, _>>()
    .map_err(err)
}

#[tauri::command]
pub fn list_notes(state: tauri::State<IndexState>) -> Result<Vec<NoteSummary>, String> {
    let conn = state.db().ok_or("Nenhum aquário aberto.")?;
    notes(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sincroniza_e_reconstroi() {
        let root = std::env::temp_dir().join(format!("aquarium-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let internal = root.join(crate::aquarium::INTERNAL_DIR);
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::create_dir_all(&internal).unwrap();
        fs::write(root.join("a.md"), "---\nid: a\ndepth: fundo\n---\n# A\n").unwrap();
        fs::write(root.join("sub/b.md"), "# B\n").unwrap();
        fs::write(internal.join("x.md"), "ignorado").unwrap();

        let mut conn = open_db(&root).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 2);
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "A");
        let listed = notes(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|n| n.title == "A" && n.depth == "fundo"));

        // Edição, remoção e renomeação feitas fora do app.
        fs::write(root.join("a.md"), "---\nid: a\n---\n# A editada\n").unwrap();
        fs::rename(root.join("sub/b.md"), root.join("c.md")).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 2);
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "A editada");
        fs::remove_file(root.join("c.md")).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 1);

        // Índice descartável: apagar `.aquarium/` e reabrir reconstrói.
        drop(conn);
        fs::remove_dir_all(&internal).unwrap();
        fs::create_dir_all(&internal).unwrap();
        let mut conn = open_db(&root).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 1);

        drop(conn);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn afunda_no_lodo_e_grava_so_quando_muda() {
        let root = std::env::temp_dir().join(format!("aquarium-depth-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(crate::aquarium::INTERNAL_DIR)).unwrap();
        let velha = "---\nid: v\ncreated: 2020-01-01T00:00:00Z\ndepth: fundo\n---\n# V\n";
        let nova = "---\nid: n\ncreated: 2020-01-01T00:00:00Z\ndepth: superficie\n---\n# N\n";
        fs::write(root.join("v.md"), velha).unwrap();
        fs::write(root.join("n.md"), nova).unwrap();

        let mut conn = open_db(&root).unwrap();
        sync(&mut conn, &root).unwrap();
        let today = depth::day_number("2020-01-10").unwrap();
        depth::record(&conn, "n", depth::Signal::Open, "2020-01-09T10:00:00Z").unwrap();
        assert_eq!(refresh_depths(&conn, today).unwrap(), 0);

        let later = depth::day_number("2021-01-01").unwrap();
        assert_eq!(refresh_depths(&conn, later).unwrap(), 2);
        let v = fs::read_to_string(root.join("v.md")).unwrap();
        assert_eq!(v, velha.replace("depth: fundo", "depth: lodo"));

        drop(conn);
        fs::remove_dir_all(&root).unwrap();
    }
}
