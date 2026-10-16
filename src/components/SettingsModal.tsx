import { useEffect, useState, type KeyboardEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "./Button";
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

type Section = "captura" | "pasta" | "aparencia";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "captura", label: "Captura" },
  { value: "pasta", label: "Pasta" },
  { value: "aparencia", label: "Aparência" },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: "sistema", label: "Sistema" },
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

/** Texto amigável: `Ctrl+Shift+Space` → `Ctrl + Shift + Espaço`. */
function shortcutLabel(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) =>
      part === "Space"
        ? "Espaço"
        : part === "Super"
          ? "Cmd"
          : part.replace(/^(Key|Digit)/, ""),
    )
    .join(" + ");
}

export function SettingsModal({ aquarium, onChange, onClose }: Props) {
  const [section, setSection] = useState<Section>("captura");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { config } = aquarium;

  // Esc fecha, exceto enquanto grava um atalho (aí só cancela a gravação).
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        className="flex h-[560px] max-h-[calc(100vh-64px)] w-[840px] max-w-[calc(100vw-32px)] overflow-hidden rounded-panel border border-line bg-surface shadow-xl"
      >
        <nav className="flex w-sidebar shrink-0 flex-col gap-0.5 border-r border-line bg-canvas px-[18px] py-6">
          <h2 className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            Configurações
          </h2>
          {SECTIONS.map((item) => {
            const active = item.value === section;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setSection(item.value)}
                aria-current={active ? "page" : undefined}
                className={`w-full cursor-pointer rounded-control px-2 py-1.5 text-left text-md transition-colors focus-visible:outline-2 focus-visible:outline-brand-light ${
                  active
                    ? "bg-highlight font-semibold text-brand"
                    : "text-ink hover:bg-surface"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-heading font-semibold">
              {SECTIONS.find((item) => item.value === section)?.label}
            </h1>
            <Button variant="secondary" onClick={onClose} aria-label="Fechar">
              ✕
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-md text-brand">
              {error}
            </p>
          )}

          {section === "captura" && (
            <section className="flex w-full flex-col gap-2">
              <p className="text-md text-muted">
                Abre a captura rápida de qualquer lugar, mesmo com a janela
                fechada.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRecording(true)}
                  onKeyDown={recording ? record : undefined}
                  onBlur={() => setRecording(false)}
                  className="cursor-pointer rounded-control border border-line bg-surface px-3 py-2 font-mono text-md text-ink focus-visible:outline-2 focus-visible:outline-brand-light"
                >
                  {recording
                    ? "Pressione o novo atalho…"
                    : shortcutLabel(config.captureShortcut)}
                </button>
                {recording && (
                  <span className="text-sm text-muted">Esc cancela</span>
                )}
              </div>
            </section>
          )}
          {section === "pasta" && (
            <section className="flex w-full flex-col gap-2">
              <p className="truncate text-md text-muted" title={aquarium.path}>
                {aquarium.path}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void changeFolder()}
              >
                Trocar de pasta
              </Button>
            </section>
          )}
          {section === "aparencia" && (
            <section className="flex w-full flex-col gap-2">
              <div role="radiogroup" aria-label="Tema" className="flex gap-2">
                {THEMES.map((theme) => {
                  const active = theme.value === config.theme;
                  return (
                    <button
                      key={theme.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={busy}
                      onClick={() =>
                        void update({ ...config, theme: theme.value })
                      }
                      className={`cursor-pointer rounded-control border px-4 py-2 text-md transition-colors focus-visible:outline-2 focus-visible:outline-brand-light ${
                        active
                          ? "border-brand bg-highlight font-semibold text-brand"
                          : "border-line bg-surface text-ink hover:bg-highlight"
                      }`}
                    >
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
