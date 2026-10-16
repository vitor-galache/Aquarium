import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderIcon, SearchIcon } from "../components/Icons";
import {
  applyTheme,
  openAquarium,
  saveConfig,
  type Aquarium,
  type AquariumConfig,
  type Theme,
} from "../lib/aquarium";

type Props = {
  aquarium: Aquarium;
  onChange: (aquarium: Aquarium) => void;
  onClose: () => void;
};

type Section = "geral" | "captura" | "aparencia";

const SECTIONS: { value: Section; label: string; description: string }[] = [
  {
    value: "geral",
    label: "Geral",
    description: "Pasta das notas e arquivos do app.",
  },
  {
    value: "captura",
    label: "Captura rápida",
    description: "Criar notas de qualquer lugar do sistema.",
  },
  {
    value: "aparencia",
    label: "Aparência",
    description: "Tema da interface.",
  },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "sistema", label: "Igual ao sistema" },
  { value: "claro", label: "Claro" },
  { value: "escuro", label: "Escuro" },
];

const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta"];

/** Converte a tecla pressionada no formato de atalho do Tauri. */
function shortcutFrom(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.includes(event.key)) return null;
  const mods = [
    event.ctrlKey && "Ctrl",
    event.altKey && "Alt",
    event.shiftKey && "Shift",
    event.metaKey && "Super",
  ].filter(Boolean);
  // Atalho global sem modificador roubaria a tecla de todos os apps.
  if (mods.length === 0) return null;
  return [...mods, event.code].join("+");
}

/** Teclas do atalho: `Ctrl+Shift+Space` → `["Ctrl", "Shift", "Espaço"]`. */
const shortcutKeys = (shortcut: string) =>
  shortcut
    .split("+")
    .map((part) =>
      part === "Space"
        ? "Espaço"
        : part === "Super"
          ? "⌘"
          : part.replace(/^(Key|Digit)/, ""),
    );

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const control =
  "h-8 rounded-control border border-line bg-canvas px-3 text-base text-ink outline-none transition-colors focus-visible:border-brand-light disabled:opacity-60";

/** Configurações em tela cheia, no estilo de editores (VS Code, Orca). */
export function Configuracoes({ aquarium, onChange, onClose }: Props) {
  const [section, setSection] = useState<Section>("geral");
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { config } = aquarium;

  // Esc volta ao app, exceto enquanto grava um atalho.
  useEffect(() => {
    if (recording) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, onClose]);

  async function update(next: AquariumConfig) {
    setBusy(true);
    try {
      const saved = await saveConfig(next);
      applyTheme(saved.theme);
      onChange({ ...aquarium, config: saved });
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function record(event: KeyboardEvent) {
    event.preventDefault();
    if (event.key === "Escape") {
      setRecording(false);
      return;
    }
    const shortcut = shortcutFrom(event);
    if (!shortcut) return;
    setRecording(false);
    void update({ ...config, captureShortcut: shortcut });
  }

  async function changeFolder() {
    const selected = await open({
      directory: true,
      defaultPath: aquarium.path,
      title: "Escolha a pasta das notas",
    });
    if (typeof selected !== "string" || selected === aquarium.path) return;
    setBusy(true);
    try {
      const opened = await openAquarium(selected);
      applyTheme(opened.config.theme);
      onChange(opened);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: {
    section: Section;
    label: string;
    description: string;
    control: ReactNode;
    stacked?: boolean;
  }[] = [
    {
      section: "geral",
      label: "Pasta das notas",
      description:
        "Os arquivos Markdown ficam aqui. Trocar abre outra pasta; nada é movido.",
      stacked: true,
      control: (
        <div className="flex gap-2">
          <input
            readOnly
            value={aquarium.path}
            aria-label="Pasta das notas"
            className={`${control} min-w-0 flex-1 font-mono text-sm`}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void changeFolder()}
            className={`${control} flex shrink-0 cursor-pointer items-center gap-2 bg-surface hover:bg-highlight`}
          >
            <FolderIcon />
            Procurar
          </button>
        </div>
      ),
    },
    {
      section: "captura",
      label: "Atalho global",
      description:
        "Abre a janela de nova nota mesmo com o app fechado. Clique e pressione a combinação.",
      control: (
        <button
          type="button"
          disabled={busy}
          onClick={() => setRecording(true)}
          onKeyDown={recording ? record : undefined}
          onBlur={() => setRecording(false)}
          className={`${control} flex cursor-pointer items-center gap-1 ${recording ? "border-brand-light" : ""}`}
        >
          {recording ? (
            <span className="text-muted">Pressione as teclas…</span>
          ) : (
            shortcutKeys(config.captureShortcut).map((key) => (
              <kbd
                key={key}
                className="rounded-[4px] border border-line bg-surface px-1.5 font-mono text-xs"
              >
                {key}
              </kbd>
            ))
          )}
        </button>
      ),
    },
    {
      section: "aparencia",
      label: "Tema",
      description: "Claro, escuro ou seguindo o sistema.",
      control: (
        <select
          value={config.theme}
          disabled={busy}
          aria-label="Tema"
          onChange={(e) =>
            void update({ ...config, theme: e.target.value as Theme })
          }
          className={`${control} cursor-pointer pr-8`}
        >
          {THEMES.map((theme) => (
            <option key={theme.value} value={theme.value}>
              {theme.label}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const terms = normalize(query.trim());
  const searching = terms.length > 0;
  const visible = searching
    ? rows.filter((row) =>
        normalize(`${row.label} ${row.description}`).includes(terms),
      )
    : rows.filter((row) => row.section === section);
  const current = SECTIONS.find((s) => s.value === section)!;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-surface select-none">
        <div data-tauri-drag-region className="h-11 shrink-0" />
        <button
          type="button"
          onClick={onClose}
          className="mx-2 flex h-8 cursor-pointer items-center gap-2 rounded-chip px-2.5 text-base text-muted transition-colors hover:bg-highlight/60 hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          Voltar ao app
        </button>
        <label className="mx-2.5 mt-3 mb-4 flex h-8 items-center gap-2 rounded-control border border-line bg-canvas px-2.5 text-muted focus-within:border-brand-light">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar configurações"
            aria-label="Buscar configurações"
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        </label>
        <nav className="flex flex-col gap-px px-2">
          {SECTIONS.map((item) => {
            const active = !searching && item.value === section;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setQuery("");
                  setSection(item.value);
                }}
                aria-current={active ? "page" : undefined}
                className={`flex h-8 cursor-pointer items-center rounded-chip px-2.5 text-left text-base transition-colors ${
                  active
                    ? "bg-highlight text-ink"
                    : "text-ink/85 hover:bg-highlight/60"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div data-tauri-drag-region className="h-11 shrink-0" />
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-10 pt-4 pb-16">
          <header className="flex flex-col gap-1.5 border-b border-line pb-5">
            <h1 className="font-display text-[22px] font-medium tracking-tight">
              {searching ? "Resultados" : current.label}
            </h1>
            <p className="text-base text-muted">
              {searching
                ? `${visible.length} ${visible.length === 1 ? "configuração" : "configurações"} para “${query.trim()}”`
                : current.description}
            </p>
          </header>

          {error && (
            <p
              role="alert"
              className="rounded-control border border-line bg-highlight px-3 py-2 text-base text-ink"
            >
              {error}
            </p>
          )}

          {visible.length > 0 ? (
            <section className="flex flex-col rounded-card border border-line bg-surface px-5">
              {visible.map((row) => (
                <div
                  key={row.label}
                  className={`flex gap-3 border-b border-line py-4 last:border-b-0 ${
                    row.stacked
                      ? "flex-col"
                      : "items-center justify-between gap-6"
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-md font-medium text-ink">
                      {row.label}
                    </span>
                    <span className="text-sm text-muted">
                      {row.description}
                    </span>
                  </div>
                  <div className={row.stacked ? "" : "shrink-0"}>
                    {row.control}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <p className="text-base text-muted">
              Nenhuma configuração encontrada.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
