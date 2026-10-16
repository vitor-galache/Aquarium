import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { FilePlusIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { SEARCH_KEY, shortcutKeys, type NoteSummary } from "../lib/vault";
import { notesLabel, type Folder } from "../lib/tree";

type Props = {
  /** Pasta mostrada; `null` enquanto o índice carrega. */
  folder: Folder | null;
  indexing: boolean;
  error: string | null;
  captureShortcut: string;
  onRetry: () => void;
  onNewNote: () => void;
  onSearch: () => void;
  onOpenNote: (path: string) => void;
};

const RECENT_LIMIT = 10;

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});

const formatDate = (modified: number) =>
  modified > 0 ? dateFormat.format(new Date(modified)) : "";

/** Notas da pasta e das subpastas, da mais recente para a mais antiga. */
const recentNotes = (folder: Folder): NoteSummary[] => {
  const all: NoteSummary[] = [];
  const walk = (f: Folder) => {
    all.push(...f.notes);
    f.folders.forEach(walk);
  };
  walk(folder);
  return all.sort((a, b) => b.modified - a.modified);
};

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex items-center gap-1">
    {keys.map((key) => (
      <Kbd key={key}>{key}</Kbd>
    ))}
  </span>
);

/** Tela principal: nova nota, busca, contagem e notas recentes. */
export function MinhasNotas({
  folder,
  indexing,
  error,
  captureShortcut,
  onRetry,
  onNewNote,
  onSearch,
  onOpenNote,
}: Props) {
  const name = folder?.name || "Minhas notas";
  const notes = folder ? recentNotes(folder) : [];
  const empty = folder !== null && notes.length === 0;

  const capture = (
    <p className="flex items-center gap-2 text-sm text-muted">
      Captura rápida de qualquer lugar:
      <Keys keys={shortcutKeys(captureShortcut)} />
    </p>
  );

  if (error) {
    return (
      <div
        role="alert"
        className="m-8 flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-6"
      >
        <p className="text-md text-ink">
          Não foi possível carregar as notas: {error}
        </p>
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <Button onClick={onNewNote}>
          <FilePlusIcon />
          Nova nota
        </Button>
        {capture}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-8 pt-7 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate font-display text-heading font-medium tracking-tight">
            {name}
          </h1>
          <p className="text-sm text-muted">
            {folder ? notesLabel(notes.length) : "Carregando notas…"}
            {indexing && " · indexando…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSearch}>
            <SearchIcon />
            Buscar
            <Keys keys={[SEARCH_KEY]} />
          </Button>
          <Button onClick={onNewNote}>
            <FilePlusIcon />
            Nova nota
          </Button>
        </div>
      </div>

      {folder && (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xs font-semibold tracking-widest text-muted uppercase">
            Recentes
          </h2>
          <ul className="-mx-3 flex flex-col gap-0.5">
            {notes.slice(0, RECENT_LIMIT).map((note) => (
              <li key={note.path}>
                <button
                  type="button"
                  onClick={() => onOpenNote(note.path)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors hover:bg-highlight/60 focus-visible:outline-2 focus-visible:outline-brand-light"
                >
                  <FileTextIcon className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-md text-ink">
                    {note.title || "Sem título"}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {formatDate(note.modified)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
