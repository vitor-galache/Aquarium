import { useState, type KeyboardEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../components/Button";
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
  onBack: () => void;
};

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

export function Configuracoes({ aquarium, onChange, onBack }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { config } = aquarium;

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
      title: "Escolha a pasta do seu aquário",
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
    <div className="flex max-w-xl flex-col items-start gap-6">
      <Button variant="secondary" onClick={onBack}>
        ← Notas
      </Button>
      <h1 className="font-display text-heading font-semibold">Configurações</h1>

      {error && (
        <p role="alert" className="text-md text-brand">
          {error}
        </p>
      )}

      <section className="flex w-full flex-col gap-2">
        <h2 className="font-display text-title font-semibold">
          Atalho de captura
        </h2>
        <p className="text-md text-muted">
          Abre a captura rápida de qualquer lugar, mesmo com a janela fechada.
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
          {recording && <span className="text-sm text-muted">Esc cancela</span>}
        </div>
      </section>

      <section className="flex w-full flex-col gap-2">
        <h2 className="font-display text-title font-semibold">Pasta</h2>
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

      <section className="flex w-full flex-col gap-2">
        <h2 className="font-display text-title font-semibold">Tema</h2>
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
                onClick={() => void update({ ...config, theme: theme.value })}
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
    </div>
  );
}
