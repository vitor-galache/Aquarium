import type { NoteSummary, Order } from "./aquarium";

/** Pasta do explorador, montada a partir do campo `folder` do índice. */
export type Folder = {
  /** Caminho relativo ao aquário, com `/` (`""` na raiz). */
  path: string;
  name: string;
  folders: Folder[];
  notes: NoteSummary[];
  /** Pastas e notas juntas, na ordem do explorador. */
  items: Item[];
};

export type Item =
  | { kind: "folder"; key: string; folder: Folder }
  | { kind: "note"; key: string; note: NoteSummary };

/** Chave do item na ordem manual: `nota.md` ou `pasta/`. */
export const noteKey = (note: NoteSummary) =>
  note.path.split(/[\\/]/).pop() ?? note.path;

const byName = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/**
 * Monta a árvore com as pastas (inclusive vazias) e notas. Itens fora da
 * ordem manual vão depois dos ordenados: pastas e notas em ordem alfabética.
 */
export function buildTree(
  notes: NoteSummary[],
  folders: string[] = [],
  order: Order = {},
): Folder {
  const root: Folder = {
    path: "",
    name: "",
    folders: [],
    notes: [],
    items: [],
  };
  const folderAt = (relative: string) => {
    let folder = root;
    for (const part of relative.split("/").filter(Boolean)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.find((f) => f.path === path);
      if (!child) {
        child = { path, name: part, folders: [], notes: [], items: [] };
        folder.folders.push(child);
      }
      folder = child;
    }
    return folder;
  };
  folders.forEach(folderAt);
  for (const note of notes) folderAt(note.folder).notes.push(note);

  const sort = (folder: Folder) => {
    folder.folders.sort((a, b) => byName(a.name, b.name));
    folder.notes.sort((a, b) => byName(a.title, b.title));
    const items: Item[] = [
      ...folder.folders.map((f): Item => ({
        kind: "folder",
        key: `${f.name}/`,
        folder: f,
      })),
      ...folder.notes.map((n): Item => ({
        kind: "note",
        key: noteKey(n),
        note: n,
      })),
    ];
    const saved = order[folder.path] ?? [];
    const rank = (item: Item) => {
      const i = saved.indexOf(item.key);
      return i < 0 ? saved.length : i;
    };
    // `sort` é estável: sem posição salva, mantém pastas e depois notas.
    folder.items = items.sort((a, b) => rank(a) - rank(b));
    folder.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** `a/b/c` → `["a", "a/b", "a/b/c"]`. */
export const ancestors = (folder: string) =>
  folder
    .split("/")
    .filter(Boolean)
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));

export const findFolder = (root: Folder, path: string): Folder | null => {
  let folder: Folder | undefined = root;
  for (const part of ancestors(path)) {
    folder = folder.folders.find((f) => f.path === part);
    if (!folder) return null;
  }
  return folder;
};

export const countNotes = (folder: Folder): number =>
  folder.notes.length +
  folder.folders.reduce((sum, child) => sum + countNotes(child), 0);

export const notesLabel = (n: number) => (n === 1 ? "1 nota" : `${n} notas`);

/** Pasta do aquário no disco, para gravar notas nela. */
export const folderDir = (root: string, folder: string) =>
  folder ? `${root}/${folder}` : root;
