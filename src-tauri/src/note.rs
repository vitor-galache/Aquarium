//! Formato da nota: arquivo Markdown com frontmatter YAML mínimo.
//!
//! O frontmatter é tratado linha a linha: só as chaves do Aquarium são lidas e
//! alteradas; qualquer outra linha (de outros apps ou do usuário) é preservada
//! byte a byte. Veja `docs/formato-da-nota.md`.

use crate::depth::{self, Signal};
use crate::index::IndexState;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const DELIMITER: &str = "---";
/// Profundidades válidas; notas novas entram pela superfície.
pub const DEPTHS: [&str; 4] = ["superficie", "meia-agua", "fundo", "lodo"];
const DEFAULT_DEPTH: &str = "superficie";
/// Tamanho máximo do trecho mostrado nos cards.
const EXCERPT_CHARS: usize = 160;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub(crate) path: String,
    pub(crate) id: String,
    pub(crate) created: String,
    pub(crate) depth: String,
    pub(crate) corrente: Option<String>,
    pub(crate) cardume: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) title: String,
    body: String,
}

/// Nota em memória: linhas do frontmatter (sem os delimitadores) e corpo.
#[derive(Debug, PartialEq)]
struct Document {
    frontmatter: Option<Vec<String>>,
    body: String,
    newline: &'static str,
    bom: bool,
}

impl Document {
    fn parse(content: &str) -> Self {
        let newline = if content.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        let without_bom = content.strip_prefix('\u{feff}').unwrap_or(content);
        let mut lines = without_bom.split_inclusive('\n');
        let opens = lines
            .next()
            .is_some_and(|l| l.trim_end_matches(['\r', '\n']) == DELIMITER);
        if opens {
            let mut fm = Vec::new();
            let mut consumed = without_bom.split_inclusive('\n').next().unwrap().len();
            for line in lines {
                consumed += line.len();
                let text = line.trim_end_matches(['\r', '\n']);
                if text == DELIMITER {
                    return Document {
                        frontmatter: Some(fm),
                        body: without_bom[consumed..].to_string(),
                        newline,
                        bom: without_bom.len() != content.len(),
                    };
                }
                fm.push(text.to_string());
            }
        }
        // Sem frontmatter (ou sem fechamento): o arquivo inteiro é corpo.
        Document {
            frontmatter: None,
            body: content.to_string(),
            newline,
            bom: false,
        }
    }

    fn serialize(&self) -> String {
        match &self.frontmatter {
            None => self.body.clone(),
            Some(lines) => {
                let nl = self.newline;
                let bom = if self.bom { "\u{feff}" } else { "" };
                let mut out = format!("{bom}{DELIMITER}{nl}");
                for line in lines {
                    out.push_str(line);
                    out.push_str(nl);
                }
                out.push_str(DELIMITER);
                out.push_str(nl);
                out.push_str(&self.body);
                out
            }
        }
    }

    fn key_index(&self, key: &str) -> Option<usize> {
        self.frontmatter.as_ref()?.iter().position(|line| {
            line.strip_prefix(key)
                .is_some_and(|rest| rest.trim_start().starts_with(':'))
        })
    }

    fn get(&self, key: &str) -> Option<String> {
        let line = &self.frontmatter.as_ref()?[self.key_index(key)?];
        let value = line.split_once(':')?.1.trim();
        let value = unquote(value);
        (!value.is_empty()).then_some(value)
    }

    /// Define (ou remove, com `None`) uma chave sem tocar nas demais linhas.
    /// Valores iguais ao atual não reescrevem a linha, para evitar diffs.
    fn set(&mut self, key: &str, value: Option<&str>) {
        if self.get(key).as_deref() == value {
            return;
        }
        let index = self.key_index(key);
        let lines = self.frontmatter.get_or_insert_with(Vec::new);
        match (index, value) {
            (Some(i), Some(v)) => lines[i] = format!("{key}: {}", quote(v)),
            (Some(i), None) => {
                lines.remove(i);
            }
            (None, Some(v)) => lines.push(format!("{key}: {}", quote(v))),
            (None, None) => {}
        }
    }

    /// Tags do frontmatter: `tags: [a, b]`, `tags: a, b` ou lista em bloco (`- a`).
    fn tags(&self) -> Vec<String> {
        let Some(i) = self.key_index("tags") else {
            return Vec::new();
        };
        let lines = self.frontmatter.as_deref().unwrap_or_default();
        let inline = lines[i].split_once(':').map_or("", |(_, v)| v.trim());
        let items: Vec<String> = if inline.is_empty() {
            lines[i + 1..]
                .iter()
                .map_while(|l| l.trim_start().strip_prefix('-').map(str::trim))
                .map(unquote)
                .collect()
        } else {
            let inner = inline
                .strip_prefix('[')
                .and_then(|v| v.strip_suffix(']'))
                .unwrap_or(inline);
            inner.split(',').map(|t| unquote(t.trim())).collect()
        };
        clean_tags(items)
    }

    /// Grava as tags em uma linha (`tags: [a, b]`); lista vazia remove a chave.
    fn set_tags(&mut self, tags: &[String]) {
        if self.tags() == tags {
            return;
        }
        if let Some(i) = self.key_index("tags") {
            let lines = self.frontmatter.as_mut().unwrap();
            let block = lines[i + 1..]
                .iter()
                .take_while(|l| l.trim_start().starts_with('-'))
                .count();
            lines.drain(i..=i + block);
            if !tags.is_empty() {
                lines.insert(i, format_tags(tags));
            }
        } else if !tags.is_empty() {
            let line = format_tags(tags);
            self.frontmatter.get_or_insert_with(Vec::new).push(line);
        }
    }

    /// Completa as chaves obrigatórias que faltarem.
    fn complete(&mut self) {
        if self.frontmatter.is_none() {
            self.frontmatter = Some(Vec::new());
            // Separa o frontmatter do corpo com uma linha em branco.
            if !self.body.is_empty() && !self.body.starts_with(['\n', '\r']) {
                self.body.insert_str(0, self.newline);
            }
        }
        if self.get("id").is_none() {
            self.set("id", Some(&new_id()));
        }
        if self.get("created").is_none() {
            self.set("created", Some(&now_rfc3339()));
        }
        if !self
            .get("depth")
            .is_some_and(|d| DEPTHS.contains(&d.as_str()))
        {
            self.set("depth", Some(DEFAULT_DEPTH));
        }
    }

    fn title(&self, path: &Path) -> String {
        self.body
            .lines()
            .find_map(|l| l.strip_prefix("# ").map(|t| t.trim().to_string()))
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string()
            })
    }

    /// Começo do texto (sem o título e a marcação de cabeçalho) para os cards.
    fn excerpt(&self) -> String {
        let mut text = String::new();
        let lines = self.body.lines().map(str::trim).filter(|l| !l.is_empty());
        for line in lines.skip_while(|l| l.starts_with("# ")) {
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(line.trim_start_matches('#').trim_start());
            if text.chars().count() > EXCERPT_CHARS {
                break;
            }
        }
        if text.chars().count() > EXCERPT_CHARS {
            let cut: String = text.chars().take(EXCERPT_CHARS).collect();
            format!("{}…", cut.trim_end())
        } else {
            text
        }
    }

    fn chars(&self) -> usize {
        self.body.trim().chars().count()
    }

    /// Recalcula a camada a partir dos sinais; só reescreve `depth` se mudou.
    fn apply_depth(&mut self, conn: &Connection) -> Result<(), String> {
        let id = self.get("id").unwrap_or_default();
        let created = self.get("created").unwrap_or_default();
        let current = self.get("depth").unwrap_or_default();
        let facts = depth::NoteFacts {
            id: &id,
            created: &created,
            depth: &current,
            chars: self.chars(),
            has_corrente: self.get("corrente").is_some(),
        };
        let depth = depth::depth_of(conn, &facts, today())?;
        self.set("depth", Some(depth.as_str()));
        Ok(())
    }

    fn to_note(&self, path: &Path) -> Note {
        Note {
            path: path.display().to_string(),
            id: self.get("id").unwrap_or_default(),
            created: self.get("created").unwrap_or_default(),
            depth: self.get("depth").unwrap_or_default(),
            corrente: self.get("corrente"),
            cardume: self.get("cardume"),
            tags: self.tags(),
            title: self.title(path),
            body: self.body.clone(),
        }
    }
}

fn unquote(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        value[1..value.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else if value.len() >= 2 && value.starts_with('\'') && value.ends_with('\'') {
        value[1..value.len() - 1].replace("''", "'")
    } else {
        value.to_string()
    }
}

/// Remove vazias, repetidas e os caracteres que quebrariam a lista em linha.
fn clean_tags(tags: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags {
        let tag: String = tag
            .chars()
            .filter(|c| !matches!(c, ',' | '[' | ']'))
            .collect();
        let tag = tag.trim().trim_start_matches('#').trim().to_string();
        if !tag.is_empty() && !out.contains(&tag) {
            out.push(tag);
        }
    }
    out
}

fn format_tags(tags: &[String]) -> String {
    let items: Vec<String> = tags.iter().map(|t| quote(t)).collect();
    format!("tags: [{}]", items.join(", "))
}

fn quote(value: &str) -> String {
    let plain = !value.is_empty()
        && value.trim() == value
        && !value.starts_with([
            '"', '\'', '[', '{', '&', '*', '!', '|', '>', '%', '@', '`', '-',
        ])
        && !value.contains(": ")
        && !value.contains(" #")
        && !value.ends_with(':');
    if plain {
        value.to_string()
    } else {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

/// Identificador estável: milissegundos em base 36 + sufixo aleatório.
fn new_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let random = RandomState::new().build_hasher().finish() as u32;
    format!(
        "{}{:0>6}",
        to_base36(millis),
        to_base36(u128::from(random) % 36u128.pow(6))
    )
}

fn to_base36(mut n: u128) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    loop {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

/// Data/hora atual em UTC no formato `AAAA-MM-DDTHH:MM:SSZ`.
pub(crate) fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format_rfc3339(secs)
}

/// Dia atual (UTC) em dias desde 1970-01-01.
pub(crate) fn today() -> i64 {
    depth::day_number(&now_rfc3339()).unwrap_or(0)
}

fn format_rfc3339(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    // Algoritmo civil_from_days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

/// Slug do título para nome de arquivo: minúsculas, sem acentos, com hífens.
pub fn slugify(title: &str) -> String {
    let mut slug = String::new();
    for c in title.chars().flat_map(char::to_lowercase) {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            c => c,
        };
        if c.is_alphanumeric() {
            slug.push(c);
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug: String = slug.trim_end_matches('-').chars().take(80).collect();
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        "sem-titulo".to_string()
    } else {
        slug.to_string()
    }
}

/// Primeiro caminho livre `slug.md`, `slug-2.md`, `slug-3.md`… (sem diferenciar caixa).
fn free_path(dir: &Path, slug: &str) -> Result<PathBuf, String> {
    let existing: Vec<String> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .map(|n| n.to_lowercase())
        .collect();
    let mut n = 1;
    loop {
        let name = if n == 1 {
            format!("{slug}.md")
        } else {
            format!("{slug}-{n}.md")
        };
        if !existing.contains(&name) {
            return Ok(dir.join(name));
        }
        n += 1;
    }
}

/// Escrita atômica: grava num temporário na mesma pasta e renomeia por cima.
pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("Caminho de nota inválido.")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Caminho de nota inválido.")?;
    let tmp = dir.join(format!(".{name}.{}.tmp", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    result.map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Não foi possível salvar {}: {e}", path.display())
    })
}

/// Metadados da nota para o índice (nota, tamanho e trecho), sem alterar o arquivo.
pub fn summarize(path: &Path, content: &str) -> (Note, usize, String) {
    let doc = Document::parse(content);
    (doc.to_note(path), doc.chars(), doc.excerpt())
}

fn load(path: &Path) -> Result<(String, Document), String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Não foi possível ler {}: {e}", path.display()))?;
    let doc = Document::parse(&content);
    Ok((content, doc))
}

fn store(path: &Path, original: &str, doc: &Document) -> Result<(), String> {
    let updated = doc.serialize();
    if updated != original {
        write_atomic(path, &updated)?;
    }
    Ok(())
}

/// Abre a nota: completa o frontmatter que faltar, registra a abertura e
/// recalcula a profundidade. Abrir uma nota do lodo a traz de volta à superfície.
fn open_note(path: &Path, db: Option<&Connection>) -> Result<Note, String> {
    let (content, mut doc) = load(path)?;
    doc.complete();
    if let Some(conn) = db {
        let id = doc.get("id").unwrap_or_default();
        let now = now_rfc3339();
        if doc.get("depth").as_deref() == Some("lodo") {
            depth::record(conn, &id, Signal::Resurface, &now)?;
        }
        depth::record(conn, &id, Signal::Open, &now)?;
        doc.apply_depth(conn)?;
    }
    store(path, &content, &doc)?;
    Ok(doc.to_note(path))
}

/// Prefixo do erro devolvido quando o arquivo mudou fora do app.
const CONFLICT: &str = "conflito:";

/// Salva corpo e metadados; a profundidade é sempre calculada, nunca escolhida.
/// Com `expected`, recusa salvar se o corpo no disco não for o que o editor
/// conhecia (edição externa), para não sobrescrever o trabalho de outro app.
fn save(
    path: &Path,
    body: String,
    expected: Option<String>,
    corrente: Option<String>,
    cardume: Option<String>,
    tags: Option<Vec<String>>,
    db: Option<&Connection>,
) -> Result<Note, String> {
    let (content, mut doc) = load(path)?;
    if expected.is_some_and(|e| e != doc.body) {
        return Err(format!(
            "{CONFLICT} o arquivo foi alterado fora do Aquarium."
        ));
    }
    let edited = doc.body != body;
    doc.body = body;
    doc.complete();
    let clean = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    doc.set("corrente", clean(corrente).as_deref());
    doc.set("cardume", clean(cardume).as_deref());
    if let Some(tags) = tags {
        doc.set_tags(&clean_tags(tags));
    }
    if let Some(conn) = db {
        if edited {
            let id = doc.get("id").unwrap_or_default();
            depth::record(conn, &id, Signal::Edit, &now_rfc3339())?;
        }
        doc.apply_depth(conn)?;
    }
    store(path, &content, &doc)?;
    Ok(doc.to_note(path))
}

/// Grava a camada calculada pelo índice (ex.: a nota afundou no lodo).
pub fn write_depth(path: &Path, depth: &str) -> Result<(), String> {
    let (content, mut doc) = load(path)?;
    doc.set("depth", Some(depth));
    store(path, &content, &doc)
}

#[tauri::command]
pub fn read_note(state: tauri::State<IndexState>, path: String) -> Result<Note, String> {
    open_note(Path::new(&path), state.db().as_ref())
}

/// Cria uma nota nova na pasta do aquário, com nome derivado do título.
#[tauri::command]
pub fn create_note(dir: String, title: String, body: String) -> Result<Note, String> {
    let dir = PathBuf::from(dir);
    let path = free_path(&dir, &slugify(&title))?;
    let mut doc = Document {
        frontmatter: None,
        body,
        newline: "\n",
        bom: false,
    };
    doc.complete();
    write_atomic(&path, &doc.serialize())?;
    Ok(doc.to_note(&path))
}

#[tauri::command]
pub fn save_note(
    state: tauri::State<IndexState>,
    path: String,
    body: String,
    expected: Option<String>,
    corrente: Option<String>,
    cardume: Option<String>,
    tags: Option<Vec<String>>,
) -> Result<Note, String> {
    save(
        Path::new(&path),
        body,
        expected,
        corrente,
        cardume,
        tags,
        state.db().as_ref(),
    )
}

/// Lê a nota como está no disco, sem registrar abertura nem reescrever nada.
#[tauri::command]
pub fn peek_note(path: String) -> Result<Note, String> {
    let path = Path::new(&path);
    Ok(load(path)?.1.to_note(path))
}

/// "Trazer à superfície": tira a nota do lodo sem precisar abri-la.
#[tauri::command]
pub fn bring_to_surface(state: tauri::State<IndexState>, path: String) -> Result<Note, String> {
    let path = Path::new(&path);
    let (content, mut doc) = load(path)?;
    doc.complete();
    if let Some(conn) = state.db().as_ref() {
        if doc.get("depth").as_deref() == Some("lodo") {
            let id = doc.get("id").unwrap_or_default();
            depth::record(conn, &id, Signal::Resurface, &now_rfc3339())?;
        }
        doc.apply_depth(conn)?;
    }
    store(path, &content, &doc)?;
    Ok(doc.to_note(path))
}

/// Pasta (oculta, fora do índice) para onde vão as notas excluídas.
pub const TRASH_DIR: &str = ".lixeira";

/// Troca o primeiro `# título` do corpo (ou insere um no começo).
fn set_title(body: &str, title: &str) -> String {
    let mut done = false;
    let mut out = String::with_capacity(body.len() + title.len());
    for line in body.split_inclusive('\n') {
        if !done && line.starts_with("# ") {
            let ending = &line[line.trim_end_matches(['\r', '\n']).len()..];
            out.push_str(&format!("# {title}{ending}"));
            done = true;
        } else {
            out.push_str(line);
        }
    }
    if done {
        out
    } else if body.trim().is_empty() {
        format!("# {title}\n")
    } else {
        format!("# {title}\n\n{body}")
    }
}

/// Renomeia: atualiza o `# título` e o nome do arquivo (mesma pasta).
fn rename(path: &Path, title: &str) -> Result<Note, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("O título não pode ficar vazio.".into());
    }
    let (content, mut doc) = load(path)?;
    doc.body = set_title(&doc.body, title);
    let dir = path.parent().ok_or("Caminho de nota inválido.")?;
    let slug = slugify(title);
    let same = path
        .file_stem()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case(&slug));
    let target = if same {
        path.to_path_buf()
    } else {
        free_path(dir, &slug)?
    };
    store(path, &content, &doc)?;
    if target != path {
        fs::rename(path, &target).map_err(|e| format!("Não foi possível renomear: {e}"))?;
    }
    Ok(doc.to_note(&target))
}

/// Duplica a nota com novo id, data e profundidade, e título "(cópia)".
fn duplicate(path: &Path) -> Result<Note, String> {
    let (_, mut doc) = load(path)?;
    let title = format!("{} (cópia)", doc.title(path));
    for key in ["id", "created", "depth"] {
        doc.set(key, None);
    }
    doc.body = set_title(&doc.body, &title);
    doc.complete();
    let dir = path.parent().ok_or("Caminho de nota inválido.")?;
    let target = free_path(dir, &slugify(&title))?;
    write_atomic(&target, &doc.serialize())?;
    Ok(doc.to_note(&target))
}

/// Move a nota para a lixeira do aquário, sem apagar o arquivo.
fn trash(root: &Path, path: &Path) -> Result<(), String> {
    let dir = root.join(TRASH_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Não foi possível criar a lixeira: {e}"))?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Caminho de nota inválido.")?;
    let target = free_path(&dir, stem)?;
    fs::rename(path, target).map_err(|e| format!("Não foi possível mover para a lixeira: {e}"))
}

#[tauri::command]
pub fn rename_note(
    state: tauri::State<IndexState>,
    path: String,
    title: String,
) -> Result<Note, String> {
    let note = rename(Path::new(&path), &title)?;
    state.resync();
    Ok(note)
}

#[tauri::command]
pub fn duplicate_note(state: tauri::State<IndexState>, path: String) -> Result<Note, String> {
    let note = duplicate(Path::new(&path))?;
    state.resync();
    Ok(note)
}

#[tauri::command]
pub fn trash_note(state: tauri::State<IndexState>, path: String) -> Result<(), String> {
    let path = Path::new(&path);
    let root = state
        .root()
        .or_else(|| path.parent().map(Path::to_path_buf))
        .ok_or("Nenhum aquário aberto.")?;
    trash(&root, path)?;
    state.resync();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMPLETA: &str = "---\nid: abc\ncreated: 2026-01-02T03:04:05Z\ndepth: fundo\ntags: [x, y]\n# comentário\ncorrente: \"System Design\"\n---\n# Título\n\nCorpo com --- no meio.\n";

    #[test]
    fn ida_e_volta_sem_diff() {
        for content in [
            COMPLETA,
            "sem fm",
            "",
            "---\nnão fecha\n",
            "---\r\nid: a\r\n---\r\nx\r\n",
            "\u{feff}---\nid: a\n---\n",
        ] {
            assert_eq!(Document::parse(content).serialize(), content);
        }
        let mut doc = Document::parse(COMPLETA);
        doc.complete();
        assert_eq!(doc.serialize(), COMPLETA);
    }

    #[test]
    fn le_campos() {
        let note = Document::parse(COMPLETA).to_note(Path::new("/a/nota.md"));
        assert_eq!(note.id, "abc");
        assert_eq!(note.depth, "fundo");
        assert_eq!(note.corrente.as_deref(), Some("System Design"));
        assert_eq!(note.cardume, None);
        assert_eq!(note.title, "Título");
        assert_eq!(note.tags, ["x", "y"]);
    }

    #[test]
    fn tags_em_formatos_diversos() {
        let tags = |fm: &str| Document::parse(&format!("---\n{fm}\n---\n")).tags();
        assert_eq!(tags("tags: a, \"b c\""), ["a", "b c"]);
        assert_eq!(tags("tags:\n  - a\n  - '#b'\nid: x"), ["a", "b"]);
        assert_eq!(tags("tags: []"), Vec::<String>::new());
        assert_eq!(tags("id: x"), Vec::<String>::new());

        let mut doc = Document::parse("---\ntags:\n  - a\n  - b\nid: x\n---\n");
        doc.set_tags(&["a".into(), "b".into()]);
        assert_eq!(doc.serialize(), "---\ntags:\n  - a\n  - b\nid: x\n---\n");
        doc.set_tags(&clean_tags(["c".into(), "estudo de caso".into()]));
        assert_eq!(
            doc.serialize(),
            "---\ntags: [c, estudo de caso]\nid: x\n---\n"
        );
        assert_eq!(doc.tags(), ["c", "estudo de caso"]);
        doc.set_tags(&[]);
        assert_eq!(doc.serialize(), "---\nid: x\n---\n");
    }

    #[test]
    fn completa_nota_externa_sem_destruir() {
        let original = "# Ideia\n\ntexto\n";
        let mut doc = Document::parse(original);
        doc.complete();
        let out = doc.serialize();
        assert!(out.starts_with("---\nid: "));
        assert!(out.contains("\ndepth: superficie\n---\n\n# Ideia\n\ntexto\n"));
        // Uma segunda passada não muda nada.
        let mut again = Document::parse(&out);
        again.complete();
        assert_eq!(again.serialize(), out);
    }

    #[test]
    fn preserva_chaves_desconhecidas_ao_alterar() {
        let mut doc = Document::parse(COMPLETA);
        doc.set("depth", Some("lodo"));
        doc.set("corrente", None);
        doc.set("cardume", Some("filas: kafka"));
        let out = doc.serialize();
        assert!(
            out.contains("depth: lodo\ntags: [x, y]\n# comentário\ncardume: \"filas: kafka\"\n---")
        );
        assert_eq!(
            Document::parse(&out).get("cardume").as_deref(),
            Some("filas: kafka")
        );
    }

    #[test]
    fn slug_e_colisao() {
        assert_eq!(slugify("Ação: Cache & Filas!"), "acao-cache-filas");
        assert_eq!(slugify("  ?? "), "sem-titulo");

        let dir = std::env::temp_dir().join(format!("aquarium-note-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let a = create_note(
            dir.display().to_string(),
            "Cache".into(),
            "# Cache\n".into(),
        )
        .unwrap();
        let b = create_note(
            dir.display().to_string(),
            "cache".into(),
            "# Cache\n".into(),
        )
        .unwrap();
        assert!(a.path.ends_with("cache.md"));
        assert!(b.path.ends_with("cache-2.md"));
        assert_ne!(a.id, b.id);

        let saved = save(
            Path::new(&b.path),
            "novo\n".into(),
            Some(b.body.clone()),
            Some("Infra".into()),
            None,
            Some(vec!["a".into(), " #b ".into(), "a".into()]),
            None,
        )
        .unwrap();
        assert_eq!(saved.depth, "superficie");
        assert_eq!(saved.corrente.as_deref(), Some("Infra"));
        assert_eq!(saved.tags, ["a", "b"]);
        assert_eq!(open_note(Path::new(&b.path), None).unwrap(), saved);
        let conflict = save(
            Path::new(&b.path),
            "x\n".into(),
            Some("velho\n".into()),
            None,
            None,
            None,
            None,
        );
        assert!(conflict.unwrap_err().starts_with(CONFLICT));
        assert!(
            fs::read_dir(&dir).unwrap().all(|e| !e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp"))
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn renomeia_duplica_e_exclui() {
        assert_eq!(set_title("a\n# Velho\r\nx", "Novo"), "a\n# Novo\r\nx");
        assert_eq!(set_title("texto\n", "T"), "# T\n\ntexto\n");
        assert_eq!(set_title("", "T"), "# T\n");

        let dir = std::env::temp_dir().join(format!("aquarium-ciclo-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let a = create_note(
            dir.display().to_string(),
            "Cache".into(),
            "---\ntags: [x]\n---\n# Cache\n\ncorpo\n".into(),
        )
        .unwrap();

        let r = rename(Path::new(&a.path), "Filas e Cache").unwrap();
        assert!(r.path.ends_with("filas-e-cache.md"));
        assert!(!Path::new(&a.path).exists());
        assert_eq!(r.title, "Filas e Cache");
        assert_eq!(r.id, a.id);
        assert!(rename(Path::new(&r.path), "  ").is_err());
        // Mesmo slug: só o título muda, o arquivo fica.
        let r2 = rename(Path::new(&r.path), "Filas e cache").unwrap();
        assert_eq!(r2.path, r.path);

        let d = duplicate(Path::new(&r.path)).unwrap();
        assert!(d.path.ends_with("filas-e-cache-copia.md"));
        assert_eq!(d.title, "Filas e cache (cópia)");
        assert_ne!(d.id, a.id);
        assert!(fs::read_to_string(&d.path).unwrap().contains("tags: [x]"));

        trash(&dir, Path::new(&d.path)).unwrap();
        assert!(!Path::new(&d.path).exists());
        assert!(dir.join(TRASH_DIR).join("filas-e-cache-copia.md").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn data_utc() {
        assert_eq!(format_rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_rfc3339(1_709_210_096), "2024-02-29T12:34:56Z");
    }

    #[test]
    fn trecho_sem_titulo_e_truncado() {
        let doc = Document::parse("---\nid: a\n---\n# Título\n\n## Seção\nTexto  \nmais\n");
        assert_eq!(doc.excerpt(), "Seção Texto mais");
        let longo = format!("# T\n{}", "a".repeat(200));
        let trecho = Document::parse(&longo).excerpt();
        assert_eq!(trecho.chars().count(), EXCERPT_CHARS + 1);
        assert!(trecho.ends_with('…'));
    }
}
