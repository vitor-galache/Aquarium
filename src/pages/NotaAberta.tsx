import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Button } from "../components/Button";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { replaceEditorText } from "../lib/editor";
import { countWords } from "../lib/markdown";
import {
  createNote,
  listNotes,
  saveImage,
  isConflict,
  parseTags,
  peekNote,
  readNote,
  saveNote,
  type Note,
  type NoteSummary,
} from "../lib/vault";

/** Ações de arquivo vindas do explorador sobre a nota aberta. */
export type NotaAbertaHandle = {
  /** Grava o pendente e congela o autosave antes de mexer no arquivo. */
  run: (action: () => Promise<void>) => Promise<void>;
};

type Props = {
  ref?: Ref<NotaAbertaHandle>;
  path: string;
  onBack: () => void;
  /** Abre outra nota (ex.: um `[[link]]`). */
  onOpenNote: (path: string) => void;
};

/** Espera depois da última tecla antes de gravar. */
const AUTOSAVE_MS = 800;

type Status = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

const dirName = (path: string) => path.slice(0, path.search(/[\\/][^\\/]*$/));

const stem = (path: string) => fileName(path).replace(/\.md$/i, "");

const time = (date: Date) =>
  date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Nota aberta: editor Markdown com autosave e metadados na lateral. */
export function NotaAberta({ ref, path, onBack, onOpenNote }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("salvo");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [words, setWords] = useState(0);
  const notes = useRef<NoteSummary[]>([]);
  const editorArea = useRef<HTMLDivElement>(null);
  // Estado mais recente para o autosave, sem recriar timers a cada tecla.
  const text = useRef("");
  const known = useRef<string | null>(null);
  const meta = useRef({ corrente: "", cardume: "", tags: "" });
  const savedMeta = useRef({ corrente: "", cardume: "", tags: "" });
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
          tags: n.tags.join(", "),
        };
        setWords(countWords(n.body));
        setNote(n);
      },
      (e: unknown) => current && setError(String(e)),
    );
    return () => {
      current = false;
    };
  }, [path]);

  // Notas da pasta para o autocomplete e para abrir `[[links]]`.
  useEffect(() => {
    listNotes().then(
      (list) => (notes.current = list),
      () => {},
    );
  }, [path]);

  const dirty = () =>
    text.current !== known.current ||
    meta.current.corrente !== savedMeta.current.corrente ||
    meta.current.cardume !== savedMeta.current.cardume ||
    meta.current.tags !== savedMeta.current.tags;

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
      parseTags(fields.tags),
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

  useImperativeHandle(ref, () => ({
    run: async (action) => {
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
    },
  }));

  /** Abre a nota do `[[link]]`; se não existir, cria ao lado desta. */
  const openLink = async (target: string) => {
    const wanted = target.toLowerCase();
    const found = notes.current.find(
      (n) =>
        n.title.toLowerCase() === wanted ||
        stem(n.path).toLowerCase() === wanted,
    );
    try {
      const next =
        found?.path ??
        (await createNote(dirName(path), target, `# ${target}\n`)).path;
      if (next !== path) onOpenNote(next);
    } catch (e) {
      setError(String(e));
    }
  };

  const pasteImage = async (file: File) => {
    const extension = file.type.split("/")[1].replace("svg+xml", "svg");
    try {
      return await saveImage(path, file, extension.replace("jpeg", "jpg"));
    } catch (e) {
      setError(String(e));
      throw e;
    }
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
      <div className="flex items-center justify-end gap-4">
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

      {error && (
        <p role="alert" className="text-base text-red-700">
          {error}
        </p>
      )}

      {status === "conflito" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-card border border-line bg-highlight px-4 py-3 text-base text-ink"
        >
          <span>
            Esta nota foi alterada fora do Notesea. Recarregue para ver a versão
            do arquivo — seu texto continua no histórico (⌘Z / Ctrl+Z).
          </span>
          <Button onClick={() => void reload()}>Recarregar</Button>
        </div>
      )}

      <div className="flex flex-1 gap-8">
        <div ref={editorArea} className="min-w-0 flex-1">
          <MarkdownEditor
            value={note.body}
            baseDir={dirName(path)}
            linkTargets={() => notes.current.map((n) => n.title)}
            onOpenLink={(target) => void openLink(target)}
            onPasteImage={pasteImage}
            onChange={(value) => {
              text.current = value;
              setWords(countWords(value));
              if (value !== known.current) schedule();
            }}
          />
        </div>
      </div>

      <footer className="flex justify-between gap-4 border-t border-line pt-3 text-sm text-muted">
        <span className="truncate">{fileName(note.path)}</span>
        <span>
          {words} {words === 1 ? "palavra" : "palavras"}
        </span>
        <span>
          {savedAt ? `Último save às ${time(savedAt)}` : "Sem alterações"}
        </span>
      </footer>
    </div>
  );
}
