import { useEffect, useRef } from "react";
import searchIcon from "../assets/icons/search.svg";

export function Toolbar({ title }: { title: string }) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="flex h-toolbar shrink-0 items-center justify-between border-b border-line px-8">
      <p className="text-sm whitespace-pre text-muted">{`Meu conhecimento  /  ${title}`}</p>
      <label className="flex w-search items-center gap-[9px] rounded-control border border-line bg-surface p-[9px] focus-within:border-brand-light">
        <img src={searchIcon} alt="" width={16} height={16} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Buscar nas notas"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <kbd className="pr-[9px] font-sans text-sm text-muted">Ctrl K</kbd>
      </label>
    </header>
  );
}
