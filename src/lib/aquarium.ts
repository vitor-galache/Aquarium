import { invoke } from "@tauri-apps/api/core";

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
