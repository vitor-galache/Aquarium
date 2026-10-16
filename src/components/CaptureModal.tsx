import { useRef, useState, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { captureIdea } from "../lib/vault";

type Props = {
  dir: string;
  onClose: () => void;
};

/** Campo único: Enter salva e mantém aberto, Shift+Enter quebra linha, Esc fecha. */
export function CaptureModal({ dir, onClose }: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    try {
      const note = await captureIdea(dir, text);
      setSaved(note.title);
      setError(null);
      setText("");
    } catch (e) {
      setError(`Não foi possível salvar: ${String(e)}`);
    } finally {
      setSaving(false);
      field.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc fica com o Dialog.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          field.current?.focus();
        }}
        className="top-[18vh] w-[560px] max-w-[calc(100vw-32px)] translate-y-0 rounded-panel border-line bg-surface shadow-xl sm:max-w-[560px] flex flex-col gap-2 p-5"
      >
        <DialogTitle className="sr-only">Nova nota</DialogTitle>
        <DialogDescription className="sr-only">Nova nota</DialogDescription>
        <textarea
          ref={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Nova nota"
          className="w-full resize-none bg-transparent text-title text-ink outline-none placeholder:text-muted"
        />
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
          <span aria-live="polite" className="truncate">
            {error ? (
              <span className="text-red-700">{error}</span>
            ) : saved ? (
              <span className="text-success">✓ “{saved}” salva</span>
            ) : (
              "A primeira linha vira o título"
            )}
          </span>
          <span className="shrink-0">
            Enter salva · Shift+Enter quebra linha · Esc fecha
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
