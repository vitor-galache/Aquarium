import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { readNote, type Note } from "../lib/aquarium";

type Props = {
  path: string;
  onBack: () => void;
};

/** Leitura da nota; o editor com autosave chega na tarefa 10. */
export function NotaAberta({ path, onBack }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    readNote(path).then(
      (n) => current && setNote(n),
      (e: unknown) => current && setError(String(e)),
    );
    return () => {
      current = false;
    };
  }, [path]);

  return (
    <div className="flex flex-col items-start gap-4">
      <Button variant="secondary" onClick={onBack}>
        ← Meu aquário
      </Button>
      {error ? (
        <p role="alert" className="text-md text-ink">
          Não foi possível abrir a nota: {error}
        </p>
      ) : !note ? (
        <p className="text-md text-muted">Abrindo nota…</p>
      ) : (
        <article className="flex w-full flex-col gap-3">
          <h1 className="font-display text-heading font-semibold">
            {note.title}
          </h1>
          <pre className="font-sans text-md whitespace-pre-wrap text-ink">
            {note.body}
          </pre>
        </article>
      )}
    </div>
  );
}
