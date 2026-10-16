import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Theme = "sistema" | "claro" | "escuro";

/** Configurações da pasta de notas, gravadas em `.notesea/config.json`. */
export type VaultConfig = {
  version: number;
  /** Atalho global no formato do Tauri (ex.: `Ctrl+Shift+Space`). */
  captureShortcut: string;
  theme: Theme;
};

export type Vault = {
  path: string;
  noteCount: number;
  isNew: boolean;
  config: VaultConfig;
};

export type Startup = {
  suggestedPath: string | null;
  vault: Vault | null;
  error: string | null;
};

export const startup = () => invoke<Startup>("startup");

export const openVault = (path: string) =>
  invoke<Vault>("open_vault", { path });

/** Pastas abertas recentemente, da mais nova para a mais antiga. */
export const recentVaults = () => invoke<string[]>("recent_vaults");

/** Tira a pasta da lista de recentes; devolve a lista atualizada. */
export const forgetVault = (path: string) =>
  invoke<string[]>("forget_vault", { path });

/** Valida e grava as configurações; falha se o atalho estiver em uso. */
export const saveConfig = (config: VaultConfig) =>
  invoke<VaultConfig>("save_config", { config });

/** Aplica o tema no documento; `sistema` deixa a media query decidir. */
export const applyTheme = (theme: Theme) => {
  if (theme === "sistema") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
};

export type Depth = "superficie" | "meia-agua" | "fundo" | "lodo";

export type Note = {
  path: string;
  id: string;
  created: string;
  depth: Depth;
  corrente: string | null;
  cardume: string | null;
  tags: string[];
  title: string;
  body: string;
};

export const readNote = (path: string) => invoke<Note>("read_note", { path });

export const createNote = (dir: string, title: string, body: string) =>
  invoke<Note>("create_note", { dir, title, body });

/** `expected` é o corpo que o editor conhecia; se o disco mudou, falha com conflito. */
export const saveNote = (
  path: string,
  body: string,
  expected: string | null,
  corrente: string | null,
  cardume: string | null,
  tags: string[],
) =>
  invoke<Note>("save_note", {
    path,
    body,
    expected,
    corrente,
    cardume,
    tags,
  });

/** Troca o `# título` e o nome do arquivo; devolve a nota no novo caminho. */
export const renameNote = (path: string, title: string) =>
  invoke<Note>("rename_note", { path, title });

export const duplicateNote = (path: string) =>
  invoke<Note>("duplicate_note", { path });

/** Move a nota para a lixeira do sistema operacional. */
export const trashNote = (path: string) => invoke<void>("trash_note", { path });

/** Grava uma imagem colada em `assets/` ao lado da nota; devolve o caminho relativo. */
export const saveImage = async (note: string, file: Blob, extension: string) =>
  invoke<string>("save_image", {
    note,
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    extension,
  });

export const isConflict = (error: unknown) =>
  String(error).startsWith("conflito:");

/** Lê a nota no disco sem contar como abertura. */
export const peekNote = (path: string) => invoke<Note>("peek_note", { path });

export type IndexStatus = {
  indexing: boolean;
  noteCount: number;
};

/** Resumo de nota vindo do índice, para a lista de notas. */
export type NoteSummary = {
  path: string;
  title: string;
  excerpt: string;
  depth: Depth;
  corrente: string | null;
  cardume: string | null;
  /** Subpasta relativa à pasta de notas (`""` na raiz). */
  folder: string;
  tags: string[];
  created: string;
  /** Última edição do arquivo, em ms desde a época Unix. */
  modified: number;
};

/** Tags digitadas separadas por vírgula. */
export const parseTags = (text: string) => [
  ...new Set(
    text
      .split(",")
      .map((t) => t.trim().replace(/^#+/, "").trim())
      .filter(Boolean),
  ),
];

export const listNotes = () => invoke<NoteSummary[]>("list_notes");

export const indexStatus = () => invoke<IndexStatus>("index_status");

export const onIndexStatus = (handler: (status: IndexStatus) => void) =>
  listen<IndexStatus>("index-status", (event) => handler(event.payload));

/** Captura rápida: a primeira linha vira o título (`# ...`), o resto é corpo. */
export const captureIdea = (dir: string, text: string) => {
  const [first, ...rest] = text.trim().split("\n");
  const title = first.replace(/^#+\s*/, "").trim();
  const tail = rest.join("\n").trim();
  return createNote(
    dir,
    title,
    tail ? `# ${title}\n\n${tail}\n` : `# ${title}\n`,
  );
};

/** Pedido de captura vindo do atalho global ou da bandeja. */
export const onOpenCapture = (handler: () => void) =>
  listen("open-capture", () => handler());

/** Resultado da busca; `snippet` marca os termos entre `\u0001` e `\u0002`. */
export type SearchHit = {
  path: string;
  title: string;
  folder: string;
  snippet: string;
};

export const searchNotes = (query: string) =>
  invoke<SearchHit[]>("search_notes", { query });

/** Subpastas da pasta de notas (relativas, com `/`), inclusive vazias. */
export const listFolders = () => invoke<string[]>("list_folders");

/** Cria a pasta `name` dentro de `parent`; devolve o caminho relativo. */
export const createFolder = (parent: string, name: string) =>
  invoke<string>("create_folder", { parent, name });

/** Ordem manual do explorador: pasta → itens (`nota.md`, `pasta/`). */
export type Order = Record<string, string[]>;

export const getOrder = () => invoke<Order>("get_order");

export const setOrder = (folder: string, items: string[]) =>
  invoke<void>("set_order", { folder, items });

/** Move a nota para `folder` (relativa; `""` é a raiz); devolve o novo caminho. */
export const moveNote = (path: string, folder: string) =>
  invoke<string>("move_note", { path, folder });

/** Manda a pasta inteira para a lixeira do sistema operacional. */
export const trashFolder = (folder: string) =>
  invoke<void>("trash_folder", { folder });

/** Move a pasta para dentro de `parent` (`""` é a raiz); devolve o novo caminho. */
export const moveFolder = (folder: string, parent: string) =>
  invoke<string>("move_folder", { folder, parent });

/** Teclas do atalho: `Ctrl+Shift+Space` → `["Ctrl", "Shift", "Espaço"]`. */
export const shortcutKeys = (shortcut: string) =>
  shortcut
    .split("+")
    .map((part) =>
      part === "Space"
        ? "Espaço"
        : part === "Super"
          ? "⌘"
          : part.replace(/^(Key|Digit)/, ""),
    );
