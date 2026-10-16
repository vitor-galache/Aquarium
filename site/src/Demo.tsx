import { useState } from "react";
import { FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

type Nota = { pasta: string; titulo: string; texto: string };

const NOTAS: Nota[] = [
  {
    pasta: "Inglês",
    titulo: "Phrasal verbs",
    texto:
      "# Phrasal verbs\n\n- **look up**: procurar no dicionário\n- **figure out**: entender\n- [ ] revisar na sexta",
  },
  {
    pasta: "Ideias",
    titulo: "App de receitas",
    texto:
      "# App de receitas\n\nLista de compras gerada a partir das receitas da semana.",
  },
  {
    pasta: "Ideias",
    titulo: "Nova nota",
    texto:
      "# Nova nota\n\nEscreva aqui. Tente **negrito** ou uma lista com `- `.",
  },
];

/** Renderiza o mínimo de Markdown para a demonstração. */
function linha(texto: string, i: number) {
  const inline = texto
    .replace(/^- /, "")
    .split(/(\*\*[^*]+\*\*)/)
    .map((p, j) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={j}>{p.slice(2, -2)}</strong>
      ) : (
        p
      ),
    );
  if (texto.startsWith("# "))
    return (
      <h3 key={i} className="mb-2 font-display text-xl font-semibold">
        {texto.slice(2)}
      </h3>
    );
  if (texto.startsWith("- [ ] "))
    return (
      <p key={i} className="flex items-center gap-2">
        <span className="size-3.5 rounded-xs border border-brand" />
        {texto.slice(6)}
      </p>
    );
  if (texto.startsWith("- "))
    return (
      <p
        key={i}
        className="pl-3 before:mr-2 before:text-brand before:content-['•']"
      >
        {inline}
      </p>
    );
  return <p key={i}>{texto ? inline : " "}</p>;
}

/** Janela do app com notas clicáveis e editor de verdade. */
export function Demo() {
  const [notas, setNotas] = useState(NOTAS);
  const [atual, setAtual] = useState(0);
  const nota = notas[atual];
  const pastas = [...new Set(notas.map((n) => n.pasta))];

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border bg-card text-left shadow-2xl shadow-brand/15">
      <div className="flex items-center gap-1.5 border-b px-3 py-2.5">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="ml-3 text-sm text-muted">
          ~/notas/{nota.pasta}/{nota.titulo}.md
        </span>
      </div>
      <div className="grid min-h-80 sm:grid-cols-[200px_1fr]">
        <aside className="hidden border-r bg-layer-surface p-3 text-md sm:block">
          {pastas.map((p) => (
            <div key={p} className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-muted">
                <Folder className="size-3.5" /> {p}
              </div>
              {notas.map((n, i) =>
                n.pasta === p ? (
                  <button
                    key={i}
                    onClick={() => setAtual(i)}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-6 text-left",
                      i === atual
                        ? "bg-card text-ink shadow-xs"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    <FileText className="size-3.5" /> {n.titulo}
                  </button>
                ) : null,
              )}
            </div>
          ))}
        </aside>
        <div className="grid md:grid-cols-2">
          <textarea
            aria-label="Editor da nota"
            value={nota.texto}
            onChange={(e) =>
              setNotas(
                notas.map((n, i) =>
                  i === atual ? { ...n, texto: e.target.value } : n,
                ),
              )
            }
            spellCheck={false}
            className="min-h-48 resize-none border-b bg-transparent p-5 font-mono text-sm leading-relaxed text-ink outline-none md:border-r md:border-b-0"
          />
          <div className="space-y-1 p-5 text-md">
            {nota.texto.split("\n").map(linha)}
          </div>
        </div>
      </div>
    </div>
  );
}
