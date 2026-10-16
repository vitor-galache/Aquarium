import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Sidebar } from "./layout/Sidebar";
import { TopBar } from "./layout/TopBar";
import { ancestors, buildTree, findFolder, folderDir } from "./lib/tree";
import { useNotes } from "./lib/useNotes";
import { MinhasNotas } from "./pages/MinhasNotas";
import type { NotaAbertaHandle } from "./pages/NotaAberta";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  createFolder,
  createNote,
  duplicateNote,
  moveFolder,
  moveNote,
  trashFolder,
  renameNote,
  trashNote,
  onOpenCapture,
  onQuitRequested,
  quitApp,
  openVault,
  startup,
  type Vault,
  type Startup,
} from "./lib/vault";

// Telas carregadas sob demanda: o editor (CodeMirror) é a maior parte do
// bundle e não precisa estar pronto para a lista de notas aparecer.
const NotaAberta = lazy(() =>
  import("./pages/NotaAberta").then((m) => ({ default: m.NotaAberta })),
);
const Configuracoes = lazy(() =>
  import("./pages/Configuracoes").then((m) => ({ default: m.Configuracoes })),
);
const PrimeiroAcesso = lazy(() =>
  import("./pages/PrimeiroAcesso").then((m) => ({ default: m.PrimeiroAcesso })),
);
const SearchModal = lazy(() =>
  import("./components/SearchModal").then((m) => ({ default: m.SearchModal })),
);
const CaptureModal = lazy(() =>
  import("./components/CaptureModal").then((m) => ({
    default: m.CaptureModal,
  })),
);

type View =
  | { kind: "inicio" }
  | { kind: "nota"; path: string }
  | { kind: "em-breve"; title: string };

function App() {
  const [initial, setInitial] = useState<Startup | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<View>({ kind: "inicio" });
  const [refreshKey, setRefreshKey] = useState(0);
  const openNote = useRef<NotaAbertaHandle>(null);
  /** Pasta aberta no explorador (`""` na raiz). */
  const [folder, setFolder] = useState("");
  const index = useNotes(vault?.path ?? "", refreshKey);

  useEffect(() => {
    startup()
      .then((state) => {
        setInitial(state);
        setVault(state.vault);
      })
      .catch((error: unknown) => {
        setInitial({
          suggestedPath: null,
          vault: null,
          error: `Não foi possível iniciar o Notesea: ${String(error)}`,
        });
      });
  }, []);

  useEffect(() => {
    const unlisten = onOpenCapture(() => setCapturing(true));
    const unlistenQuit = onQuitRequested(() => {
      const flush = openNote.current?.flush() ?? Promise.resolve();
      void flush.finally(() => void quitApp());
    });
    return () => {
      unlisten.then((fn) => fn());
      unlistenQuit.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (vault) applyTheme(vault.config.theme);
  }, [vault]);

  // Com a lista na tela, adianta o editor para a primeira nota abrir sem espera.
  useEffect(() => {
    if (!vault) return;
    // `setTimeout` e não `requestIdleCallback`, que o WebKit do macOS não tem.
    const id = window.setTimeout(() => void import("./pages/NotaAberta"), 800);
    return () => window.clearTimeout(id);
  }, [vault]);

  // Ctrl/Cmd+K abre a busca rápida de qualquer tela.
  useEffect(() => {
    if (!vault) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vault]);

  if (!initial) return null;

  if (!vault) {
    return (
      <Suspense>
        <PrimeiroAcesso
          initialPath={initial.suggestedPath}
          initialError={initial.error}
          onOpen={setVault}
        />
      </Suspense>
    );
  }

  const newNote = async () => {
    try {
      const note = await createNote(
        folderDir(vault.path, current?.path ?? ""),
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

  /** Alterna para outra pasta de notas; `null` pergunta qual. */
  const switchVault = async (path: string | null) => {
    const selected =
      path ??
      (await open({
        directory: true,
        defaultPath: vault.path,
        title: "Abrir pasta",
      }));
    if (typeof selected !== "string" || selected === vault.path) return;
    const run = async () => {
      const next = await openVault(selected);
      applyTheme(next.config.theme);
      setRefreshKey((k) => k + 1);
      setFolder("");
      setView({ kind: "inicio" });
      setVault(next);
    };
    const failed = (error: unknown) =>
      window.console.error("Não foi possível abrir a pasta:", error);
    // A nota aberta grava o pendente antes de sair da pasta.
    if (view.kind === "nota" && openNote.current)
      await openNote.current.run(run).catch(failed);
    else await run().catch(failed);
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
    setView({ kind: "inicio" });
  };
  const crumbs = [
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

  if (settings) {
    return (
      <Suspense>
        <Configuracoes
          vault={vault}
          onChange={(next) => {
            if (next.path !== vault.path) {
              setRefreshKey((k) => k + 1);
              setFolder("");
              setView({ kind: "inicio" });
            }
            setVault(next);
          }}
          onClose={() => setSettings(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        root={vault.path}
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
        onSwitchVault={switchVault}
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
        onMoveFolder={(source, parent) =>
          moveFolder(source, parent).then(
            (moved) => {
              // A pasta aberta (ou a de cima) segue para o novo lugar.
              if (
                crumbFolder === source ||
                crumbFolder.startsWith(`${source}/`)
              )
                setFolder(moved + crumbFolder.slice(source.length));
              setRefreshKey((k) => k + 1);
            },
            (error: unknown) =>
              window.console.error("Não foi possível mover a pasta:", error),
          )
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
            if (isOpen(path)) setView({ kind: "inicio" });
          })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar crumbs={crumbs} onSearch={() => setSearching(true)} />
        <div
          className={`flex flex-1 flex-col overflow-y-auto ${view.kind === "inicio" ? "" : "gap-6 p-8"}`}
        >
          {view.kind === "nota" ? (
            <Suspense>
              <NotaAberta
                key={view.path}
                ref={openNote}
                path={view.path}
                onBack={() => setView({ kind: "inicio" })}
                onOpenNote={(path) => {
                  setRefreshKey((k) => k + 1);
                  setView({ kind: "nota", path });
                }}
              />
            </Suspense>
          ) : view.kind === "em-breve" ? (
            <div className="flex flex-col items-start gap-4">
              <Button
                variant="outline"
                onClick={() => setView({ kind: "inicio" })}
              >
                ← Notas
              </Button>
              <h1 className="font-display text-heading font-semibold">
                {view.title}
              </h1>
              <p className="text-md text-muted">Em breve.</p>
            </div>
          ) : (
            <MinhasNotas
              folder={index.notes ? current : null}
              indexing={index.indexing}
              error={index.error}
              captureShortcut={vault.config.captureShortcut}
              onRetry={index.reload}
              onNewNote={() => void newNote()}
              onSearch={() => setSearching(true)}
              onOpenNote={(path) => setView({ kind: "nota", path })}
            />
          )}
        </div>
      </main>
      <Suspense>
        {searching && (
          <SearchModal
            onOpenNote={(path) => setView({ kind: "nota", path })}
            onClose={() => setSearching(false)}
          />
        )}
        {capturing && (
          <CaptureModal
            dir={vault.path}
            onClose={() => {
              setCapturing(false);
              setRefreshKey((k) => k + 1);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
