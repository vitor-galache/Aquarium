import { useEffect, useState } from "react";
import { Download, FolderOpen, Moon, Sun, Waves, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Bolhas } from "./Bolhas";
import { Demo } from "./Demo";

const REPO = "https://github.com/vitor-galache/notesea";
const RELEASES = `${REPO}/releases/latest`;

function sistema() {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

function useTema() {
  const [escuro, setEscuro] = useState(() => {
    const t = document.documentElement.dataset.theme;
    return t
      ? t === "escuro"
      : matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    const tema = escuro ? "escuro" : "claro";
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem("notesea-site-tema", tema);
    } catch {
      // Sem armazenamento: o tema vale só para esta visita.
    }
  }, [escuro]);
  return [escuro, () => setEscuro(!escuro)] as const;
}

const ATALHOS: [string[], string][] = [
  [["Ctrl", "Shift", "Espaço"], "Captura rápida (global, configurável)"],
  [["⌘", "B"], "Negrito"],
  [["⌘", "I"], "Itálico"],
  [["⌘", "E"], "Código"],
  [["⌘", "1 / 2 / 3"], "Títulos"],
  [["⌘", "Shift", "8"], "Lista"],
  [["⌘", "Shift", "9"], "Lista de tarefas"],
];

const RECURSOS = [
  {
    icone: Zap,
    titulo: "Captura rápida",
    texto:
      "Um atalho global abre a captura de qualquer lugar. Escreveu, salvou.",
  },
  {
    icone: FolderOpen,
    titulo: "Markdown local",
    texto: "Cada nota é um arquivo .md numa pasta sua. Sem conta, sem nuvem.",
  },
  {
    icone: Waves,
    titulo: "Leve e calmo",
    texto:
      "Interface limpa com tema de aquário, feita para escrever sem distração.",
  },
];

export function App() {
  const [escuro, alternarTema] = useTema();
  const so = sistema();

  return (
    <div className="relative min-h-screen">
      <Bolhas />

      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <a href="#" className="flex items-center gap-2.5">
          <img src="logo.svg" alt="" className="h-9" />
          <span className="font-display text-2xl font-light tracking-tight">
            notesea
          </span>
        </a>
        <nav className="flex items-center gap-1 text-md">
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <a href="#docs">Docs</a>
          </Button>
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <a href="#novidades">Novidades</a>
          </Button>
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <a href={REPO}>GitHub</a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={alternarTema}
            aria-label={escuro ? "Usar modo claro" : "Usar modo escuro"}
          >
            {escuro ? <Sun /> : <Moon />}
          </Button>
        </nav>
      </header>

      <section className="px-4 pt-12 pb-20 text-center">
        <h1 className="mx-auto mb-4 max-w-2xl font-display text-4xl font-semibold tracking-tight sm:text-6xl">
          Suas ideias, num aquário calmo
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-lg text-muted">
          Um app de anotações leve. Capture em segundos e escreva em Markdown,
          com as notas salvas como arquivos no seu computador.
        </p>
        <Button
          size="lg"
          asChild
          className="h-12 rounded-full px-7 text-md shadow-lg shadow-brand/30"
        >
          <a href={RELEASES}>
            <Download /> {so ? `Baixar para ${so}` : "Baixar"}
          </a>
        </Button>
        <p className="mt-3 text-sm text-muted">
          macOS e Linux (Windows em breve) ·{" "}
          <a href={RELEASES} className="text-brand hover:underline">
            todas as versões
          </a>
        </p>

        <div className="mt-14">
          <Demo />
          <p className="mt-3 text-sm text-muted">
            Experimente: edite o texto à esquerda ou troque de nota na barra
            lateral.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-4 pb-20 sm:grid-cols-3">
        {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
          <div
            key={titulo}
            className="rounded-xl border bg-card/80 p-6 backdrop-blur"
          >
            <Icone className="mb-3 size-5 text-brand" />
            <h3 className="mb-1 font-display text-lg font-semibold">
              {titulo}
            </h3>
            <p className="text-md text-muted">{texto}</p>
          </div>
        ))}
      </section>

      <section id="docs" className="mx-auto max-w-3xl scroll-mt-8 px-4 pb-20">
        <div className="rounded-xl border bg-card/80 p-8 backdrop-blur">
          <h2 className="mb-6 font-display text-3xl font-semibold">Docs</h2>
          <h3 className="mb-1 font-semibold">O que é</h3>
          <p className="mb-5 text-md text-muted">
            Um app de anotações para desktop. Você abre uma pasta e cada nota
            vira um arquivo Markdown dentro dela.
          </p>
          <h3 className="mb-1 font-semibold">Onde ficam as notas</h3>
          <p className="mb-5 text-md text-muted">
            Na pasta que você escolher. Subpastas viram pastas na barra lateral,
            e o app guarda só algumas preferências em <code>.notesea/</code>.
            Para backup ou sincronização, use a ferramenta que preferir.
          </p>
          <h3 className="mb-2 font-semibold">Atalhos</h3>
          <p className="mb-2 text-sm text-muted">No Linux, ⌘ é Ctrl.</p>
          <div className="divide-y text-md">
            {ATALHOS.map(([teclas, acao]) => (
              <div
                key={acao}
                className="flex items-center justify-between py-2"
              >
                <span>{acao}</span>
                <KbdGroup>
                  {teclas.map((t) => (
                    <Kbd key={t}>{t}</Kbd>
                  ))}
                </KbdGroup>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="novidades"
        className="mx-auto max-w-3xl scroll-mt-8 px-4 pb-20"
      >
        <div className="rounded-xl border bg-card/80 p-8 backdrop-blur">
          <h2 className="mb-4 font-display text-3xl font-semibold">
            Novidades
          </h2>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-md text-muted">
            <li>
              Foco em criar e editar notas: captura rápida, editor Markdown e
              pastas.
            </li>
            <li>
              Abrir qualquer pasta como cofre de notas, com pastas recentes.
            </li>
            <li>Visual novo dos componentes e ícones.</li>
          </ul>
          <a
            href={`${REPO}/releases`}
            className="text-md text-brand hover:underline"
          >
            Notas de cada versão no GitHub →
          </a>
        </div>
      </section>

      <footer className="py-8 text-center text-sm text-muted">
        notesea · open source · suas notas ficam no seu computador
      </footer>
    </div>
  );
}
