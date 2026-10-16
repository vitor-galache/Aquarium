import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import { applyTheme, captureIdea, onOpenCapture, startup } from "../lib/vault";

/**
 * Janela de captura, estilo Spotlight: Enter salva e some, Shift+Enter quebra
 * linha, Esc fecha. Funciona com a janela principal escondida.
 */
export function CaptureWindow() {
  const [dir, setDir] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // A pasta e o tema podem ter mudado na janela principal: relê a cada abertura.
  const refresh = useCallback(() => {
    field.current?.focus();
    startup()
      .then((state) => {
        setError(null);
        setDir(state.vault?.path ?? null);
        if (state.vault) applyTheme(state.vault.config.theme);
        else setError("Abra o Notesea e escolha uma pasta de notas primeiro.");
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = onOpenCapture(refresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  // A caixa cresce com o texto (sem rolagem) até um limite da tela.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el || !box.current) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    const max = Math.round(window.screen.availHeight * 0.7);
    const height = Math.min(box.current.scrollHeight, max);
    el.style.overflowY = box.current.scrollHeight > max ? "auto" : "hidden";
    void getCurrentWindow().setSize(new LogicalSize(600, height));
  }, [text]);

  const hide = () => invoke("hide_capture");

  const save = async () => {
    if (saving || !dir || !text.trim()) return;
    setSaving(true);
    try {
      await captureIdea(dir, text);
      setText("");
      setError(null);
      await invoke("captured");
      await hide();
    } catch (e) {
      setError(`Não foi possível salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void hide();
    } else if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div
      ref={box}
      className="flex max-h-screen w-screen flex-col gap-2 overflow-hidden bg-surface p-5"
    >
      <textarea
        ref={field}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Nova nota"
        className="min-h-0 w-full resize-none bg-transparent text-title text-ink outline-none placeholder:text-muted"
      />
      <div
        data-tauri-drag-region
        className="flex items-center justify-between gap-4 text-sm text-muted select-none"
      >
        <span aria-live="polite" className="truncate">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            "A primeira linha vira o título"
          )}
        </span>
        <span className="shrink-0">
          Enter salva · Shift+Enter quebra linha · Esc fecha
        </span>
      </div>
    </div>
  );
}
