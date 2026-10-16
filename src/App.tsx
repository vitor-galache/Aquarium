import { useEffect, useState } from "react";
import { Sidebar } from "./layout/Sidebar";
import { MeuAquario } from "./pages/MeuAquario";
import { PrimeiroAcesso } from "./pages/PrimeiroAcesso";
import { CaptureModal } from "./components/CaptureModal";
import {
  onOpenCapture,
  startup,
  type Aquarium,
  type Startup,
} from "./lib/aquarium";

function App() {
  const [initial, setInitial] = useState<Startup | null>(null);
  const [aquarium, setAquarium] = useState<Aquarium | null>(null);
  const [capturing, setCapturing] = useState(false);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
        <MeuAquario aquarium={aquarium} onCapture={() => setCapturing(true)} />
      </main>
      {capturing && (
        <CaptureModal dir={aquarium.path} onClose={() => setCapturing(false)} />
      )}
    </div>
  );
}

export default App;
