//! Formato da nota: arquivo Markdown com frontmatter YAML mínimo.
//!
//! O frontmatter é tratado linha a linha: só as chaves do Aquarium são lidas e
//! alteradas; qualquer outra linha (de outros apps ou do usuário) é preservada
//! byte a byte. Veja `docs/formato-da-nota.md`.

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

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub(crate) path: String,
    pub(crate) id: String,
    pub(crate) created: String,
    pub(crate) depth: String,
    pub(crate) corrente: Option<String>,
    pub(crate) cardume: Option<String>,
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

    fn to_note(&self, path: &Path) -> Note {
        Note {
            path: path.display().to_string(),
            id: self.get("id").unwrap_or_default(),
            created: self.get("created").unwrap_or_default(),
            depth: self.get("depth").unwrap_or_default(),
            corrente: self.get("corrente"),
            cardume: self.get("cardume"),
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
fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format_rfc3339(secs)
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

/// Metadados da nota para o índice, sem alterar o arquivo.
pub fn summarize(path: &Path, content: &str) -> Note {
    Document::parse(content).to_note(path)
}

/// Lê a nota; se faltar frontmatter (nota criada fora do app), completa e salva.
#[tauri::command]
pub fn read_note(path: String) -> Result<Note, String> {
    let path = PathBuf::from(path);
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Não foi possível ler {}: {e}", path.display()))?;
    let mut doc = Document::parse(&content);
    doc.complete();
    let completed = doc.serialize();
    if completed != content {
        write_atomic(&path, &completed)?;
    }
    Ok(doc.to_note(&path))
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

/// Salva corpo e metadados, preservando chaves desconhecidas do frontmatter.
#[tauri::command]
pub fn save_note(
    path: String,
    body: String,
    depth: String,
    corrente: Option<String>,
    cardume: Option<String>,
) -> Result<Note, String> {
    if !DEPTHS.contains(&depth.as_str()) {
        return Err(format!("Profundidade inválida: {depth}"));
    }
    let path = PathBuf::from(path);
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Não foi possível ler {}: {e}", path.display()))?;
    let mut doc = Document::parse(&content);
    doc.body = body;
    doc.complete();
    doc.set("depth", Some(&depth));
    let clean = |v: Option<String>| v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    doc.set("corrente", clean(corrente).as_deref());
    doc.set("cardume", clean(cardume).as_deref());
    let updated = doc.serialize();
    if updated != content {
        write_atomic(&path, &updated)?;
    }
    Ok(doc.to_note(&path))
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

        let saved = save_note(
            b.path.clone(),
            "novo\n".into(),
            "fundo".into(),
            Some("Infra".into()),
            None,
        )
        .unwrap();
        assert_eq!(saved.depth, "fundo");
        assert_eq!(read_note(b.path).unwrap(), saved);
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
    fn data_utc() {
        assert_eq!(format_rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_rfc3339(1_709_210_096), "2024-02-29T12:34:56Z");
    }
}
