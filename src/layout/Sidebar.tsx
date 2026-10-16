import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import logoSymbol from "../assets/logo-symbol.svg";
import {
  ChevronIcon,
  CollapseIcon,
  FileIcon,
  FolderIcon,
  GearIcon,
  NewFileIcon,
  UpDownIcon,
} from "../components/Icons";
import type { NoteSummary } from "../lib/aquarium";
import { ancestors, countNotes, DEPTHS, type Folder } from "../lib/tree";

type Props = {
  root: string;
  tree: Folder;
  /** Pasta mostrada na área principal (`""` na raiz). */
  currentFolder: string;
  activePath: string | null;
  onNewNote: () => void;
  onOpenFolder: (folder: string) => void;
  onOpenNote: (path: string) => void;
  onSettings: () => void;
  onRename: (path: string, title: string) => void;
  onDuplicate: (path: string) => void;
  onTrash: (path: string) => void;
};

const folderName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const rowClass =
  "flex h-[30px] w-full cursor-pointer items-center gap-1.5 rounded-chip pr-2.5 text-left text-base transition-colors focus-visible:outline-2 focus-visible:outline-brand-light";

const iconButton =
  "flex size-[26px] cursor-pointer items-center justify-center rounded-chip text-muted transition-colors hover:bg-highlight hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-light";

/** Explorador de arquivos do aquário: pastas e notas `.md`. */
export function Sidebar({
  root,
  tree,
  currentFolder,
  activePath,
  onNewNote,
  onOpenFolder,
  onOpenNote,
  onSettings,
  onRename,
  onDuplicate,
  onTrash,
}: Props) {
  // Pastas abertas/fechadas pelo usuário; as demais seguem a pasta atual.
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

  const currentAncestors = new Set(ancestors(currentFolder));
  const isExpanded = (path: string) =>
    toggled.get(path) ?? currentAncestors.has(path);

  const indent = (depth: number) => ({ paddingLeft: 6 + depth * 16 });

  const noteRow = (note: NoteSummary, depth: number) => {
    if (renaming?.path === note.path) {
      const submit = () => {
        const title = renaming.title.trim();
        setRenaming(null);
        if (title && title !== note.title) onRename(note.path, title);
      };
      return (
        <li key={note.path} style={indent(depth)}>
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
            className="h-[30px] w-full rounded-chip border border-brand-light bg-canvas px-2 text-base text-ink outline-none"
          />
        </li>
      );
    }
    const active = note.path === activePath;
    const depthInfo = DEPTHS[note.depth];
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
          style={indent(depth)}
          className={`${rowClass} ${
            active
              ? "bg-highlight text-ink"
              : "text-ink/85 hover:bg-highlight/60"
          }`}
        >
          <span className="w-3 shrink-0" />
          <FileIcon className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">
            {note.title || "Sem título"}
            <span className="text-muted/70">.md</span>
          </span>
          <span
            title={depthInfo.label}
            className={`size-1.5 shrink-0 rounded-full ${depthInfo.dot}`}
          />
        </button>
      </li>
    );
  };

  const folderRows = (folder: Folder, depth: number): ReactNode[] => [
    ...folder.folders.map((child) => {
      const expanded = isExpanded(child.path);
      const active = child.path === currentFolder && !activePath;
      return (
        <li key={`dir:${child.path}`}>
          <button
            type="button"
            onClick={() => {
              setToggled((prev) => new Map(prev).set(child.path, !expanded));
              onOpenFolder(child.path);
            }}
            aria-expanded={expanded}
            style={indent(depth)}
            className={`${rowClass} ${
              active
                ? "bg-highlight text-ink"
                : "text-ink/85 hover:bg-highlight/60"
            }`}
          >
            <span className="flex w-3 shrink-0 justify-center text-muted">
              <ChevronIcon
                className={`transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </span>
            <FolderIcon open={expanded} className="shrink-0 text-brand-light" />
            <span className="min-w-0 flex-1 truncate">{child.name}</span>
            <span className="font-mono text-2xs text-muted/70">
              {countNotes(child)}
            </span>
          </button>
          {expanded && (
            <ul className="flex flex-col gap-px">
              {folderRows(child, depth + 1)}
            </ul>
          )}
        </li>
      );
    }),
    ...folder.notes.map((note) => noteRow(note, depth)),
  ];

  const empty = tree.folders.length === 0 && tree.notes.length === 0;

  return (
    <nav className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-surface">
      {/* Espaço dos botões da janela (barra de título escondida). */}
      <div data-tauri-drag-region className="h-11 shrink-0" />

      <button
        type="button"
        onClick={() => onOpenFolder("")}
        className="flex cursor-pointer items-center gap-2.5 px-4 pt-1.5 pb-[18px] focus-visible:outline-2 focus-visible:outline-brand-light"
      >
        <img src={logoSymbol} alt="" width={20} height={30} />
        <span className="font-display text-[19px] font-light tracking-tight text-ink">
          aquarium
        </span>
      </button>

      <button
        type="button"
        onClick={onSettings}
        title="Trocar de pasta"
        className="mx-2.5 mb-2.5 flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-highlight/60 focus-visible:outline-2 focus-visible:outline-brand-light"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-highlight text-brand-light">
          <FolderIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-medium text-ink">
            {folderName(root)}
          </span>
          <span className="truncate font-mono text-2xs text-muted">{root}</span>
        </span>
        <UpDownIcon className="shrink-0 text-muted" />
      </button>

      <div className="flex items-center py-1.5 pr-2.5 pl-[18px]">
        <h2 className="flex-1 text-2xs font-semibold tracking-widest text-muted uppercase">
          Arquivos
        </h2>
        <button
          type="button"
          title="Nova nota"
          aria-label="Nova nota"
          onClick={onNewNote}
          className={iconButton}
        >
          <NewFileIcon />
        </button>
        <button
          type="button"
          title="Recolher tudo"
          aria-label="Recolher tudo"
          onClick={() => {
            const closed = new Map<string, boolean>();
            const walk = (f: Folder) =>
              f.folders.forEach((c) => (closed.set(c.path, false), walk(c)));
            walk(tree);
            setToggled(closed);
          }}
          className={iconButton}
        >
          <CollapseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-0.5 pb-3">
        {empty ? (
          <p className="px-2.5 py-1 text-base text-muted">
            Nenhuma nota ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-px">{folderRows(tree, 0)}</ul>
        )}
      </div>

      <div className="border-t border-line px-2 py-2.5">
        <button
          type="button"
          onClick={onSettings}
          className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-chip px-2.5 text-base text-muted transition-colors hover:bg-highlight/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-light"
        >
          <GearIcon />
          Configurações
        </button>
      </div>

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
