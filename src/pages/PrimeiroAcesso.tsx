import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { TitleBar } from "../components/TitleBar";
import { Button } from "@/components/ui/button";
import { openVault, type Vault } from "../lib/vault";
import logoSymbol from "../assets/logo-symbol.svg";
import folderIcon from "../assets/icons/folder.svg";
import arrowIcon from "../assets/icons/arrow-right.svg";

const layers = [
  {
    name: "Superfície",
    description: "Capture sem organizar.",
    background: "bg-surface",
  },
  {
    name: "Meia-água",
    description: "Dê contexto e crie ligações.",
    background: "bg-layer-midwater",
  },
  {
    name: "Fundo",
    description: "Consolide o que aprendeu.",
    background: "bg-layer-deep",
  },
];

type Props = {
  initialPath: string | null;
  initialError: string | null;
  onOpen: (vault: Vault) => void;
};

function folderLabel(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return {
    name: parts[parts.length - 1] ?? path,
    location: parts.slice(-2).join(" / "),
  };
}

export function PrimeiroAcesso({ initialPath, initialError, onOpen }: Props) {
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState(initialError);
  const [opening, setOpening] = useState(false);

  async function chooseFolder() {
    const selected = await open({
      directory: true,
      defaultPath: path ?? undefined,
      title: "Escolha a pasta das notas",
    });
    if (typeof selected === "string") {
      setPath(selected);
      setError(null);
    }
  }

  async function confirm() {
    if (!path) return;
    setOpening(true);
    try {
      onOpen(await openVault(path));
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  }

  const label = path ? folderLabel(path) : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <TitleBar />
      <aside className="flex w-[480px] shrink-0 flex-col gap-6 bg-highlight px-[52px] pt-12 pb-10">
        <div className="flex items-center gap-[7px]">
          <img src={logoSymbol} alt="" width={28} height={40} />
          <span className="font-display text-logo text-ink">notesea</span>
        </div>
        <p className="text-xs font-semibold text-brand">
          SEU ESPAÇO DE CONHECIMENTO
        </p>
        <h1 className="font-display text-[38px] leading-[1.5] font-semibold">
          Ideias e estudo que ganham profundidade.
        </h1>
        <p className="text-[16px] text-muted">
          Escreva primeiro.
          <br />
          Organize depois, no seu ritmo.
        </p>
        <div className="flex flex-col overflow-hidden rounded-panel">
          {layers.map((layer) => (
            <div
              key={layer.name}
              className={`flex flex-col gap-1 px-5 py-5 ${layer.background}`}
            >
              <p className="text-md font-semibold">{layer.name}</p>
              <p className="text-sm text-muted">{layer.description}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-brand">Código aberto. Conhecimento seu.</p>
      </aside>

      <main className="flex flex-1 flex-col gap-6 overflow-y-auto px-20 pt-26">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-brand">
            BEM-VINDO AO NOTESEA
          </p>
          <h2 className="max-w-[260px] font-display text-heading font-semibold">
            Onde suas ideias vão morar?
          </h2>
          <p className="max-w-[620px] text-md text-muted">
            Escolha uma pasta neste computador. Suas notas serão arquivos
            Markdown que você pode abrir em qualquer editor.
          </p>
        </div>

        <div className="flex max-w-[640px] flex-col gap-4 rounded-panel border border-line bg-surface p-5">
          <div className="flex items-start gap-3 border-b border-line pb-4">
            <img src={folderIcon} alt="" width={22} height={22} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-md font-semibold">
                {label?.name ?? "Nenhuma pasta escolhida"}
              </p>
              {path && (
                <p className="truncate text-xs text-muted" title={path}>
                  {label?.location}
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-muted">
            Pode ser uma pasta vazia ou uma que já tenha notas Markdown.
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={chooseFolder}
          >
            <img src={folderIcon} alt="" width={18} height={18} />
            Escolher outra pasta
          </Button>
        </div>

        {error && (
          <p
            role="alert"
            className="max-w-[640px] rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error} Escolha a pasta novamente ou selecione outra.
          </p>
        )}

        <Button
          className="self-start"
          disabled={!path || opening}
          onClick={confirm}
        >
          <img src={arrowIcon} alt="" width={18} height={18} />
          Abrir pasta
        </Button>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-success">
            ✓ Sem cadastro. Sem nuvem obrigatória.
          </p>
          <p className="text-xs text-muted">
            Não é preciso criar categorias, pastas ou tags para começar. Basta
            ter uma ideia.
          </p>
        </div>
      </main>
    </div>
  );
}
