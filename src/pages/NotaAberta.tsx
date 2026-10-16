import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { replaceEditorText } from "../lib/editor";
import {
  duplicateNote,
  isConflict,
  renameNote,
  trashNote,
  peekNote,
  readNote,
  saveNote,
  type Note,
} from "../lib/aquarium";

type Props = {
  path: string;
  onBack: () => void;
  /** A nota passou a viver em outro arquivo (renomeada ou duplicada). */
  onOpenNote: (path: string) => void;
  onDeleted: () => void;
};

/** Espera depois da última tecla antes de gravar. */
const AUTOSAVE_MS = 800;

type Status = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

const time = (date: Date) =>
  date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Nota aberta: editor Markdown com autosave e metadados na lateral. */
export function NotaAberta({ path, onBack, onOpenNote, onDeleted }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("salvo");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [corrente, setCorrente] = useState("");
  const [cardume, setCardume] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorArea = useRef<HTMLDivElement>(null);
  // Estado mais recente para o autosave, sem recriar timers a cada tecla.
  const text = useRef("");
  const known = useRef<string | null>(null);
  const meta = useRef({ corrente: "", cardume: "" });
  const savedMeta = useRef({ corrente: "", cardume: "" });
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef<Promise<void> | null>(null);
  const conflict = useRef(false);

  useEffect(() => {
    let current = true;
    readNote(path).then(
      (n) => {
        if (!current) return;
        text.current = n.body;
        known.current = n.body;
        meta.current = savedMeta.current = {
          corrente: n.corrente ?? "",
          cardume: n.cardume ?? "",
        };
        setCorrente(meta.current.corrente);
        setCardume(meta.current.cardume);
        setNote(n);
      },
      (e: unknown) => current && setError(String(e)),
    );
    return () => {
      current = false;
    };
  }, [path]);

  const dirty = () =>
    text.current !== known.current ||
    meta.current.corrente !== savedMeta.current.corrente ||
    meta.current.cardume !== savedMeta.current.cardume;

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (saving.current) await saving.current;
    if (known.current === null || conflict.current || !dirty()) return;
    const body = text.current;
    const fields = { ...meta.current };
    setStatus("salvando");
    const run = saveNote(
      path,
      body,
      known.current,
      fields.corrente || null,
      fields.cardume || null,
    ).then(
      (saved) => {
        known.current = body;
        savedMeta.current = fields;
        setNote(saved);
        setSavedAt(new Date());
        setStatus(dirty() ? "pendente" : "salvo");
      },
      (e: unknown) => {
        if (isConflict(e)) {
          conflict.current = true;
          setStatus("conflito");
        } else {
          setStatus("erro");
          setError(String(e));
        }
      },
    );
    saving.current = run;
    await run;
    saving.current = null;
  }, [path]);

  const schedule = useCallback(() => {
    if (conflict.current) return;
    setStatus("pendente");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
  }, [save]);

  // Ao sair da nota, grava o que ainda estiver pendente.
  useEffect(() => () => void save(), [save]);

  // Ao voltar para a janela, confere se outro app mexeu no arquivo.
  useEffect(() => {
    const check = async () => {
      if (known.current === null || conflict.current) return;
      const disk = await peekNote(path).catch(() => null);
      if (!disk || disk.body === known.current) return;
      if (text.current === known.current) {
        known.current = disk.body;
        replaceEditorText(editorArea.current, disk.body);
      } else {
        conflict.current = true;
        setStatus("conflito");
      }
    };
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [path]);

  /** Traz a versão do disco; o texto local fica no histórico (Cmd/Ctrl+Z). */
  const reload = async () => {
    try {
      const disk = await peekNote(path);
      known.current = disk.body;
      conflict.current = false;
      replaceEditorText(editorArea.current, disk.body);
      setNote(disk);
      setStatus(text.current === known.current ? "salvo" : "pendente");
    } catch (e) {
      setError(String(e));
    }
  };

  /** Grava o pendente e congela o autosave antes de mexer no arquivo. */
  const act = async (action: () => Promise<void>) => {
    await save();
    if (conflict.current) return;
    conflict.current = true;
    try {
      await action();
    } catch (e) {
      conflict.current = false;
      setError(String(e));
      setStatus("erro");
    }
  };

  const rename = (title: string) =>
    act(async () => {
      setRenaming(null);
      if (title.trim() === note?.title) {
        conflict.current = false;
        return;
      }
      onOpenNote((await renameNote(path, title)).path);
    });

  const onMeta = (field: "corrente" | "cardume", value: string) => {
    meta.current = { ...meta.current, [field]: value };
    if (field === "corrente") setCorrente(value);
    else setCardume(value);
  };

  if (error && !note) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Button variant="secondary" onClick={onBack}>
          ← Notas
        </Button>
        <p role="alert" className="text-md text-ink">
          Não foi possível abrir a nota: {error}
        </p>
      </div>
    );
  }

  if (!note) return <p className="text-md text-muted">Abrindo nota…</p>;

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Button variant="secondary" onClick={onBack}>
          ← Notas
        </Button>
        <div className="flex items-center gap-2">
          {renaming !== null ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void rename(renaming);
              }}
            >
              <input
                autoFocus
                value={renaming}
                aria-label="Novo título"
                onChange={(event) => setRenaming(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(null);
                }}
                className="rounded-control border border-line bg-surface px-3 py-2 text-md text-ink outline-none focus:border-brand-light"
              />
              <Button type="submit" disabled={!renaming.trim()}>
                Renomear
              </Button>
              <Button variant="secondary" onClick={() => setRenaming(null)}>
                Cancelar
              </Button>
            </form>
          ) : confirmDelete ? (
            <>
              <span className="text-base text-ink">Mover para a lixeira?</span>
              <Button
                onClick={() =>
                  void act(async () => {
                    await trashNote(path);
                    onDeleted();
                  })
                }
              >
                Excluir
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setRenaming(note.title)}
              >
                Renomear
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void act(async () => {
                    conflict.current = false;
                    onOpenNote((await duplicateNote(path)).path);
                  })
                }
              >
                Duplicar
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            </>
          )}
        </div>
        <span aria-live="polite" className="text-sm text-muted">
          {status === "salvo" && savedAt ? (
            <span className="text-success">✓ Salvo neste computador</span>
          ) : status === "salvando" || status === "pendente" ? (
            "Salvando…"
          ) : status === "erro" ? (
            <span className="text-red-700">Não foi possível salvar</span>
          ) : null}
        </span>
      </div>

      {status === "conflito" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-card border border-line bg-highlight px-4 py-3 text-base text-ink"
        >
          <span>
            Esta nota foi alterada fora do Aquarium. Recarregue para ver a
            versão do arquivo — seu texto continua no histórico (⌘Z / Ctrl+Z).
          </span>
          <Button onClick={() => void reload()}>Recarregar</Button>
        </div>
      )}

      <div className="flex flex-1 gap-8">
        <div ref={editorArea} className="min-w-0 flex-1">
          <MarkdownEditor
            value={note.body}
            onChange={(value) => {
              text.current = value;
              if (value !== known.current) schedule();
            }}
          />
        </div>

        <aside className="flex w-[220px] shrink-0 flex-col gap-5 text-base">
          {(
            [
              ["corrente", "Corrente", corrente, "Ex.: System Design"],
              ["cardume", "Cardume", cardume, "Ex.: Cache"],
            ] as const
          ).map(([field, label, value, placeholder]) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                {label}
              </span>
              <input
                value={value}
                placeholder={placeholder}
                onChange={(event) => onMeta(field, event.target.value)}
                onBlur={() => void save()}
                className="rounded-control border border-line bg-surface px-3 py-2 text-ink outline-none placeholder:text-muted focus:border-brand-light"
              />
            </label>
          ))}
        </aside>
      </div>

      <footer className="flex justify-between gap-4 border-t border-line pt-3 text-sm text-muted">
        <span className="truncate">{fileName(note.path)}</span>
        <span>
          {savedAt ? `Último save às ${time(savedAt)}` : "Sem alterações"}
        </span>
      </footer>
    </div>
  );
}
