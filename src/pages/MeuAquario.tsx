import { useEffect, useState } from "react";
import {
  indexStatus,
  onIndexStatus,
  type Aquarium,
  type IndexStatus,
} from "../lib/aquarium";

export function MeuAquario({ aquarium }: { aquarium: Aquarium }) {
  const { path } = aquarium;
  const [status, setStatus] = useState<IndexStatus>({
    indexing: true,
    noteCount: aquarium.noteCount,
  });

  useEffect(() => {
    const unlisten = onIndexStatus(setStatus);
    indexStatus().then(setStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [path]);

  const { noteCount, indexing } = status;
  return (
    <div className="flex flex-col gap-[5px]">
      <h1 className="font-display text-heading font-semibold">Meu aquário</h1>
      <p className="text-md text-muted">
        {noteCount === 1 ? "1 nota" : `${noteCount} notas`} em {path}
        {indexing && " · indexando…"}
      </p>
    </div>
  );
}
