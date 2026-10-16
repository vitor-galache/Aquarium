import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Theme = "sistema" | "claro" | "escuro";

/** Configurações do aquário, gravadas em `.aquarium/config.json`. */
export type AquariumConfig = {
  version: number;
  /** Atalho global no formato do Tauri (ex.: `Ctrl+Shift+Space`). */
  captureShortcut: string;
  theme: Theme;
};

export type Aquarium = {
  path: string;
  noteCount: number;
  isNew: boolean;
  config: AquariumConfig;
};

export type Startup = {
  suggestedPath: string | null;
  aquarium: Aquarium | null;
  error: string | null;
};

export const startup = () => invoke<Startup>("startup");

export const openAquarium = (path: string) =>
  invoke<Aquarium>("open_aquarium", { path });

/** Valida e grava as configurações; falha se o atalho estiver em uso. */
export const saveConfig = (config: AquariumConfig) =>
  invoke<AquariumConfig>("save_config", { config });

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

/** Move a nota para a lixeira (`.lixeira/` dentro do aquário). */
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
  /** Subpasta relativa ao aquário (`""` na raiz). */
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
