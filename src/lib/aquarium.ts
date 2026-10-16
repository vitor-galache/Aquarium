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

export const saveNote = (
  path: string,
  body: string,
  depth: Depth,
  corrente: string | null,
  cardume: string | null,
) => invoke<Note>("save_note", { path, body, depth, corrente, cardume });

export type IndexStatus = {
  indexing: boolean;
  noteCount: number;
};

export const indexStatus = () => invoke<IndexStatus>("index_status");

export const onIndexStatus = (handler: (status: IndexStatus) => void) =>
  listen<IndexStatus>("index-status", (event) => handler(event.payload));
