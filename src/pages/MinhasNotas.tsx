import { useState } from "react";
import { Button } from "../components/Button";
import { FileIcon, FolderIcon, NewFileIcon } from "../components/Icons";
import { captureIdea } from "../lib/vault";
import { countNotes, folderDir, notesLabel, type Folder } from "../lib/tree";

type Props = {
  root: string;
  /** Pasta mostrada; `null` enquanto o índice carrega. */
  folder: Folder | null;
  indexing: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenFolder: (folder: string) => void;
  onOpenNote: (path: string) => void;
  onCaptured: () => void;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});

const formatDate = (modified: number) =>
  modified > 0 ? dateFormat.format(new Date(modified)) : "";

const grid = "grid grid-cols-[minmax(0,1fr)_120px_120px] gap-4";

/** Conteúdo da pasta atual, como num explorador de arquivos. */
export function MinhasNotas({
  root,
  folder,
  indexing,
  error,
  onRetry,
  onOpenFolder,
  onOpenNote,
  onCaptured,
}: Props) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);

  const name = folder?.name || "Minhas notas";

  const capture = async () => {
    const text = draft.trim();
    if (!text || !folder) return;
    try {
      await captureIdea(folderDir(root, folder.path), text);
      setDraft("");
      setCaptureError(null);
      onCaptured();
    } catch (e) {
      setCaptureError(String(e));
    }
  };

  const folders = folder?.folders.length ?? 0;
  const notes = folder?.notes.length ?? 0;
  const summary = [
    folders > 0 && (folders === 1 ? "1 pasta" : `${folders} pastas`),
    notesLabel(notes),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-[18px] px-8 pt-7 pb-[18px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate font-display text-[26px] font-medium tracking-tight">
            {name}
          </h1>
          <p className="text-sm text-muted">
            {summary}
            {indexing && " · indexando…"}
          </p>
        </div>
        <label className="flex h-[46px] items-center gap-3 rounded-card border border-line bg-canvas pr-2 pl-3.5 transition-colors focus-within:border-brand-light">
          <NewFileIcon className="shrink-0 text-muted" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void capture();
              }
            }}
            placeholder={folder?.path ? `Nova nota em ${name}` : "Nova nota"}
            aria-label="Nova nota"
            className="min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-muted"
          />
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <kbd className="rounded-[4px] border border-line px-1.5 font-mono text-2xs">
              ↵
            </kbd>
            criar
          </span>
        </label>
        {captureError && (
          <p role="alert" className="text-base text-red-700">
            {captureError}
          </p>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="mx-8 flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-6"
        >
          <p className="text-md text-ink">
            Não foi possível carregar as notas: {error}
          </p>
          <Button variant="secondary" onClick={onRetry}>
            Tentar de novo
          </Button>
        </div>
      ) : !folder ? (
        <p className="px-8 text-md text-muted" aria-busy="true">
          Carregando notas…
        </p>
      ) : folders + notes === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-base text-muted">
          <p className="text-md text-ink">Pasta vazia</p>
          <p>Digite no campo acima para criar a primeira nota.</p>
        </div>
      ) : (
        <>
          <div
            className={`${grid} pr-8 pb-2 pl-[46px] text-2xs font-semibold tracking-widest text-muted uppercase`}
          >
            <span>Nome</span>
            <span>Itens</span>
            <span className="text-right">Modificado</span>
          </div>
          <ul className="flex flex-col gap-0.5 px-5 pb-6">
            {folder.items.map((item) =>
              item.kind === "folder" ? (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenFolder(item.folder.path)}
                    className={`${grid} w-full cursor-pointer items-center rounded-control px-3 py-[11px] text-left transition-colors hover:bg-highlight/60 focus-visible:outline-2 focus-visible:outline-brand-light`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <FolderIcon open className="shrink-0 text-brand-light" />
                      <span className="truncate text-md font-medium text-ink">
                        {item.folder.name}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {notesLabel(countNotes(item.folder))}
                    </span>
                    <span />
                  </button>
                </li>
              ) : (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenNote(item.note.path)}
                    className={`${grid} w-full cursor-pointer items-center rounded-control px-3 py-[11px] text-left transition-colors hover:bg-highlight/60 focus-visible:outline-2 focus-visible:outline-brand-light`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <FileIcon className="shrink-0 text-muted" />
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className="truncate text-md font-medium text-ink">
                          {item.note.title || "Sem título"}
                        </span>
                        {item.note.excerpt && (
                          <span className="truncate text-sm text-muted">
                            {item.note.excerpt}
                          </span>
                        )}
                      </span>
                    </span>
                    <span />
                    <span className="text-right font-mono text-xs text-muted">
                      {formatDate(item.note.modified)}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}
