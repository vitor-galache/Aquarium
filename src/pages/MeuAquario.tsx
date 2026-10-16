import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import {
  indexStatus,
  onIndexStatus,
  type Aquarium,
  type IndexStatus,
} from "../lib/aquarium";

type Props = {
  aquarium: Aquarium;
  onCapture: () => void;
};

export function MeuAquario({ aquarium, onCapture }: Props) {
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
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-[5px]">
        <h1 className="font-display text-heading font-semibold">Meu aquário</h1>
        <p className="text-md text-muted">
          {noteCount === 1 ? "1 nota" : `${noteCount} notas`} em {path}
          {indexing && " · indexando…"}
        </p>
      </div>
      <Button onClick={onCapture} title="Ctrl+Shift+Espaço">
        Capturar ideia
      </Button>
    </div>
  );
}
