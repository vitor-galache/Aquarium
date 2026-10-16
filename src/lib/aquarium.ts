import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Aquarium = {
  path: string;
  noteCount: number;
  isNew: boolean;
};

export type Startup = {
  suggestedPath: string | null;
  aquarium: Aquarium | null;
  error: string | null;
};

export const startup = () => invoke<Startup>("startup");

export const openAquarium = (path: string) =>
  invoke<Aquarium>("open_aquarium", { path });

export type Depth = "superficie" | "meia-agua" | "fundo" | "lodo";

export type Note = {
  path: string;
  id: string;
  created: string;
  depth: Depth;
  corrente: string | null;
  cardume: string | null;
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
) => invoke<Note>("save_note", { path, body, expected, corrente, cardume });

/** Troca o `# título` e o nome do arquivo; devolve a nota no novo caminho. */
export const renameNote = (path: string, title: string) =>
  invoke<Note>("rename_note", { path, title });

export const duplicateNote = (path: string) =>
  invoke<Note>("duplicate_note", { path });

/** Move a nota para a lixeira (`.lixeira/` dentro do aquário). */
export const trashNote = (path: string) => invoke<void>("trash_note", { path });

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
  created: string;
  /** Última edição do arquivo, em ms desde a época Unix. */
  modified: number;
};

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
