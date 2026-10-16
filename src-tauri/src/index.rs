//! Índice local em SQLite (`.notesea/index.db`) e observação da pasta.
//!
//! O índice é descartável: os arquivos Markdown são a fonte da verdade e uma
//! sincronização compara caminho, data de modificação e tamanho para reindexar
//! só o que mudou. Apagar `.notesea/` faz o próximo `open` reconstruir tudo.

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
const SCHEMA_VERSION: i64 = 4;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS notes (
    path TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    depth TEXT NOT NULL,
    corrente TEXT,
    cardume TEXT,
    folder TEXT NOT NULL,
    tags TEXT NOT NULL,
    created TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    chars INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_id ON notes(id);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    path UNINDEXED,
    title,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);
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

/// Índice da pasta de notas aberta e o observador que o mantém atualizado.
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
    let path = root.join(crate::vault::INTERNAL_DIR).join(DB_FILE);
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
            "DROP TABLE IF EXISTS notes; DROP TABLE IF EXISTS notes_fts; PRAGMA user_version = {SCHEMA_VERSION};"
        ))
        .map_err(err)?;
    }
    conn.execute_batch(SCHEMA).map_err(err)?;
    Ok(conn)
}

/// Arquivos `.md` da pasta (ignorando ocultos, como `.notesea/`) com mtime e tamanho.
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

/// Subpasta da nota relativa à pasta de notas (`""` na raiz), sempre com `/`.
fn folder_of(root: &Path, path: &Path) -> String {
    path.parent()
        .and_then(|dir| dir.strip_prefix(root).ok())
        .map(|rel| {
            rel.components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .unwrap_or_default()
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
        let path = path.display().to_string();
        tx.execute("DELETE FROM notes WHERE path = ?1", [&path])
            .map_err(err)?;
        tx.execute("DELETE FROM notes_fts WHERE path = ?1", [&path])
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
        let folder = folder_of(root, path);
        let tags = n.tags.join("\n");
        tx.execute(
            "INSERT OR REPLACE INTO notes (path, id, title, depth, corrente, cardume, folder, tags, created, excerpt, chars, mtime, size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![n.path, n.id, n.title, n.depth, n.corrente, n.cardume, folder, tags, n.created, excerpt, chars as i64, mtime, size],
        )
        .map_err(err)?;
        tx.execute("DELETE FROM notes_fts WHERE path = ?1", [&n.path])
            .map_err(err)?;
        tx.execute(
            "INSERT INTO notes_fts (path, title, body) VALUES (?1, ?2, ?3)",
            params![n.path, n.title, n.body],
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

/// Abre o índice da pasta, indexa em segundo plano e passa a observar a pasta.
pub fn start(app: &AppHandle, root: &Path) -> Result<(), String> {
    let state = app.state::<IndexState>();
    let mut session = state.session.lock().unwrap();
    if session.as_ref().is_some_and(|s| s.root == root) {
        return Ok(());
    }
    // Encerra o observador anterior antes de abrir outra pasta.
    *session = None;

    let mut conn = open_db(root)?;
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let relevant = res.is_ok_and(|e| {
            e.paths.iter().any(|p| {
                !p.components()
                    .any(|c| c.as_os_str() == crate::vault::INTERNAL_DIR)
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
        // O canal fecha quando o observador é descartado (outra pasta aberta).
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
    /// Conexão nova com o índice da pasta aberta, para registrar sinais.
    pub fn db(&self) -> Option<Connection> {
        let root = self.session.lock().unwrap().as_ref()?.root.clone();
        open_db(&root).ok()
    }

    /// Pasta de notas aberta.
    pub fn root(&self) -> Option<PathBuf> {
        Some(self.session.lock().unwrap().as_ref()?.root.clone())
    }

    /// Reindexa já, para a lista refletir na hora uma mudança feita pelo app.
    pub fn resync(&self) {
        let Some(root) = self.root() else { return };
        let result = open_db(&root).and_then(|mut conn| sync(&mut conn, &root));
        if let Err(e) = result {
            eprintln!("Falha ao indexar {}: {e}", root.display());
        }
    }
}

/// Estado atual do índice (para quem chegou depois do último evento).
#[tauri::command]
pub fn index_status(state: tauri::State<IndexState>) -> IndexStatus {
    state.status.lock().unwrap().clone()
}

/// Resumo de uma nota para os cards da pasta de notas.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    path: String,
    title: String,
    excerpt: String,
    depth: String,
    corrente: Option<String>,
    cardume: Option<String>,
    /// Subpasta relativa à pasta de notas (`""` na raiz).
    folder: String,
    tags: Vec<String>,
    created: String,
    /// Última edição do arquivo, em milissegundos desde a época Unix.
    modified: i64,
}

/// Notas indexadas, da última editada para a mais antiga.
pub fn notes(conn: &Connection) -> Result<Vec<NoteSummary>, String> {
    let err = |e: rusqlite::Error| e.to_string();
    let mut stmt = conn
        .prepare(
            "SELECT path, title, excerpt, depth, corrente, cardume, folder, tags, created, mtime
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
            folder: r.get(6)?,
            tags: r.get::<_, String>(7)?.lines().map(str::to_string).collect(),
            created: r.get(8)?,
            modified: r.get(9)?,
        })
    })
    .map_err(err)?
    .collect::<Result<_, _>>()
    .map_err(err)
}

#[tauri::command]
pub fn list_notes(state: tauri::State<IndexState>) -> Result<Vec<NoteSummary>, String> {
    let conn = state.db().ok_or("Nenhuma pasta aberta.")?;
    notes(&conn)
}

/// Resultado da busca rápida; `snippet` marca os termos entre `\u{1}` e `\u{2}`.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    path: String,
    title: String,
    folder: String,
    snippet: String,
}

/// Consulta FTS5 em que cada palavra digitada vira um prefixo (`"pal"*`).
fn fts_query(text: &str) -> Option<String> {
    let terms: Vec<String> = text
        .split_whitespace()
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

/// Busca por título e conteúdo, títulos pesando mais que o corpo.
pub fn search(conn: &Connection, text: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let Some(query) = fts_query(text) else {
        return Ok(Vec::new());
    };
    let err = |e: rusqlite::Error| e.to_string();
    let mut stmt = conn
        .prepare(
            "SELECT f.path, n.title, n.folder,
                    snippet(notes_fts, 2, char(1), char(2), '…', 12)
             FROM notes_fts f JOIN notes n ON n.path = f.path
             WHERE notes_fts MATCH ?1
             ORDER BY bm25(notes_fts, 0.0, 10.0, 1.0), n.mtime DESC
             LIMIT ?2",
        )
        .map_err(err)?;
    stmt.query_map(params![query, limit as i64], |r| {
        Ok(SearchHit {
            path: r.get(0)?,
            title: r.get(1)?,
            folder: r.get(2)?,
            snippet: r.get(3)?,
        })
    })
    .map_err(err)?
    .collect::<Result<_, _>>()
    .map_err(err)
}

#[tauri::command]
pub fn search_notes(
    state: tauri::State<IndexState>,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.db().ok_or("Nenhuma pasta aberta.")?;
    search(&conn, &query, 30)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sincroniza_e_reconstroi() {
        let root = std::env::temp_dir().join(format!("notesea-index-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let internal = root.join(crate::vault::INTERNAL_DIR);
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::create_dir_all(&internal).unwrap();
        fs::write(root.join("a.md"), "---\nid: a\ndepth: fundo\n---\n# A\n").unwrap();
        fs::write(root.join("sub/b.md"), "---\ntags: [x, y]\n---\n# B\n").unwrap();
        fs::write(internal.join("x.md"), "ignorado").unwrap();

        let mut conn = open_db(&root).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 2);
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "A");
        let listed = notes(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        assert!(
            listed
                .iter()
                .any(|n| n.title == "A" && n.depth == "fundo" && n.folder.is_empty())
        );
        assert!(
            listed
                .iter()
                .any(|n| n.folder == "sub" && n.tags == ["x", "y"])
        );

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

        // Índice descartável: apagar `.notesea/` e reabrir reconstrói.
        drop(conn);
        fs::remove_dir_all(&internal).unwrap();
        fs::create_dir_all(&internal).unwrap();
        let mut conn = open_db(&root).unwrap();
        assert_eq!(sync(&mut conn, &root).unwrap(), 1);

        drop(conn);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn busca_titulo_e_conteudo_rapido() {
        let root = std::env::temp_dir().join(format!("notesea-search-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(crate::vault::INTERNAL_DIR)).unwrap();
        fs::create_dir_all(root.join("estudo")).unwrap();
        fs::write(
            root.join("estudo/peixe.md"),
            "# Peixes\n\nO salmão nada contra a corrente.\n",
        )
        .unwrap();
        fs::write(
            root.join("outra.md"),
            "# Outra\n\nNada a ver com \"aspas\".\n",
        )
        .unwrap();
        for i in 0..1000 {
            fs::write(
                root.join(format!("n{i}.md")),
                format!("# Nota {i}\n\nTexto qualquer {i} sobre ideias.\n"),
            )
            .unwrap();
        }
        let mut conn = open_db(&root).unwrap();
        sync(&mut conn, &root).unwrap();

        let hits = search(&conn, "salmao corr", 30).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Peixes");
        assert_eq!(hits[0].folder, "estudo");
        assert!(hits[0].snippet.contains("\u{1}salmão\u{2}"));
        assert_eq!(search(&conn, "peix", 30).unwrap()[0].title, "Peixes");
        assert!(search(&conn, "\"aspas", 30).unwrap().len() == 1);
        assert!(search(&conn, "   ", 30).unwrap().is_empty());

        let start = std::time::Instant::now();
        assert_eq!(search(&conn, "ideias", 30).unwrap().len(), 30);
        assert!(start.elapsed() < Duration::from_millis(100));

        fs::remove_file(root.join("estudo/peixe.md")).unwrap();
        sync(&mut conn, &root).unwrap();
        assert!(search(&conn, "salmao", 30).unwrap().is_empty());

        drop(conn);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn afunda_no_lodo_e_grava_so_quando_muda() {
        let root = std::env::temp_dir().join(format!("notesea-depth-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(crate::vault::INTERNAL_DIR)).unwrap();
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
