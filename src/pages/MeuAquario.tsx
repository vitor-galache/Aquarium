import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import {
  indexStatus,
  listNotes,
  onIndexStatus,
  type Aquarium,
  type Depth,
  type IndexStatus,
  type NoteSummary,
} from "../lib/aquarium";

type Props = {
  aquarium: Aquarium;
  onCapture: () => void;
  onOpenNote: (path: string) => void;
  onDevelop: () => void;
  onRefind: () => void;
};

type Layer = {
  depth: Depth;
  name: string;
  color: string;
};

const LAYERS: Layer[] = [
  {
    depth: "superficie",
    name: "Superfície",
    color: "var(--color-layer-surface)",
  },
  {
    depth: "meia-agua",
    name: "Meia-água",
    color: "var(--color-layer-midwater)",
  },
  {
    depth: "fundo",
    name: "Fundo",
    color: "var(--color-layer-deep)",
  },
  {
    depth: "lodo",
    name: "Lodo",
    color: "var(--color-layer-silt)",
  },
];

const ALL = "";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});

const formatDate = (created: string) => {
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
};

const countLabel = (n: number) => (n === 1 ? "1 nota" : `${n} notas`);

export function MeuAquario({
  aquarium,
  onCapture,
  onOpenNote,
  onDevelop,
  onRefind,
}: Props) {
  const { path } = aquarium;
  const [status, setStatus] = useState<IndexStatus>({
    indexing: true,
    noteCount: aquarium.noteCount,
  });
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corrente, setCorrente] = useState(ALL);

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

  const correntes = useMemo(
    () =>
      [...new Set((notes ?? []).flatMap((n) => n.corrente ?? []))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [notes],
  );
  const activeCorrente = correntes.includes(corrente) ? corrente : ALL;
  const visible = (notes ?? []).filter(
    (n) => activeCorrente === ALL || n.corrente === activeCorrente,
  );
  const layers = LAYERS.map((layer) => ({
    layer,
    notes: visible.filter((n) => n.depth === layer.depth),
  })).filter((l) => l.notes.length > 0);
  const has = (depth: Depth) => visible.some((n) => n.depth === depth);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-[5px]">
          <h1 className="font-display text-heading font-semibold">
            Meu aquário
          </h1>
          <p className="text-md text-muted">
            {countLabel(noteCount)} em {path}
            {indexing && " · indexando…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {correntes.length > 0 && (
            <select
              aria-label="Filtrar por corrente"
              value={activeCorrente}
              onChange={(e) => setCorrente(e.target.value)}
              className="rounded-control border border-line bg-surface px-3 py-2.5 text-md text-ink"
            >
              <option value={ALL}>Todas as correntes</option>
              {correntes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {has("superficie") && (
            <Button variant="secondary" onClick={onDevelop}>
              Desenvolver ideias
            </Button>
          )}
          {has("lodo") && (
            <Button variant="secondary" onClick={onRefind}>
              Reencontrar
            </Button>
          )}
          <Button onClick={onCapture} title="Ctrl+Shift+Espaço">
            Capturar ideia
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
            Seu aquário ainda está vazio
          </h2>
          <p className="max-w-prose text-md text-muted">
            Capture a primeira ideia: ela entra pela superfície e, com o uso,
            desce sozinha para as camadas mais fundas.
          </p>
          <Button onClick={onCapture}>Capturar a primeira ideia</Button>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-panel">
          {layers.map(({ layer, notes: layerNotes }, i) => (
            // Sem faixas nem rótulos: a cor da água indica a camada e se funde
            // com a da próxima, como uma coluna d'água contínua.
            <section
              key={layer.depth}
              aria-label={layer.name}
              style={{
                background: `linear-gradient(to bottom, ${layer.color}, ${
                  (layers[i + 1] ?? layers[i]).layer.color
                })`,
              }}
            >
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-6">
                {layerNotes.map((note) => (
                  <li key={note.path} title={layer.name}>
                    <NoteCard note={note} onOpen={onOpenNote} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onOpen,
}: {
  note: NoteSummary;
  onOpen: (path: string) => void;
}) {
  const tags = [note.corrente, note.cardume].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(note.path)}
      className="flex h-full w-full cursor-pointer flex-col gap-2 rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-brand-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-light"
    >
      <h3 className="line-clamp-2 text-md font-semibold text-ink">
        {note.title}
      </h3>
      {note.excerpt && (
        <p className="line-clamp-3 text-base text-muted">{note.excerpt}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{tags}</span>
        <span className="shrink-0">{formatDate(note.created)}</span>
      </div>
    </button>
  );
}
