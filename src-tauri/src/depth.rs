//! Profundidade implícita: sinais de uso e cálculo da camada.
//!
//! A camada nunca é escolhida pelo usuário. O app registra sinais (aberturas,
//! edições, "trazer à superfície") no índice e calcula a profundidade com
//! regras puras a partir deles, do tamanho do texto e da corrente atribuída.
//! Veja `docs/profundidade.md`.

use rusqlite::{Connection, params};

/// Limiares das regras, num só lugar para facilitar o ajuste.
#[derive(Debug, Clone, Copy)]
pub struct Thresholds {
    /// Caracteres do corpo para uma nota contar como desenvolvida.
    pub meia_agua_min_chars: usize,
    /// Dias distintos com edição para descer à meia-água.
    pub meia_agua_min_edit_days: usize,
    /// Dias distintos com abertura ou edição (revisitas) para chegar ao fundo.
    pub fundo_min_visit_days: usize,
    /// Dias sem edição para a nota contar como estável.
    pub fundo_stable_days: i64,
    /// Dias sem nenhuma interação para afundar no lodo.
    pub lodo_after_days: i64,
}

pub const THRESHOLDS: Thresholds = Thresholds {
    meia_agua_min_chars: 280,
    meia_agua_min_edit_days: 2,
    fundo_min_visit_days: 3,
    fundo_stable_days: 7,
    lodo_after_days: 45,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Depth {
    Superficie,
    MeiaAgua,
    Fundo,
    Lodo,
}

impl Depth {
    pub fn as_str(self) -> &'static str {
        match self {
            Depth::Superficie => "superficie",
            Depth::MeiaAgua => "meia-agua",
            Depth::Fundo => "fundo",
            Depth::Lodo => "lodo",
        }
    }

    pub fn parse(value: &str) -> Depth {
        match value {
            "meia-agua" => Depth::MeiaAgua,
            "fundo" => Depth::Fundo,
            "lodo" => Depth::Lodo,
            _ => Depth::Superficie,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Signal {
    Open,
    Edit,
    /// Saída do lodo (ao abrir a nota ou por "Trazer à superfície"):
    /// a nota recomeça na superfície e os sinais anteriores deixam de contar.
    Resurface,
}

impl Signal {
    fn as_str(self) -> &'static str {
        match self {
            Signal::Open => "open",
            Signal::Edit => "edit",
            Signal::Resurface => "resurface",
        }
    }
}

/// Tudo que as regras consideram sobre uma nota. Datas em dias desde 1970-01-01 (UTC).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Usage {
    pub chars: usize,
    pub has_corrente: bool,
    /// Dias distintos com edição.
    pub edit_days: usize,
    /// Dias distintos com abertura ou edição.
    pub visit_days: usize,
    pub last_edit: Option<i64>,
    /// Última interação (sinal de qualquer tipo, ou a criação).
    pub last_interaction: i64,
}

/// Regras de profundidade. Funções puras: mesmos sinais, mesma camada.
///
/// - Lodo: nenhuma interação há `lodo_after_days`.
/// - Meia-água: texto desenvolvido e editado em dias diferentes (a corrente
///   atribuída conta como um desses dias).
/// - Fundo: desenvolvida, revisitada em dias diferentes e sem edição recente.
/// - Fora do lodo, a nota não volta a subir sozinha: a camada é a mais funda
///   entre a atual e a calculada, para não oscilar a cada edição.
pub fn compute(current: Depth, usage: &Usage, today: i64, t: &Thresholds) -> Depth {
    if today - usage.last_interaction >= t.lodo_after_days {
        return Depth::Lodo;
    }
    let edit_days = usage.edit_days + usize::from(usage.has_corrente && usage.edit_days > 0);
    let developed = usage.chars >= t.meia_agua_min_chars && edit_days >= t.meia_agua_min_edit_days;
    let stable = usage
        .last_edit
        .is_none_or(|d| today - d >= t.fundo_stable_days);
    let computed = if developed && stable && usage.visit_days >= t.fundo_min_visit_days {
        Depth::Fundo
    } else if developed {
        Depth::MeiaAgua
    } else {
        Depth::Superficie
    };
    if current == Depth::Lodo {
        computed
    } else {
        computed.max(current)
    }
}

/// Junta os sinais (já ordenados por data) em `Usage`, ignorando os anteriores
/// à última volta à superfície.
pub fn usage_from(
    signals: &[(Signal, i64)],
    created: i64,
    chars: usize,
    has_corrente: bool,
) -> Usage {
    let start = signals
        .iter()
        .rposition(|(s, _)| *s == Signal::Resurface)
        .map_or(0, |i| i + 1);
    let mut edit_days = Vec::new();
    let mut visit_days = Vec::new();
    for &(signal, day) in &signals[start..] {
        if signal == Signal::Edit && !edit_days.contains(&day) {
            edit_days.push(day);
        }
        if !visit_days.contains(&day) {
            visit_days.push(day);
        }
    }
    Usage {
        chars,
        has_corrente,
        edit_days: edit_days.len(),
        visit_days: visit_days.len(),
        last_edit: edit_days.last().copied(),
        last_interaction: signals
            .iter()
            .map(|(_, d)| *d)
            .max()
            .unwrap_or(created)
            .max(created),
    }
}

/// Dias desde 1970-01-01 de uma data `AAAA-MM-DD...` (algoritmo days_from_civil).
pub fn day_number(date: &str) -> Option<i64> {
    let year: i64 = date.get(0..4)?.parse().ok()?;
    let month: i64 = date.get(5..7)?.parse().ok()?;
    let day: i64 = date.get(8..10)?.parse().ok()?;
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

pub fn record(conn: &Connection, note_id: &str, signal: Signal, at: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO signals (note_id, kind, at) VALUES (?1, ?2, ?3)",
        params![note_id, signal.as_str(), at],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn signals_of(conn: &Connection, note_id: &str) -> Result<Vec<(Signal, i64)>, String> {
    let err = |e: rusqlite::Error| e.to_string();
    let mut stmt = conn
        .prepare("SELECT kind, at FROM signals WHERE note_id = ?1 ORDER BY at, rowid")
        .map_err(err)?;
    let rows = stmt
        .query_map([note_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        let (kind, at) = row.map_err(err)?;
        let signal = match kind.as_str() {
            "open" => Signal::Open,
            "edit" => Signal::Edit,
            "resurface" => Signal::Resurface,
            _ => continue,
        };
        if let Some(day) = day_number(&at) {
            out.push((signal, day));
        }
    }
    Ok(out)
}

/// Dados da nota que entram no cálculo.
pub struct NoteFacts<'a> {
    pub id: &'a str,
    pub created: &'a str,
    pub depth: &'a str,
    pub chars: usize,
    pub has_corrente: bool,
}

/// Camada da nota segundo os sinais gravados no índice.
pub fn depth_of(conn: &Connection, note: &NoteFacts, today: i64) -> Result<Depth, String> {
    let signals = signals_of(conn, note.id)?;
    let created = day_number(note.created).unwrap_or(today);
    let usage = usage_from(&signals, created, note.chars, note.has_corrente);
    Ok(compute(
        Depth::parse(note.depth),
        &usage,
        today,
        &THRESHOLDS,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: Thresholds = THRESHOLDS;
    const DIA: i64 = 20_000;

    fn uso(chars: usize, edit_days: usize, visit_days: usize, last_edit: i64) -> Usage {
        Usage {
            chars,
            has_corrente: false,
            edit_days,
            visit_days,
            last_edit: Some(last_edit),
            last_interaction: last_edit,
        }
    }

    #[test]
    fn nota_nova_fica_na_superficie() {
        let u = usage_from(&[], DIA, 10, false);
        assert_eq!(compute(Depth::Superficie, &u, DIA, &T), Depth::Superficie);
    }

    #[test]
    fn desenvolvida_desce_para_meia_agua() {
        let u = uso(T.meia_agua_min_chars, T.meia_agua_min_edit_days, 2, DIA);
        assert_eq!(compute(Depth::Superficie, &u, DIA, &T), Depth::MeiaAgua);
        // Texto curto ou editada num dia só: continua na superfície.
        let curta = uso(T.meia_agua_min_chars - 1, 5, 5, DIA);
        assert_eq!(
            compute(Depth::Superficie, &curta, DIA, &T),
            Depth::Superficie
        );
        let um_dia = uso(1000, 1, 1, DIA);
        assert_eq!(
            compute(Depth::Superficie, &um_dia, DIA, &T),
            Depth::Superficie
        );
        // Corrente atribuída conta como desenvolvimento.
        let com_corrente = Usage {
            has_corrente: true,
            ..um_dia
        };
        assert_eq!(
            compute(Depth::Superficie, &com_corrente, DIA, &T),
            Depth::MeiaAgua
        );
    }

    #[test]
    fn estavel_e_revisitada_chega_ao_fundo() {
        let mut u = uso(1000, 2, T.fundo_min_visit_days, DIA - T.fundo_stable_days);
        u.last_interaction = DIA;
        assert_eq!(compute(Depth::MeiaAgua, &u, DIA, &T), Depth::Fundo);
        // Edição recente: ainda não é estável.
        u.last_edit = Some(DIA - 1);
        assert_eq!(compute(Depth::MeiaAgua, &u, DIA, &T), Depth::MeiaAgua);
        // Sem revisitas suficientes.
        u.last_edit = Some(DIA - T.fundo_stable_days);
        u.visit_days = T.fundo_min_visit_days - 1;
        assert_eq!(compute(Depth::MeiaAgua, &u, DIA, &T), Depth::MeiaAgua);
    }

    #[test]
    fn nao_volta_a_subir_sozinha() {
        let u = uso(10, 1, 1, DIA);
        assert_eq!(compute(Depth::Fundo, &u, DIA, &T), Depth::Fundo);
        assert_eq!(compute(Depth::MeiaAgua, &u, DIA, &T), Depth::MeiaAgua);
    }

    #[test]
    fn afunda_no_lodo_sem_interacao() {
        let u = uso(1000, 3, 3, DIA - T.lodo_after_days);
        assert_eq!(compute(Depth::Fundo, &u, DIA, &T), Depth::Lodo);
        assert_eq!(compute(Depth::Fundo, &u, DIA - 1, &T), Depth::Fundo);
        // Nota nunca aberta conta a partir da criação.
        let nova = usage_from(&[], DIA - T.lodo_after_days, 0, false);
        assert_eq!(compute(Depth::Superficie, &nova, DIA, &T), Depth::Lodo);
    }

    #[test]
    fn sai_do_lodo_pela_superficie() {
        let antigos = [
            (Signal::Edit, DIA - 100),
            (Signal::Edit, DIA - 99),
            (Signal::Open, DIA - 98),
        ];
        let u = usage_from(&antigos, DIA - 100, 1000, false);
        assert_eq!(compute(Depth::MeiaAgua, &u, DIA, &T), Depth::Lodo);

        let mut voltou = antigos.to_vec();
        voltou.push((Signal::Resurface, DIA));
        voltou.push((Signal::Open, DIA));
        let u = usage_from(&voltou, DIA - 100, 1000, false);
        assert_eq!(u.edit_days, 0);
        assert_eq!(u.visit_days, 1);
        assert_eq!(compute(Depth::Lodo, &u, DIA, &T), Depth::Superficie);
    }

    #[test]
    fn agrega_sinais_por_dia() {
        let s = [
            (Signal::Open, DIA),
            (Signal::Edit, DIA),
            (Signal::Edit, DIA),
            (Signal::Open, DIA + 1),
            (Signal::Edit, DIA + 2),
        ];
        let u = usage_from(&s, DIA, 5, true);
        assert_eq!(u.edit_days, 2);
        assert_eq!(u.visit_days, 3);
        assert_eq!(u.last_edit, Some(DIA + 2));
        assert_eq!(u.last_interaction, DIA + 2);
    }

    #[test]
    fn datas() {
        assert_eq!(day_number("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(day_number("2024-02-29T12:34:56Z"), Some(19_782));
        assert_eq!(day_number("lixo"), None);
    }
}
