import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./layout/Sidebar";
import { MeuAquario } from "./pages/MeuAquario";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { NotaAberta, type NotaAbertaHandle } from "./pages/NotaAberta";
import { Button } from "./components/Button";
import { CaptureModal } from "./components/CaptureModal";
import { SearchModal } from "./components/SearchModal";
import { SettingsModal } from "./components/SettingsModal";
import { TitleBar } from "./components/TitleBar";
import {
  applyTheme,
  createNote,
  duplicateNote,
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

function App() {
  const [initial, setInitial] = useState<Startup | null>(null);
  const [aquarium, setAquarium] = useState<Aquarium | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<View>({ kind: "aquario" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [focus, setFocus] = useState(false);
  const openNote = useRef<NotaAbertaHandle>(null);
  const focused = focus && view.kind === "nota";

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
        aquarium.path,
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

  const isOpen = (path: string) => view.kind === "nota" && view.path === path;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <TitleBar />
      {!focused && (
        <Sidebar
          refreshKey={refreshKey}
          activePath={view.kind === "nota" ? view.path : null}
          onNewNote={() => void newNote()}
          onOpenNote={(path) => setView({ kind: "nota", path })}
          onHome={() => setView({ kind: "aquario" })}
          onSettings={() => setSettings(true)}
          onRename={(path, title) =>
            fileAction(path, async () => {
              const note = await renameNote(path, title);
              if (isOpen(path)) setView({ kind: "nota", path: note.path });
            })
          }
          onDuplicate={(path) =>
            fileAction(path, async () => {
              const note = await duplicateNote(path);
              setView({ kind: "nota", path: note.path });
            })
          }
          onTrash={(path) =>
            fileAction(path, async () => {
              await trashNote(path);
              if (isOpen(path)) setView({ kind: "aquario" });
            })
          }
        />
      )}
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
        {view.kind === "nota" ? (
          <NotaAberta
            key={view.path}
            ref={openNote}
            path={view.path}
            focus={focused}
            onFocusChange={setFocus}
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
            aquarium={aquarium}
            onCapture={() => setCapturing(true)}
            onOpenNote={(path) => setView({ kind: "nota", path })}
            onSearch={() => setSearching(true)}
          />
        )}
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
