import { useEffect, useState } from "react";
import logoSymbol from "../assets/logo-symbol.svg";
import { Button } from "../components/Button";
import {
  indexStatus,
  listNotes,
  onIndexStatus,
  type IndexStatus,
  type NoteSummary,
} from "../lib/aquarium";

type Props = {
  /** Muda quando uma nota é criada pelo app, para recarregar a lista. */
  refreshKey: number;
  activePath: string | null;
  onNewNote: () => void;
  onOpenNote: (path: string) => void;
  onHome: () => void;
};

const RECENT_LIMIT = 15;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function Sidebar({
  refreshKey,
  activePath,
  onNewNote,
  onOpenNote,
  onHome,
}: Props) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const unlisten = onIndexStatus(setStatus);
    indexStatus().then(setStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const indexing = status?.indexing ?? true;
  const noteCount = status?.noteCount ?? 0;
  useEffect(() => {
    if (indexing) return;
    let current = true;
    listNotes()
      .then((list) => {
        if (current) setNotes(list);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [indexing, noteCount, refreshKey]);

  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const visible = terms.length
    ? notes.filter((n) => {
        const text = normalize(`${n.title} ${n.excerpt}`);
        return terms.every((t) => text.includes(t));
      })
    : notes.slice(0, RECENT_LIMIT);

  return (
    <nav className="flex h-full w-sidebar shrink-0 flex-col gap-6 overflow-hidden border-r border-line bg-surface px-[18px] pt-6 pb-[18px]">
      <button
        type="button"
        onClick={onHome}
        className="flex cursor-pointer items-center gap-[7px] rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-light"
      >
        <img src={logoSymbol} alt="" width={27} height={40.5} />
        <span className="font-display text-logo text-ink">aquarium</span>
      </button>

      <div className="flex flex-col gap-3">
        <Button onClick={onNewNote} className="justify-center">
          + Nova nota
        </Button>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter" && visible[0]) onOpenNote(visible[0].path);
          }}
          placeholder="Filtrar notas…"
          aria-label="Filtrar notas"
          className="w-full rounded-control border border-line bg-canvas px-3 py-2 text-md text-ink outline-none placeholder:text-muted focus:border-brand-light"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="px-2 text-xs font-semibold tracking-wide text-muted uppercase">
          {terms.length ? "Resultados" : "Recentes"}
        </h2>
        {visible.length === 0 ? (
          <p className="px-2 text-base text-muted">
            {terms.length ? "Nenhuma nota encontrada." : "Nenhuma nota ainda."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 overflow-y-auto">
            {visible.map((note) => {
              const active = note.path === activePath;
              return (
                <li key={note.path}>
                  <button
                    type="button"
                    onClick={() => onOpenNote(note.path)}
                    aria-current={active ? "page" : undefined}
                    title={note.title}
                    className={`w-full cursor-pointer truncate rounded-control px-2 py-1.5 text-left text-md transition-colors focus-visible:outline-2 focus-visible:outline-brand-light ${
                      active
                        ? "bg-highlight font-semibold text-brand"
                        : "text-ink hover:bg-canvas"
                    }`}
                  >
                    {note.title || "Sem título"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
