import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./layout/Sidebar";
import { TopBar } from "./layout/TopBar";
import { ancestors, buildTree, findFolder, folderDir } from "./lib/tree";
import { useNotes } from "./lib/useNotes";
import { MeuAquario } from "./pages/MeuAquario";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { NotaAberta, type NotaAbertaHandle } from "./pages/NotaAberta";
import { Button } from "./components/Button";
import { CaptureModal } from "./components/CaptureModal";
import { SearchModal } from "./components/SearchModal";
import { SettingsModal } from "./components/SettingsModal";
import {
  applyTheme,
  createFolder,
  createNote,
  duplicateNote,
  moveNote,
  trashFolder,
  renameNote,
  trashNote,
  onOpenCapture,
  startup,
  type Aquarium,
  type Startup,
} from "./lib/aquarium";

type View =
  | { kind: "aquario" }
  | { kind: "nota"; path: string }
  | { kind: "em-breve"; title: string };

const rootName = (path: string) =>
  path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function App() {
  const [initial, setInitial] = useState<Startup | null>(null);
  const [aquarium, setAquarium] = useState<Aquarium | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<View>({ kind: "aquario" });
  const [refreshKey, setRefreshKey] = useState(0);
  const openNote = useRef<NotaAbertaHandle>(null);
  /** Pasta aberta no explorador (`""` na raiz). */
  const [folder, setFolder] = useState("");
  const index = useNotes(aquarium?.path ?? "", refreshKey);

  useEffect(() => {
    startup()
      .then((state) => {
        setInitial(state);
        setAquarium(state.aquarium);
      })
      .catch((error: unknown) => {
        setInitial({
          suggestedPath: null,
          aquarium: null,
          error: `Não foi possível iniciar o Aquarium: ${String(error)}`,
        });
      });
  }, []);

  useEffect(() => {
    const unlisten = onOpenCapture(() => setCapturing(true));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (aquarium) applyTheme(aquarium.config.theme);
  }, [aquarium]);

  // Ctrl/Cmd+K abre a busca rápida de qualquer tela.
  useEffect(() => {
    if (!aquarium) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aquarium]);

  if (!initial) return null;

  if (!aquarium) {
    return (
      <PrimeiroAcesso
        initialPath={initial.suggestedPath}
        initialError={initial.error}
        onOpen={setAquarium}
      />
    );
  }

  const newNote = async () => {
    try {
      const note = await createNote(
        folderDir(aquarium.path, current?.path ?? ""),
        "Nova nota",
        "# Nova nota\n",
      );
      setRefreshKey((k) => k + 1);
      setView({ kind: "nota", path: note.path });
    } catch (error) {
      window.console.error("Não foi possível criar a nota:", error);
    }
  };

  /** Ação de arquivo do explorador; na nota aberta, grava o pendente antes. */
  const fileAction = (path: string, action: () => Promise<void>) => {
    const refresh = () => setRefreshKey((k) => k + 1);
    if (view.kind === "nota" && view.path === path && openNote.current) {
      // Erros ficam com a nota aberta, que mostra e destrava o autosave.
      void openNote.current.run(() => action().then(refresh));
    } else {
      action().then(refresh, (error: unknown) =>
        window.console.error("Não foi possível alterar a nota:", error),
      );
    }
  };

  const tree = buildTree(index.notes ?? [], index.folders, index.order);
  const current = findFolder(tree, folder) ?? tree;
  const openedNote =
    view.kind === "nota"
      ? index.notes?.find((n) => n.path === view.path)
      : undefined;
  const crumbFolder = openedNote ? openedNote.folder : current.path;
  const goTo = (path: string) => {
    setFolder(path);
    setView({ kind: "aquario" });
  };
  const crumbs = [
    { label: rootName(aquarium.path), onClick: () => goTo("") },
    ...ancestors(crumbFolder).map((path) => ({
      label: path.split("/").pop() ?? path,
      onClick: () => goTo(path),
    })),
    ...(view.kind === "nota" ? [{ label: openedNote?.title || "Nota" }] : []),
  ];

  /** Na ordem manual, a nota renomeada continua onde estava. */
  const keepPosition = (from: string, to: string) => {
    const folder = index.notes?.find((n) => n.path === from)?.folder;
    const saved = folder === undefined ? undefined : index.order[folder];
    const name = (p: string) => p.split(/[\\/]/).pop() ?? p;
    if (folder === undefined || !saved?.includes(name(from))) return;
    index.reorder(
      folder,
      saved.map((k) => (k === name(from) ? name(to) : k)),
    );
  };

  const isOpen = (path: string) => view.kind === "nota" && view.path === path;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        root={aquarium.path}
        tree={tree}
        currentFolder={crumbFolder}
        activePath={view.kind === "nota" ? view.path : null}
        onNewNote={() => void newNote()}
        onNewFolder={(name) =>
          createFolder(crumbFolder, name).then(
            (path) => {
              setRefreshKey((k) => k + 1);
              goTo(path);
            },
            (error: unknown) =>
              window.console.error("Não foi possível criar a pasta:", error),
          )
        }
        onReorder={index.reorder}
        onOpenFolder={goTo}
        onOpenNote={(path) => setView({ kind: "nota", path })}
        onSettings={() => setSettings(true)}
        onRename={(path, title) =>
          fileAction(path, async () => {
            const note = await renameNote(path, title);
            keepPosition(path, note.path);
            if (isOpen(path)) setView({ kind: "nota", path: note.path });
          })
        }
        onDuplicate={(path) =>
          fileAction(path, async () => {
            const note = await duplicateNote(path);
            setView({ kind: "nota", path: note.path });
          })
        }
        onMoveNote={(path, target) =>
          fileAction(path, async () => {
            const moved = await moveNote(path, target);
            if (isOpen(path)) setView({ kind: "nota", path: moved });
          })
        }
        onTrashFolder={(target) => {
          // A nota aberta dentro da pasta vai junto: grava antes e sai dela.
          const inside = (f: string) =>
            f === target || f.startsWith(`${target}/`);
          const run = async () => {
            await trashFolder(target);
            if (inside(crumbFolder))
              goTo(target.split("/").slice(0, -1).join("/"));
            setRefreshKey((k) => k + 1);
          };
          const failed = (error: unknown) =>
            window.console.error("Não foi possível excluir a pasta:", error);
          if (view.kind === "nota" && openedNote && inside(openedNote.folder))
            void openNote.current?.run(run);
          else run().catch(failed);
        }}
        onTrash={(path) =>
          fileAction(path, async () => {
            await trashNote(path);
            if (isOpen(path)) setView({ kind: "aquario" });
          })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar crumbs={crumbs} onSearch={() => setSearching(true)} />
        <div
          className={`flex flex-1 flex-col overflow-y-auto ${view.kind === "aquario" ? "" : "gap-6 p-8"}`}
        >
          {view.kind === "nota" ? (
            <NotaAberta
              key={view.path}
              ref={openNote}
              path={view.path}
              onBack={() => setView({ kind: "aquario" })}
              onOpenNote={(path) => {
                setRefreshKey((k) => k + 1);
                setView({ kind: "nota", path });
              }}
            />
          ) : view.kind === "em-breve" ? (
            <div className="flex flex-col items-start gap-4">
              <Button
                variant="secondary"
                onClick={() => setView({ kind: "aquario" })}
              >
                ← Notas
              </Button>
              <h1 className="font-display text-heading font-semibold">
                {view.title}
              </h1>
              <p className="text-md text-muted">Em breve.</p>
            </div>
          ) : (
            <MeuAquario
              root={aquarium.path}
              folder={index.notes ? current : null}
              indexing={index.indexing}
              error={index.error}
              onRetry={index.reload}
              onOpenFolder={goTo}
              onOpenNote={(path) => setView({ kind: "nota", path })}
              onCaptured={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </div>
      </main>
      {searching && (
        <SearchModal
          onOpenNote={(path) => setView({ kind: "nota", path })}
          onClose={() => setSearching(false)}
        />
      )}
      {settings && (
        <SettingsModal
          aquarium={aquarium}
          onChange={(next) => {
            if (next.path !== aquarium.path) {
              setRefreshKey((k) => k + 1);
              setView({ kind: "aquario" });
            }
            setAquarium(next);
          }}
          onClose={() => setSettings(false)}
        />
      )}
      {capturing && (
        <CaptureModal
          dir={aquarium.path}
          onClose={() => {
            setCapturing(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

export default App;
