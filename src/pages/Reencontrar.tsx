import { useState } from "react";
import { Button } from "../components/Button";
import { LayerChip } from "../components/LayerChip";
import { PageHeader } from "../layout/PageHeader";
import searchIcon from "../assets/icons/search-large.svg";

// Dados de exemplo até a busca na pasta local existir.
const results = [
  {
    title: "Cache e invalidação",
    layer: "Meia-água",
    excerpt:
      "O cache guarda uma cópia para reduzir latência. TTL e eventos aceitam riscos diferentes de defasagem.",
    path: "System Design › Cache e desempenho",
    file: "cache-e-invalidacao.md",
  },
  {
    title: "Quando usar uma fila",
    layer: "Fundo",
    excerpt:
      "Uma fila pode propagar eventos de invalidação de cache. Tratar repetição e ordem de entrega é essencial.",
    path: "System Design › Mensageria",
    file: "quando-usar-uma-fila.md",
  },
  {
    title: "Cache no navegador",
    layer: "Lodo · recuperável",
    excerpt:
      "ETag identifica uma versão do recurso. Se nada mudou, 304 evita baixar de novo. Retomar o exemplo de cache HTTP.",
    path: "System Design › Cache e desempenho · sem interação há 64 dias",
    file: "cache-no-navegador.md",
    silt: true,
  },
];

const shoals = [
  "Cache e desempenho · 4 →",
  "Sistemas distribuídos · 5 →",
  "Mensageria · 3 →",
];

export function Reencontrar() {
  const [query, setQuery] = useState("cache");

  return (
    <>
      <PageHeader
        eyebrow="BUSCA EM TODOS OS ARQUIVOS LOCAIS"
        title="Uma ideia nunca desaparece"
        description="Busque por qualquer trecho, mesmo no que ficou esquecido."
      />

      <label className="flex items-center gap-3 rounded-card border-[1.5px] border-brand-light bg-surface p-[15px]">
        <img src={searchIcon} alt="" width={22} height={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar nas notas"
          className="min-w-0 flex-1 bg-transparent text-[19px] leading-[1.5] outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="cursor-pointer text-xs text-muted"
          >
            Limpar ×
          </button>
        )}
      </label>

      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm text-muted">
            3 resultados · todas as camadas, incluindo o Lodo
          </p>
          {results.map((result) => (
            <article
              key={result.file}
              className={`flex flex-col gap-2.5 rounded-card border border-line p-5 ${result.silt ? "bg-layer-silt" : "bg-surface"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-title leading-[1.5] font-semibold">
                  {result.title}
                </h3>
                <LayerChip>{result.layer}</LayerChip>
              </div>
              <p className="text-base text-muted">{result.excerpt}</p>
              <p className="text-xs text-brand">{result.path}</p>
              <div className="flex items-start justify-between">
                <p className="text-2xs text-muted">◇ Local · {result.file}</p>
                {result.silt && (
                  <p className="text-xs font-semibold text-brand">
                    Trazer à Superfície ↑
                  </p>
                )}
              </div>
            </article>
          ))}
          <p className="text-xs text-muted">
            Fim dos resultados. A busca considera título e conteúdo dos seus
            arquivos.
          </p>
        </div>

        <aside className="flex w-[266px] shrink-0 flex-col gap-[18px]">
          <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
            <p className="text-xs font-semibold text-muted">
              PREFERE EXPLORAR?
            </p>
            <h2 className="font-display text-panel leading-[1.5] font-semibold">
              System Design
            </h2>
            <p className="text-sm text-muted">
              12 notas em diferentes profundidades. Navegue pelos cardumes desta
              corrente.
            </p>
            <hr className="border-line" />
            {shoals.map((shoal) => (
              <p key={shoal} className="text-sm text-brand">
                {shoal}
              </p>
            ))}
            <Button variant="secondary" className="self-start">
              Abrir corrente
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-card bg-layer-silt p-[18px]">
            <p className="text-base font-semibold">O Lodo também é seu</p>
            <p className="text-sm text-muted">
              Ideias sem interação não são apagadas. Traga uma nota à Superfície
              para voltar a cuidar dela.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
