import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
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
  onSettings: () => void;
  onRename: (path: string, title: string) => void;
  onDuplicate: (path: string) => void;
  onTrash: (path: string) => void;
};

/** Pasta do explorador, montada a partir do campo `folder` do índice. */
type Folder = {
  path: string;
  name: string;
  folders: Folder[];
  notes: NoteSummary[];
};

const byName = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

function buildTree(notes: NoteSummary[]): Folder {
  const root: Folder = { path: "", name: "", folders: [], notes: [] };
  for (const note of notes) {
    let folder = root;
    for (const part of note.folder.split("/").filter(Boolean)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.find((f) => f.path === path);
      if (!child) {
        child = { path, name: part, folders: [], notes: [] };
        folder.folders.push(child);
      }
      folder = child;
    }
    folder.notes.push(note);
  }
  const sort = (folder: Folder) => {
    folder.folders.sort((a, b) => byName(a.name, b.name));
    folder.notes.sort((a, b) => byName(a.title, b.title));
    folder.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const ancestors = (folder: string) =>
  folder
    .split("/")
    .filter(Boolean)
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));

const rowClass =
  "flex w-full cursor-pointer items-center gap-1.5 truncate rounded-control py-1 pr-2 text-left text-md transition-colors focus-visible:outline-2 focus-visible:outline-brand-light";

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
  onSettings,
  onRename,
  onDuplicate,
  onTrash,
}: Props) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");
  // Pastas abertas/fechadas pelo usuário; as demais seguem a nota aberta.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const [menu, setMenu] = useState<{
    note: NoteSummary;
    x: number;
    y: number;
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    path: string;
    title: string;
  } | null>(null);

  const activeFolder = notes.find((n) => n.path === activePath)?.folder;
  const activeAncestors = new Set(ancestors(activeFolder ?? ""));
  const isExpanded = (path: string) =>
    toggled.get(path) ?? activeAncestors.has(path);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

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
    : notes;
  const tree = buildTree(notes);

  const toggle = (path: string) =>
    setToggled((prev) => new Map(prev).set(path, !isExpanded(path)));

  const noteRow = (note: NoteSummary, depth: number) => {
    const indent = { paddingLeft: 8 + depth * 14 };
    if (renaming?.path === note.path) {
      const submit = () => {
        const title = renaming.title.trim();
        setRenaming(null);
        if (title && title !== note.title) onRename(note.path, title);
      };
      return (
        <li key={note.path} style={indent}>
          <input
            autoFocus
            value={renaming.title}
            aria-label="Novo título"
            onChange={(e) =>
              setRenaming({ ...renaming, title: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setRenaming(null);
            }}
            onBlur={submit}
            className="w-full rounded-control border border-brand-light bg-canvas px-2 py-1 text-md text-ink outline-none"
          />
        </li>
      );
    }
    const active = note.path === activePath;
    return (
      <li key={note.path}>
        <button
          type="button"
          onClick={() => onOpenNote(note.path)}
          onContextMenu={(e: MouseEvent) => {
            e.preventDefault();
            setMenu({ note, x: e.clientX, y: e.clientY });
          }}
          aria-current={active ? "page" : undefined}
          title={note.title}
          style={indent}
          className={`${rowClass} ${
            active
              ? "bg-highlight font-semibold text-brand"
              : "text-ink hover:bg-canvas"
          }`}
        >
          <span className="truncate">{note.title || "Sem título"}</span>
        </button>
      </li>
    );
  };

  const folderRows = (folder: Folder, depth: number): ReactNode[] => [
    ...folder.folders.map((child) => {
      const expanded = isExpanded(child.path);
      return (
        <li key={`dir:${child.path}`}>
          <button
            type="button"
            onClick={() => toggle(child.path)}
            aria-expanded={expanded}
            style={{ paddingLeft: 8 + depth * 14 }}
            className={`${rowClass} text-muted hover:bg-canvas hover:text-ink`}
          >
            <span
              aria-hidden="true"
              className={`inline-block w-2.5 text-2xs transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              ▶
            </span>
            <span className="truncate">{child.name}</span>
          </button>
          {expanded && (
            <ul className="flex flex-col gap-0.5">
              {folderRows(child, depth + 1)}
            </ul>
          )}
        </li>
      );
    }),
    ...folder.notes.map((note) => noteRow(note, depth)),
  ];

  return (
    <nav className="flex h-full w-sidebar shrink-0 flex-col gap-6 overflow-hidden border-r border-line bg-surface px-[18px] pt-10 pb-[18px]">
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
          {terms.length ? "Resultados" : "Notas"}
        </h2>
        {visible.length === 0 ? (
          <p className="px-2 text-base text-muted">
            {terms.length ? "Nenhuma nota encontrada." : "Nenhuma nota ainda."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5 overflow-y-auto">
            {terms.length
              ? visible.map((note) => noteRow(note, 0))
              : folderRows(tree, 0)}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onSettings}
        className="cursor-pointer rounded-control px-2 py-1.5 text-left text-md text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-light"
      >
        Configurações
      </button>

      {menu && (
        <ul
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 flex min-w-[160px] flex-col gap-0.5 rounded-card border border-line bg-surface p-1 shadow-xl"
        >
          {(
            [
              [
                "Renomear",
                () =>
                  setRenaming({ path: menu.note.path, title: menu.note.title }),
              ],
              ["Duplicar", () => onDuplicate(menu.note.path)],
              ["Mover para a lixeira", () => onTrash(menu.note.path)],
            ] as const
          ).map(([label, action]) => (
            <li key={label}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  action();
                }}
                className="w-full cursor-pointer rounded-control px-3 py-1.5 text-left text-md text-ink hover:bg-highlight"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
