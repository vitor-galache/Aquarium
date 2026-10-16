import { useState } from "react";
import { Sidebar } from "./layout/Sidebar";
import { Toolbar } from "./layout/Toolbar";
import { routeLabels, type Route } from "./layout/routes";
import { MeuAquario } from "./pages/MeuAquario";
import { Reencontrar } from "./pages/Reencontrar";

function App() {
  const [route, setRoute] = useState<Route>("aquario");

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar route={route} onNavigate={setRoute} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar title={routeLabels[route]} />
        <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
          {route === "aquario" && <MeuAquario />}
          {route === "reencontrar" && <Reencontrar />}
          {route === "mare" && (
            <p className="text-md text-muted">
              A Maré de estudo chega em breve.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
