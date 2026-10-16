import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import {
  listNotes,
  readNote,
  saveNote,
  type NoteSummary,
} from "../lib/aquarium";

type Props = {
  onBack: () => void;
  onOpenNote: (path: string) => void;
};

/** Perguntas que levam a ideia, passo a passo, a ganhar profundidade. */
const PROMPTS = [
  "O que te fez pensar nisso?",
  "Por que isso importa pra você?",
  "Como você explicaria essa ideia pra alguém?",
  "Qual seria o próximo passo?",
];

type Step = "ideia" | "desenvolver" | "organizar";

/**
 * Passa pelas ideias da superfície, uma de cada vez. Nenhuma ação é
 * obrigatória nem muda a camada: escrever e organizar só geram sinais.
 */
export function DesenvolverIdeias({ onBack, onOpenNote }: Props) {
  const [queue, setQueue] = useState<NoteSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("ideia");
  const [prompt, setPrompt] = useState(0);
  const [answer, setAnswer] = useState("");
  const [corrente, setCorrente] = useState("");
  const [cardume, setCardume] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listNotes().then(
      (notes) => {
        const surface = notes.filter((n) => n.depth === "superficie");
        setQueue(surface);
        setTotal(surface.length);
      },
      (e: unknown) => setError(String(e)),
    );
  }, []);

  const current = queue?.[0];

  const reset = (next: NoteSummary | undefined) => {
    setStep("ideia");
    setPrompt(0);
    setAnswer("");
    setCorrente(next?.corrente ?? "");
    setCardume(next?.cardume ?? "");
    setError(null);
  };

  /** Avança para a próxima ideia; `later` devolve a atual ao fim da fila. */
  const advance = (later = false) => {
    if (!queue) return;
    const [head, ...rest] = queue;
    const next = later && rest.length > 0 ? [...rest, head] : rest;
    setQueue(next);
    reset(next[0]);
  };

  const save = async (change: {
    append?: string;
    corrente?: string;
    cardume?: string;
  }) => {
    if (!current) return false;
    setSaving(true);
    try {
      const note = await readNote(current.path);
      const body = change.append
        ? `${note.body.trimEnd()}\n\n${change.append.trim()}\n`
        : note.body;
      const saved = await saveNote(
        current.path,
        body,
        note.body,
        change.corrente ?? note.corrente,
        change.cardume ?? note.cardume,
      );
      setQueue((q) =>
        q
          ? [
              { ...q[0], corrente: saved.corrente, cardume: saved.cardume },
              ...q.slice(1),
            ]
          : q,
      );
      return true;
    } catch (e: unknown) {
      setError(`Não foi possível salvar: ${String(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const continueWriting = async () => {
    if (answer.trim() && !(await save({ append: answer }))) return;
    setAnswer("");
    if (prompt + 1 < PROMPTS.length) setPrompt(prompt + 1);
    else setStep("organizar");
  };

  const organize = async () => {
    if (await save({ corrente, cardume })) advance();
  };

  const done = total - (queue?.length ?? 0);

  return (
    <div className="flex max-w-2xl flex-col items-start gap-6">
      <Button variant="secondary" onClick={onBack}>
        ← Meu aquário
      </Button>
      <div className="flex flex-col gap-[5px]">
        <h1 className="font-display text-heading font-semibold">
          Desenvolver ideias
        </h1>
        <p className="text-md text-muted">
          Uma ideia de cada vez. Escreva um pouco mais e ela ganha profundidade
          com o tempo.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-md text-ink">
          {error}
        </p>
      )}

      {queue === null ? (
        !error && <p className="text-md text-muted">Carregando ideias…</p>
      ) : !current ? (
        <div className="flex w-full flex-col items-start gap-3 rounded-panel border border-line bg-layer-surface p-8">
          <h2 className="font-display text-title font-semibold text-ink">
            {total > 0
              ? "Você passou por todas as ideias"
              : "Nada na superfície"}
          </h2>
          <p className="text-md text-muted">
            {total > 0
              ? "Volte quando quiser: as ideias continuam na água."
              : "Capture uma ideia e ela aparece aqui para ser desenvolvida."}
          </p>
          <Button onClick={onBack}>Voltar ao aquário</Button>
        </div>
      ) : (
        <section
          aria-label="Ideia atual"
          className="flex w-full flex-col gap-5 rounded-panel border border-line bg-layer-surface p-8"
        >
          <p className="text-xs text-muted">
            {Math.min(done + 1, total)} de {total}
          </p>
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
            <h2 className="text-md font-semibold text-ink">{current.title}</h2>
            {current.excerpt && (
              <p className="line-clamp-4 text-base text-muted">
                {current.excerpt}
              </p>
            )}
          </div>

          {step === "ideia" && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setStep("desenvolver")}>
                Desenvolver ideia
              </Button>
              <Button variant="secondary" onClick={() => setStep("organizar")}>
                Organizar
              </Button>
              <Button variant="secondary" onClick={() => advance(true)}>
                Deixar pra depois
              </Button>
              <Button variant="secondary" onClick={() => advance()}>
                Pular
              </Button>
            </div>
          )}

          {step === "desenvolver" && (
            <div className="flex flex-col gap-3">
              <label
                htmlFor="resposta"
                className="font-display text-title font-semibold text-ink"
              >
                {PROMPTS[prompt]}
              </label>
              <textarea
                id="resposta"
                autoFocus
                rows={5}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Escreva livremente; o texto entra na nota."
                className="rounded-control border border-line bg-surface p-3 text-md text-ink"
              />
              <div className="flex flex-wrap gap-3">
                <Button disabled={saving} onClick={continueWriting}>
                  {prompt + 1 < PROMPTS.length ? "Continuar" : "Concluir"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onOpenNote(current.path)}
                >
                  Abrir a nota
                </Button>
                <Button variant="secondary" onClick={() => advance()}>
                  Próxima ideia
                </Button>
              </div>
            </div>
          )}

          {step === "organizar" && (
            <div className="flex flex-col gap-3">
              <p className="font-display text-title font-semibold text-ink">
                Essa ideia faz parte de algo maior?
              </p>
              <label className="flex flex-col gap-1 text-base text-muted">
                Corrente (um assunto, como Inglês ou System Design)
                <input
                  value={corrente}
                  onChange={(e) => setCorrente(e.target.value)}
                  className="rounded-control border border-line bg-surface px-3 py-2.5 text-md text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-base text-muted">
                Cardume (ideias que andam juntas)
                <input
                  value={cardume}
                  onChange={(e) => setCardume(e.target.value)}
                  className="rounded-control border border-line bg-surface px-3 py-2.5 text-md text-ink"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button disabled={saving} onClick={organize}>
                  Salvar e seguir
                </Button>
                <Button variant="secondary" onClick={() => advance()}>
                  Próxima ideia
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
