import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import {
  indexStatus,
  listNotes,
  onIndexStatus,
  type Aquarium,
  type IndexStatus,
  type NoteSummary,
} from "../lib/aquarium";

type Props = {
  aquarium: Aquarium;
  onCapture: () => void;
  onOpenNote: (path: string) => void;
  onSearch: () => void;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const formatDate = (modified: number) =>
  modified > 0 ? dateFormat.format(new Date(modified)) : "";

const countLabel = (n: number) => (n === 1 ? "1 nota" : `${n} notas`);

/** Lista de notas, da última editada para a mais antiga. */
export function MeuAquario({
  aquarium,
  onCapture,
  onOpenNote,
  onSearch,
}: Props) {
  const { path } = aquarium;
  const [status, setStatus] = useState<IndexStatus>({
    indexing: true,
    noteCount: aquarium.noteCount,
  });
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = onIndexStatus(setStatus);
    indexStatus().then(setStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [path]);

  // Recarrega a lista sempre que o índice termina uma sincronização.
  const { noteCount, indexing } = status;
  useEffect(() => {
    if (indexing) return;
    let current = true;
    listNotes()
      .then((list) => {
        if (!current) return;
        setNotes(list);
        setError(null);
      })
      .catch((e: unknown) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [path, indexing, noteCount]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-[5px]">
          <h1 className="font-display text-heading font-semibold">Notas</h1>
          <p className="text-md text-muted">
            {countLabel(noteCount)} em {path}
            {indexing && " · indexando…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onSearch}>
            Buscar
          </Button>
          <Button onClick={onCapture} title="Ctrl+Shift+Espaço">
            Nova nota
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface p-6"
        >
          <p className="text-md text-ink">
            Não foi possível carregar as notas: {error}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              listNotes().then(setNotes, (e: unknown) => setError(String(e)));
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : notes === null ? (
        <p className="text-md text-muted" aria-busy="true">
          Carregando notas…
        </p>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-panel border border-line bg-layer-surface p-8">
          <h2 className="font-display text-title font-semibold text-ink">
            Nenhuma nota ainda
          </h2>
          <p className="max-w-prose text-md text-muted">
            Crie a primeira nota. Ela fica salva como arquivo Markdown nesta
            pasta.
          </p>
          <Button onClick={onCapture}>Nova nota</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.path}>
              <NoteRow note={note} onOpen={onOpenNote} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteRow({
  note,
  onOpen,
}: {
  note: NoteSummary;
  onOpen: (path: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(note.path)}
      className="flex w-full cursor-pointer items-baseline gap-4 rounded-card border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-light"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="truncate text-md font-semibold text-ink">
          {note.title}
        </h3>
        {note.excerpt && (
          <p className="truncate text-base text-muted">{note.excerpt}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted">
        {formatDate(note.modified)}
      </span>
    </button>
  );
}
