# Notesea — ideias e estudo que ganham profundidade

Oct 15, 2026 · @Vitor

## Novo nome: Notesea (16 out 2026)

O projeto se chamava **Aquarium** e passou a se chamar **Notesea**, para refletir o foco em anotações. Junto veio uma logo nova: uma folha de nota com o canto dobrado e o mar subindo em camadas (direção "Página-mar"), com a mesma paleta e a tipografia Sora Light. O restante da temática de mar continua. O identificador do app virou `com.vitorgalache.notesea` e a pasta de metadados virou `.notesea/`; o app migra sozinho a pasta `.aquarium/` e a última pasta aberta da versão anterior.

## Mudança de direção (16 out 2026)

Usando o app até a tarefa 10, os conceitos de **cardume**, **desenvolver ideia** (triagem) e camadas de profundidade deixaram a experiência confusa e pouco intuitiva. A partir de agora:

- **Foco:** o Notesea é, antes de tudo, um **app de anotações**. A prioridade é deixar a criação e a edição de notas boas: captura rápida, editor Markdown agradável, busca e organização simples.
- **Tema só na aparência:** a temática de aquário continua (paleta, tipografia, animações, nomes leves), mas não pode atrapalhar nem impor fluxos ao uso. Nada de passos obrigatórios ou conceitos que o usuário precise aprender.
- **Pausados:** cardumes, correntes, fluxo guiado de "desenvolver ideia", profundidade como estado da nota e maré de estudo saem do roadmap por enquanto. O código existente pode ser simplificado ou escondido da UI; podem voltar depois, se fizerem sentido, como recursos opcionais.
- **Mantidos:** dados em arquivos Markdown locais, captura sem atrito, leve e calmo.

As seções abaixo descrevem a visão original e valem como histórico onde conflitarem com esta.

## Ideias futuras

Fora do escopo da primeira versão; registradas para não se perderem.

- **Exportar para PDF:** uma nota ou uma pasta inteira, mantendo a formatação do Markdown.
- **Dashboards:** visões geradas a partir das notas (ex.: progresso de estudo, contagens por pasta/tag, atividade ao longo do tempo).
- **Mapas mentais:** gerar um mapa a partir de uma nota (títulos e listas) ou das ligações `[[nota]]` entre notas.
- **Ícone flutuante:** atalho visual na tela para a captura rápida, além do ícone no menu do sistema (#57).

Primeiro caso de uso real: o próprio autor usando o app nos estudos de inglês.

## Visão e problema

Um app open source para capturar ideias, organizar anotações de estudo e, no futuro, desenhar diagramas como os de system design. A experiência é personalizada e usa a metáfora de um aquário: ideias entram pela superfície e ganham profundidade conforme amadurecem.

**Problema:** ferramentas como o Notion exigem decidir a estrutura antes de ter conteúdo. Página em branco, banco de dados, propriedades e pastas fazem a ideia morrer no caminho, e o estudo nunca vira hábito.

**Proposta:** primeiro você joga na água; a organização vem depois e quase sozinha. Capturar leva dois segundos, organizar é opcional e revisar acontece no ritmo certo.

**Princípios**

- Captura sem atrito: nada de título, pasta ou tag obrigatórios.
- Estrutura emerge do uso, não é imposta no começo.
- Seus dados são seus: notas em arquivos Markdown numa pasta local.
- O aquário é informação, não enfeite: a posição de cada ideia diz algo sobre ela.
- Leve e calmo, com sensação de profundidade.

## Metáfora: profundidade como maturidade

| Camada | O que fica ali | Como chega |
| --- | --- | --- |
| Superfície | Ideias soltas, links, frases de aula | Captura rápida |
| Meia-água | Notas desenvolvidas, com contexto e ligações | Você revisita e escreve mais |
| Fundo | Conhecimento consolidado: resumos, decisões, explicações | Nota revisada e dominada |
| Lodo | Ideias esquecidas há muito tempo | Sem interação; nada some, e às vezes uma volta à superfície |

**Outros conceitos**

- **Cardume:** notas relacionadas que nadam juntas, criadas por ligações `[[nota]]` ou sugeridas pelo app.
- **Corrente:** um assunto maior que agrupa cardumes, como System Design, Freelas ou Inglês.
- **Maré:** o ciclo de revisão espaçada que traz notas de estudo de volta à superfície no dia certo.

## Telas iniciais

1. **Captura:** um campo único aberto por atalho global. Digitou, apertou Enter, caiu na água.
2. **Aquário:** visão geral com as ideias distribuídas por profundidade e agrupadas em cardumes e correntes. É onde a experiência visual acontece.
3. **Nota:** editor Markdown limpo, com ligações para outras notas e indicador de profundidade.
4. **Maré de estudo:** fila de revisão do dia; você relê a nota e marca se lembrou bem, e o app ajusta a próxima revisão.

## Fluxos principais

- **Capturar:** atalho → digita → a ideia aparece na superfície.
- **Triagem:** no fim do dia ou da semana, você passa pela superfície e decide para cada ideia: desenvolver (desce para meia-água), juntar com outra (vira cardume) ou deixar afundar.
- **Estudar:** marca uma nota como estudo → ela entra na maré → reaparece para revisão → com revisões boas, desce até o fundo.
- **Reencontrar:** busca rápida por qualquer texto, ou navegação pelas correntes no aquário.

## Personalização

- Correntes e cardumes definidos por você, com sugestões automáticas a partir do conteúdo.
- Ritmo de revisão ajustável por assunto.
- Temas visuais do aquário, todos dentro da direção leve, calma e profunda.
- Mais adiante, IA opcional (local ou com sua própria chave) sugerindo ligações e resumos.

Estilo visual: ainda a definir. A direção é algo leve e calmo, que passe a sensação de profundidade, sem precisar ser realista.

## Escala do projeto em níveis

Cada nível entrega algo usável sozinho.

1. **Nível 1 — Captura e aquário.** Atalho de captura, notas em Markdown numa pasta local, aquário com camadas de profundidade, busca.
2. **Nível 2 — Maré de estudo.** Revisão espaçada para notas marcadas como estudo.
3. **Nível 3 — Ligações.** Links entre notas, cardumes e correntes, com o grafo de ligações visto como correntes no aquário.
4. **Nível 4 — Fundo do mar como canvas.** Quadro infinito para desenhos de system design, com caixas, setas e notas presas a elas.
5. **Nível 5 — Ecossistema.** Sync opcional, app mobile para captura, plugins e IA opcional.

## Open source e referências

O modelo é o de ferramentas como Obsidian e Logseq: as notas são arquivos Markdown numa pasta do usuário. Ninguém fica preso ao app, dá para versionar no git e editar em qualquer editor. Licença sugerida: MIT, para facilitar contribuições.

| Referência | O que observar |
| --- | --- |
| Obsidian | Notas como arquivos locais, links entre notas, ecossistema de plugins |
| Logseq | Captura em fluxo diário, open source |
| Anki | Revisão espaçada aplicada ao estudo |
| Excalidraw | Canvas de diagramas open source (MIT), base possível para o nível 4 |

## Stack inicial

Sem terminais embutidos, o app fica mais leve, e o Tauri passa a ser uma opção forte.

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Shell desktop | Tauri (ou Electron) | Tauri gera app pequeno e leve; Electron é o caminho mais conhecido |
| UI | React + TypeScript + Tailwind | Ecossistema amplo de componentes |
| Editor | CodeMirror 6 ou TipTap | Markdown com boa experiência de escrita |
| Aquário | Canvas 2D ou PixiJS | Animações leves fora da árvore React |
| Armazenamento | Arquivos Markdown + índice SQLite | Dados abertos; índice para busca e metadados de profundidade |
| Revisão espaçada | Algoritmo FSRS | Estado da arte em agendamento de revisões |
| Canvas (nível 4) | Excalidraw | Open source e maduro |

**Riscos**

- O aquário virar enfeite: ele precisa ajudar a decidir o que revisar, não só ser bonito.
- Metadados de profundidade fora dos arquivos podem se perder; guardar no frontmatter do Markdown quando possível.
- Escopo: resistir a virar um Notion; o nível 1 já precisa ser bom sozinho.

## Ideia anterior descartada

A primeira versão do projeto (ainda como Aquarium) era uma IDE de orquestração de agentes inspirada no [Orca](https://github.com/stablyai/orca) e no [Alethe](https://github.com/Kc1t/alethe-agents). Foi descartada por ser complexa demais para começar, difícil de visualizar e, no fim, uma cópia mais simples do que já existe. A metáfora do aquário foi mantida.

## Próximos passos: design e fluxos

> Lista original, anterior à mudança de direção. Novo foco: criação e edição de notas.

- [ ] Fluxo de captura rápida
- [ ] Layout da tela do aquário e das camadas de profundidade
- [ ] Tela de nota e indicador de profundidade
- [ ] Fluxo de triagem da superfície
- [ ] Fluxo da maré de estudo
- [ ] Direção visual: paleta, tipografia e animações
