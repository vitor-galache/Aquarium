import { Button } from "../components/Button";
import { LayerChip } from "../components/LayerChip";
import { NoteCard } from "../components/NoteCard";
import { PageHeader } from "../layout/PageHeader";
import plusIcon from "../assets/icons/plus.svg";

// Dados de exemplo até a leitura da pasta local existir.
const layers = [
  {
    name: "Superfície",
    description: "Ideias que acabaram de chegar",
    summary: "3 ideias · fazer triagem →",
    background: "bg-layer-surface",
    notes: [
      {
        title: "Cache é fácil. Difícil é invalidar.",
        excerpt: "Rever estratégias de TTL e eventos.",
        meta: "Sem corrente · agora",
        highlighted: true,
      },
      {
        title: "Escopo da proposta da Ana",
        excerpt: "Separar manutenção de entregas.",
        meta: "Freelas · hoje, 09:20",
      },
      {
        title: "Ouvir sem traduzir",
        excerpt: "10 minutos de escuta por dia.",
        meta: "Inglês · hoje, 08:10",
      },
    ],
  },
  {
    name: "Meia-água",
    description: "Contexto e ligações em desenvolvimento",
    summary: "9 notas",
    background: "bg-layer-midwater",
    notes: [
      {
        title: "Consistência eventual",
        excerpt: "Nem toda leitura precisa ser atual.",
        meta: "System Design › Sistemas distribuídos",
      },
      {
        title: "Proposta de valor",
        excerpt: "O problema antes da solução.",
        meta: "Freelas › Propostas e escopo",
      },
    ],
  },
  {
    name: "Fundo",
    description: "Explicações revisadas e dominadas",
    summary: "8 notas",
    background: "bg-layer-deep",
    notes: [
      {
        title: "Quando usar uma fila",
        excerpt: "Desacoplar produtores e consumidores.",
        meta: "System Design › Mensageria",
      },
      {
        title: "Presente perfeito: uso e contexto",
        excerpt: "Experiências que se conectam ao presente.",
        meta: "Inglês › Gramática em contexto",
      },
    ],
  },
  {
    name: "Lodo",
    description: "Sem interação há tempo. Nada foi apagado.",
    summary: "6 notas · reencontrar →",
    background: "bg-layer-silt",
    notes: [
      {
        title: "Cache no navegador",
        excerpt: "ETag e a resposta 304. Retomar o exemplo.",
        meta: "System Design › Cache e desempenho · há 64 dias",
      },
      {
        title: "Contrato de manutenção",
        excerpt: "Rascunho de limites e disponibilidade.",
        meta: "Freelas › Contratos · há 48 dias",
      },
    ],
  },
];

export function MeuAquario() {
  return (
    <>
      <PageHeader
        eyebrow="CAPTURE AGORA. ORGANIZE QUANDO QUISER."
        title="Meu aquário"
        description="Profundidade é maturidade. Correntes são assuntos, em qualquer camada."
        action={
          <Button icon={<img src={plusIcon} alt="" width={18} height={18} />}>
            Capturar ideia
          </Button>
        }
      />
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2">
          <LayerChip>Todas as correntes</LayerChip>
          <p className="text-sm text-muted">
            {"System Design\u3000·\u3000Freelas\u3000·\u3000Inglês"}
          </p>
        </div>
        <p className="text-sm text-brand">≈ Maré de hoje · 3 notas →</p>
      </div>
      <div className="flex flex-col overflow-hidden rounded-panel border border-line">
        {layers.map((layer) => (
          <section
            key={layer.name}
            className={`flex items-start gap-5 px-[22px] py-[17px] ${layer.background}`}
          >
            <div className="flex w-layer-legend shrink-0 flex-col gap-[5px]">
              <h2 className="font-display text-layer font-semibold">
                {layer.name}
              </h2>
              <p className="text-xs text-muted">{layer.description}</p>
              <p className="text-2xs text-brand">{layer.summary}</p>
            </div>
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {layer.notes.map((note) => (
                <NoteCard key={note.title} {...note} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
