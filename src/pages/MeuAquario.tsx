import type { Aquarium } from "../lib/aquarium";

export function MeuAquario({ aquarium }: { aquarium: Aquarium }) {
  const { noteCount, path } = aquarium;
  return (
    <div className="flex flex-col gap-[5px]">
      <h1 className="font-display text-heading font-semibold">Meu aquário</h1>
      <p className="text-md text-muted">
        {noteCount === 1 ? "1 nota" : `${noteCount} notas`} em {path}
      </p>
    </div>
  );
}
