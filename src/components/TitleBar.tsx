/** Faixa arrastável no lugar da barra de título nativa (escondida no macOS). */
export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-40 h-7"
      aria-hidden="true"
    />
  );
}
