import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CaptureWindow } from "./components/CaptureWindow";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

// Sem o menu do navegador (Recarregar, Inspecionar…) fora dos campos de texto.
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("input, textarea, [contenteditable='true']"))
    event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={400}>
      {window.location.hash === "#capture" ? <CaptureWindow /> : <App />}
    </TooltipProvider>
  </React.StrictMode>,
);
