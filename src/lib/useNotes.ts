import { useEffect, useState } from "react";
import {
  indexStatus,
  getOrder,
  listFolders,
  listNotes,
  onIndexStatus,
  setOrder as saveOrder,
  type IndexStatus,
  type Order,
  type NoteSummary,
} from "./vault";

/** Notas do índice, recarregadas a cada sincronização ou mudança do app. */
export function useNotes(root: string, refreshKey: number) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [order, setOrder] = useState<Order>({});
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
    Promise.all([listNotes(), listFolders(), getOrder()]).then(
      ([list, dirs, saved]) => {
        if (!current) return;
        setNotes(list);
        setFolders(dirs);
        setOrder(saved);
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
    folders,
    order,
    error,
    /** Grava a nova ordem de uma pasta, já refletindo na tela. */
    reorder: (folder: string, items: string[]) => {
      setOrder((prev) => ({ ...prev, [folder]: items }));
      saveOrder(folder, items).catch((e: unknown) => setError(String(e)));
    },
    reload: () => setRetry((n) => n + 1),
  };
}
