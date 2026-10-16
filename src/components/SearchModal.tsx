import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { searchNotes, type SearchHit } from "../lib/aquarium";

type Props = {
  onOpenNote: (path: string) => void;
  onClose: () => void;
};

/** Trecho com os termos encontrados destacados (marcadores `\u0001`…`\u0002`). */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split("\u0001").map((part, i) => {
        if (i === 0) return part;
        const [hit, rest] = part.split("\u0002");
        return (
          <span key={i}>
            <mark className="rounded-sm bg-highlight text-brand">{hit}</mark>
            {rest}
          </span>
        );
      })}
    </>
  );
}

/** Busca rápida: ↑/↓ escolhem, Enter abre, Esc fecha. */
export function SearchModal({ onOpenNote, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  useEffect(() => {
    let current = true;
    searchNotes(query)
      .then((result) => {
        if (!current) return;
        setHits(result);
        setSelected(0);
        setError(null);
      })
      .catch((e: unknown) => {
        if (current) setError(String(e));
      });
    return () => {
      current = false;
    };
  }, [query]);

  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const open = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onOpenNote(hit.path);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((i) => Math.min(i + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      open(hits[selected]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-abyss/40 pt-[14vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar notas"
        className="flex max-h-[70vh] w-[640px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-xl"
      >
        <input
          ref={field}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscar em títulos e conteúdo…"
          aria-label="Buscar notas"
          aria-controls="search-results"
          aria-activedescendant={
            hits[selected] ? `search-hit-${selected}` : undefined
          }
          className="w-full border-b border-line bg-transparent px-5 py-4 text-title text-ink outline-none placeholder:text-muted"
        />
        {error ? (
          <p className="px-5 py-4 text-sm text-red-700">{error}</p>
        ) : query.trim() && hits.length === 0 ? (
          <p className="px-5 py-4 text-md text-muted">
            Nenhuma nota encontrada.
          </p>
        ) : (
          <ul
            ref={list}
            id="search-results"
            role="listbox"
            className="flex flex-col overflow-y-auto p-2"
          >
            {hits.map((hit, i) => (
              <li
                key={hit.path}
                id={`search-hit-${i}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setSelected(i)}
                onClick={() => open(hit)}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-control px-3 py-2 ${
                  i === selected ? "bg-canvas" : ""
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-md font-semibold text-ink">
                    {hit.title || "Sem título"}
                  </span>
                  <span className="shrink-0 truncate text-xs text-muted">
                    {hit.folder ? `${hit.folder}/` : "/"}
                  </span>
                </span>
                {hit.snippet && (
                  <span className="line-clamp-2 text-sm text-muted">
                    <Snippet text={hit.snippet} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line px-5 py-2 text-xs text-muted">
          ↑↓ navega · Enter abre · Esc fecha
        </div>
      </div>
    </div>
  );
}
