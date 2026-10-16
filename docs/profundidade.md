# Profundidade implícita

A camada de uma nota (`depth` no frontmatter) **nunca é escolhida pelo usuário**: o app a calcula a partir do uso. As regras ficam em `src-tauri/src/depth.rs` e os limiares na constante `THRESHOLDS`, num só lugar.

## Sinais

Registrados no índice local (`.aquarium/index.db`, tabela `signals`), por `id` da nota:

| Sinal | Quando |
| --- | --- |
| `open` | A nota é aberta no app. |
| `edit` | O corpo é salvo com mudança. Conta por dia distinto. |
| `resurface` | A nota sai do lodo (ao abrir ou por "Trazer à superfície"). |

Também entram no cálculo o tamanho do texto (caracteres do corpo), a corrente atribuída e a data de criação.

## Regras

| Camada | Regra (limiar padrão) |
| --- | --- |
| Superfície | Ponto de partida. |
| Meia-água | Desenvolvida: ≥ 280 caracteres e editada em ≥ 2 dias diferentes. Ter corrente conta como um dia de edição. |
| Fundo | Desenvolvida, revisitada (aberta ou editada) em ≥ 3 dias diferentes e estável: sem edição há ≥ 7 dias. |
| Lodo | Sem nenhuma interação há ≥ 45 dias. |

- Fora do lodo a nota não volta a subir sozinha (a camada é a mais funda entre a atual e a calculada), para não oscilar a cada edição.
- Sair do lodo sempre leva à superfície: abrir a nota ou "Trazer à superfície" registra `resurface`, e os sinais anteriores deixam de contar.
- A camada é recalculada ao abrir e salvar a nota, e para todas as notas após cada sincronização do índice (é assim que notas esquecidas afundam no lodo).
- `depth` só é reescrito no arquivo quando muda.
