import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SearchIcon } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

type Crumb = { label: string; onClick?: () => void };

type Props = {
  crumbs: Crumb[];
  onSearch: () => void;
};

/** Arrasta a janela por qualquer ponto da barra que não seja um controle; duplo clique maximiza. */
function dragWindow(e: MouseEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest("button, a, input")) return;
  const win = getCurrentWindow();
  if (e.detail === 2) void win.toggleMaximize();
  else void win.startDragging();
}

/** Barra do topo: caminho atual e busca; também arrasta a janela. */
export function TopBar({ crumbs, onSearch }: Props) {
  return (
    <header
      onMouseDown={dragWindow}
      className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-5 select-none"
    >
      <nav
        aria-label="Caminho"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted"
      >
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span className="text-line">/</span>}
              <button
                type="button"
                onClick={crumb.onClick}
                aria-current={last ? "location" : undefined}
                className={`cursor-pointer truncate rounded-[5px] px-1.5 py-[3px] transition-colors hover:bg-highlight hover:text-ink ${
                  last ? "text-ink" : ""
                }`}
              >
                {crumb.label}
              </button>
            </span>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="flex h-[30px] w-[280px] shrink-0 cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-canvas px-2.5 text-sm text-muted transition-colors hover:border-brand-light"
      >
        <SearchIcon className="size-3.5" />
        <span className="flex-1 text-left">Buscar em todas as notas</span>
        <Kbd>⌘K</Kbd>
      </button>
    </header>
  );
}
