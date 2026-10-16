import { useEffect, useState } from "react";
import {
  indexStatus,
  listNotes,
  onIndexStatus,
  type IndexStatus,
  type NoteSummary,
} from "./aquarium";

/** Notas do índice, recarregadas a cada sincronização ou mudança do app. */
export function useNotes(root: string, refreshKey: number) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const unlisten = onIndexStatus(setStatus);
    indexStatus().then(setStatus);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [root]);

  const indexing = status?.indexing ?? true;
  const noteCount = status?.noteCount ?? 0;
  useEffect(() => {
    if (indexing) return;
    let current = true;
    listNotes().then(
      (list) => {
        if (!current) return;
        setNotes(list);
        setError(null);
      },
      (e: unknown) => current && setError(String(e)),
    );
    return () => {
      current = false;
    };
  }, [root, indexing, noteCount, refreshKey, retry]);

  return {
    notes,
    indexing,
    error,
    reload: () => setRetry((n) => n + 1),
  };
}
