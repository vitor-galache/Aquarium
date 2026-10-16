import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Sem o menu do navegador (Recarregar, Inspecionar…) fora dos campos de texto.
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("input, textarea, [contenteditable='true']"))
    event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
