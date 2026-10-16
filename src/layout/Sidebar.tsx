import {
  useEffect,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import logoSymbol from "../assets/logo-symbol.svg";
import {
  ChevronIcon,
  CollapseIcon,
  FileIcon,
  FolderIcon,
  GearIcon,
  NewFileIcon,
  NewFolderIcon,
} from "../components/Icons";
import { forgetVault, recentVaults } from "../lib/vault";
import { ancestors, countNotes, type Folder, type Item } from "../lib/tree";

type Props = {
  root: string;
  tree: Folder;
  /** Pasta mostrada na área principal (`""` na raiz). */
  currentFolder: string;
  activePath: string | null;
  onNewNote: () => void;
  /** Cria uma pasta dentro da pasta atual. */
  onNewFolder: (name: string) => void;
  /** Nova ordem manual dos itens de uma pasta. */
  onReorder: (folder: string, items: string[]) => void;
  onOpenFolder: (folder: string) => void;
  /** Abre outra pasta de notas; `null` pergunta qual. */
  onSwitchVault: (path: string | null) => Promise<void>;
  onOpenNote: (path: string) => void;
  onSettings: () => void;
  onRename: (path: string, title: string) => void;
  onDuplicate: (path: string) => void;
  onTrash: (path: string) => void;
  /** Move a nota para outra pasta (`""` é a raiz). */
  onMoveNote: (path: string, folder: string) => void;
  /** Move a pasta para dentro de outra (`""` é a raiz). */
  onMoveFolder: (folder: string, parent: string) => void;
  onTrashFolder: (folder: string) => void;
};

type MenuItem = readonly [label: string, action: () => void];

const folderName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const rowClass =
  "flex h-[30px] w-full cursor-pointer items-center gap-1.5 rounded-chip pr-2.5 text-left text-base transition-colors focus-visible:outline-2 focus-visible:outline-brand-light";

const iconButton =
  "flex size-[26px] cursor-pointer items-center justify-center rounded-chip text-muted transition-colors hover:bg-highlight hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-light";

/** Explorador de arquivos da pasta de notas: pastas e notas `.md`. */
export function Sidebar({
  root,
  tree,
  currentFolder,
  activePath,
  onNewNote,
  onNewFolder,
  onReorder,
  onOpenFolder,
  onSwitchVault,
  onOpenNote,
  onSettings,
  onRename,
  onDuplicate,
  onTrash,
  onMoveNote,
  onMoveFolder,
  onTrashFolder,
}: Props) {
  // Pastas abertas/fechadas pelo usuário; as demais seguem a pasta atual.
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    path: string;
    title: string;
  } | null>(null);

  /** Pastas recentes, enquanto o menu da pasta está aberto. */
  const [recent, setRecent] = useState<string[] | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  // Item arrastado (`note` quando é nota) e onde cairia: antes/depois de um
  // irmão (reordenar) ou dentro de uma pasta (mover). `key` "" é a raiz.
  const [drag, setDrag] = useState<{
    parent: string;
    key: string;
    note?: string;
    folder?: string;
  } | null>(null);
  const [drop, setDrop] = useState<{
    key: string;
    mode: "before" | "after" | "into";
  } | null>(null);

  const openMenu = (e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    // Mantém o menu dentro da janela.
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - items.length * 34 - 16),
      items,
    });
  };

  /** O item arrastado pode entrar nesta pasta? (nunca nela mesma ou abaixo) */
  const canEnter = (target: string) =>
    !!drag &&
    target !== drag.parent &&
    (drag.folder === undefined ||
      (target !== drag.folder && !target.startsWith(`${drag.folder}/`)));

  const moveInto = (target: string) => {
    if (drag?.note) onMoveNote(drag.note, target);
    else if (drag?.folder !== undefined) onMoveFolder(drag.folder, target);
  };

  const endDrag = () => {
    setDrag(null);
    setDrop(null);
  };

  const dragProps = (parent: Folder, item: Item) => ({
    draggable: renaming === null,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.key);
      setDrag({
        parent: parent.path,
        key: item.key,
        note: item.kind === "note" ? item.note.path : undefined,
        folder: item.kind === "folder" ? item.folder.path : undefined,
      });
    },
    onDragOver: (e: DragEvent) => {
      if (!drag || (drag.parent === parent.path && drag.key === item.key))
        return;
      const rect = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - rect.top) / rect.height;
      const sibling = drag.parent === parent.path;
      // Item sobre o meio de uma pasta (ou vindo de outra pasta) entra nela.
      const into =
        item.kind === "folder" &&
        canEnter(item.folder.path) &&
        (!sibling || (y > 0.25 && y < 0.75));
      const key = sibling || into ? item.key : null;
      if (key === null) return;
      e.preventDefault();
      e.stopPropagation();
      const mode = into ? "into" : y < 0.5 ? "before" : "after";
      if (drop?.key !== key || drop.mode !== mode) setDrop({ key, mode });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!drag || !drop) return endDrag();
      if (drop.mode === "into" && item.kind === "folder") {
        moveInto(item.folder.path);
      } else if (drop.mode !== "into") {
        const keys = parent.items
          .map((i) => i.key)
          .filter((k) => k !== drag.key);
        keys.splice(
          keys.indexOf(drop.key) + (drop.mode === "before" ? 0 : 1),
          0,
          drag.key,
        );
        onReorder(parent.path, keys);
      }
      endDrag();
    },
    onDragEnd: endDrag,
  });

  const dropLine = (key: string) =>
    drop?.key !== key
      ? ""
      : drop.mode === "into"
        ? "bg-highlight ring-1 ring-brand-light ring-inset"
        : drop.mode === "before"
          ? "shadow-[inset_0_2px_0_var(--color-brand-light)]"
          : "shadow-[inset_0_-2px_0_var(--color-brand-light)]";

  useEffect(() => {
    if (!recent) return;
    const close = () => setRecent(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [recent]);

  const toggleRecent = () => {
    if (recent) return setRecent(null);
    recentVaults().then(setRecent, (error: unknown) => {
      window.console.error("Não foi possível ler as pastas recentes:", error);
      setRecent([]);
    });
  };

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

  const noteRow = (parent: Folder, item: Item, depth: number) => {
    if (item.kind !== "note") return null;
    const { note } = item;
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
    return (
      <li key={note.path}>
        <button
          type="button"
          {...dragProps(parent, item)}
          onClick={() => onOpenNote(note.path)}
          onContextMenu={(e: MouseEvent) =>
            openMenu(e, [
              [
                "Renomear",
                () => setRenaming({ path: note.path, title: note.title }),
              ],
              ["Duplicar", () => onDuplicate(note.path)],
              ["Mover para a lixeira", () => onTrash(note.path)],
            ])
          }
          aria-current={active ? "page" : undefined}
          title={note.title}
          style={indent(depth)}
          className={`${rowClass} ${dropLine(item.key)} ${
            active
              ? "bg-highlight text-ink"
              : "text-ink/85 hover:bg-highlight/60"
          } ${drag?.key === item.key ? "opacity-50" : ""}`}
        >
          <span className="w-3 shrink-0" />
          <FileIcon className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">
            {note.title || "Sem título"}
            <span className="text-muted/70">.md</span>
          </span>
        </button>
      </li>
    );
  };

  const folderRows = (folder: Folder, depth: number): ReactNode[] =>
    folder.items.map((item) => {
      if (item.kind === "note") return noteRow(folder, item, depth);
      const child = item.folder;
      const expanded = isExpanded(child.path);
      const active = child.path === currentFolder && !activePath;
      return (
        <li key={`dir:${child.path}`}>
          <button
            type="button"
            {...dragProps(folder, item)}
            onContextMenu={(e: MouseEvent) =>
              openMenu(e, [
                ["Mover pasta para a lixeira", () => onTrashFolder(child.path)],
              ])
            }
            onClick={() => {
              setToggled((prev) => new Map(prev).set(child.path, !expanded));
              onOpenFolder(child.path);
            }}
            aria-expanded={expanded}
            style={indent(depth)}
            className={`${rowClass} ${dropLine(item.key)} ${
              active
                ? "bg-highlight text-ink"
                : "text-ink/85 hover:bg-highlight/60"
            } ${drag?.key === item.key ? "opacity-50" : ""}`}
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
    });

  const empty = tree.folders.length === 0 && tree.notes.length === 0;

  return (
    <nav className="flex h-full w-[264px] shrink-0 flex-col border-r border-line bg-surface select-none">
      {/* Espaço dos botões da janela (barra de título escondida). */}
      <div data-tauri-drag-region className="h-11 shrink-0" />

      <button
        type="button"
        onClick={() => onOpenFolder("")}
        className="flex cursor-pointer items-center gap-2.5 px-4 pt-1.5 pb-[18px] focus-visible:outline-2 focus-visible:outline-brand-light"
      >
        <img src={logoSymbol} alt="" width={21} height={30} />
        <span className="font-display text-[19px] font-light tracking-tight text-ink">
          notesea
        </span>
      </button>

      <div className="relative flex items-center gap-1 py-1.5 pr-2.5 pl-2.5">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleRecent}
          title={`${folderName(root)}\n${root}`}
          aria-label={`Pasta aberta: ${folderName(root)}. Pastas recentes`}
          aria-haspopup="menu"
          aria-expanded={recent !== null}
          className={`${iconButton} text-brand-light`}
        >
          <FolderIcon />
        </button>
        {recent && (
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-full left-2.5 z-50 flex w-[300px] flex-col gap-0.5 rounded-card border border-line bg-surface p-1 shadow-xl"
          >
            <p className="px-3 pt-1.5 pb-1 text-2xs font-semibold tracking-widest text-muted uppercase">
              Pastas recentes
            </p>
            {recent.map((path) => {
              const current = path === root;
              return (
                <div key={path} className="group flex items-center">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={current}
                    title={path}
                    onClick={() => {
                      setRecent(null);
                      void onSwitchVault(path);
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control px-3 py-1.5 text-left text-md text-ink hover:bg-highlight"
                  >
                    <span className="w-3 shrink-0 text-brand-light">
                      {current ? "✓" : ""}
                    </span>
                    <span className="truncate">{folderName(path)}</span>
                  </button>
                  {!current && (
                    <button
                      type="button"
                      title="Remover da lista"
                      aria-label={`Remover ${folderName(path)} da lista`}
                      onClick={() =>
                        forgetVault(path).then(setRecent, (error: unknown) =>
                          window.console.error(
                            "Não foi possível remover a pasta da lista:",
                            error,
                          ),
                        )
                      }
                      className={`${iconButton} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            <div className="my-0.5 border-t border-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRecent(null);
                void onSwitchVault(null);
              }}
              className="w-full cursor-pointer rounded-control px-3 py-1.5 text-left text-md text-ink hover:bg-highlight"
            >
              Abrir pasta…
            </button>
          </div>
        )}
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
          title="Nova pasta"
          aria-label="Nova pasta"
          onClick={() => setNewFolder("")}
          className={iconButton}
        >
          <NewFolderIcon />
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

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-0.5 pb-3">
        {newFolder !== null && (
          <label className="mb-px flex h-[30px] items-center gap-1.5 pl-[18px]">
            <FolderIcon className="shrink-0 text-brand-light" />
            <input
              autoFocus
              value={newFolder}
              placeholder={
                currentFolder
                  ? `Nova pasta em ${currentFolder.split("/").pop()}`
                  : "Nova pasta"
              }
              aria-label="Nome da nova pasta"
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolder.trim()) {
                  onNewFolder(newFolder.trim());
                  setNewFolder(null);
                }
                if (e.key === "Escape") setNewFolder(null);
              }}
              onBlur={() => setNewFolder(null)}
              className="h-[30px] min-w-0 flex-1 rounded-chip border border-brand-light bg-canvas px-2 text-base text-ink outline-none placeholder:text-muted"
            />
          </label>
        )}
        {empty && newFolder === null ? (
          <p className="px-2.5 py-1 text-base text-muted">
            Nenhuma nota ainda.
          </p>
        ) : (
          <ul
            className={`flex flex-1 flex-col gap-px rounded-chip ${
              drop?.key === "" ? "ring-1 ring-brand-light ring-inset" : ""
            }`}
            onDragOver={(e) => {
              // Soltar fora das pastas leva o item para a raiz.
              if (!drag || !canEnter("")) return;
              e.preventDefault();
              if (drop?.key !== "") setDrop({ key: "", mode: "into" });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drop?.key === "") moveInto("");
              endDrag();
            }}
          >
            {folderRows(tree, 0)}
          </ul>
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
          {menu.items.map(([label, action]) => (
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
