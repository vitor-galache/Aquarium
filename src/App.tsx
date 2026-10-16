import { useEffect, useState } from "react";
import { Sidebar } from "./layout/Sidebar";
import { MeuAquario } from "./pages/MeuAquario";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { NotaAberta } from "./pages/NotaAberta";
import { Button } from "./components/Button";
import { CaptureModal } from "./components/CaptureModal";
import {
  createNote,
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
  const [view, setView] = useState<View>({ kind: "aquario" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [focus, setFocus] = useState(false);
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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {!focused && (
        <Sidebar
          refreshKey={refreshKey}
          activePath={view.kind === "nota" ? view.path : null}
          onNewNote={() => void newNote()}
          onOpenNote={(path) => setView({ kind: "nota", path })}
          onHome={() => setView({ kind: "aquario" })}
        />
      )}
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
        {view.kind === "nota" ? (
          <NotaAberta
            key={view.path}
            path={view.path}
            focus={focused}
            onFocusChange={setFocus}
            onBack={() => setView({ kind: "aquario" })}
            onOpenNote={(path) => {
              setRefreshKey((k) => k + 1);
              setView({ kind: "nota", path });
            }}
            onDeleted={() => {
              setRefreshKey((k) => k + 1);
              setView({ kind: "aquario" });
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
            onSearch={() => setView({ kind: "em-breve", title: "Buscar" })}
          />
        )}
      </main>
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
