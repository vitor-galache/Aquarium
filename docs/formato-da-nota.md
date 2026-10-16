# Formato da nota

Cada nota é um arquivo Markdown comum (`.md`) dentro da pasta de notas, com um frontmatter YAML mínimo no topo. O arquivo abre normalmente em qualquer editor.

```markdown
---
id: m2x9k1a3b7cq
created: 2026-10-16T14:32:05Z
depth: superficie
corrente: System Design
cardume: Filas
---
# Título da nota

Texto livre em Markdown.
```

## Campos

| Chave | Obrigatória | Valor |
| --- | --- | --- |
| `id` | sim | Identificador estável gerado pelo app (base 36). Não muda ao renomear o arquivo. |
| `created` | sim | Data/hora de criação em UTC, formato `AAAA-MM-DDTHH:MM:SSZ`. |
| `depth` | sim | `superficie`, `meia-agua`, `fundo` ou `lodo`. Notas novas entram em `superficie`. |
| `corrente` | não | Nome da corrente (assunto maior). Omitida quando vazia. |
| `cardume` | não | Nome do cardume. Omitida quando vazia. |

Valores com caracteres especiais do YAML (`: `, ` #`, aspas no início etc.) são gravados entre aspas duplas.

## Título e nome do arquivo

- O título é o primeiro cabeçalho `# ` do corpo; sem ele, o nome do arquivo.
- Notas criadas pelo app recebem o nome derivado do título (slug): minúsculas, sem acentos, palavras separadas por `-`, até 80 caracteres (`Ação: Cache & Filas!` → `acao-cache-filas.md`). Título vazio vira `sem-titulo.md`.
- Em caso de colisão (sem diferenciar maiúsculas), acrescenta-se `-2`, `-3`… (`cache-2.md`).

## Compatibilidade

- **Notas criadas fora do app** (sem frontmatter, ou com frontmatter de outra ferramenta) são aceitas. Ao abri-las, o app só acrescenta as chaves obrigatórias que faltarem; o corpo e as demais linhas do frontmatter ficam intactos.
- **Chaves desconhecidas, comentários e ordem** do frontmatter são preservados byte a byte. O app só reescreve a linha de uma chave quando o valor dela muda.
- Final de linha (`LF`/`CRLF`) e BOM do arquivo são mantidos. Um arquivo que já está completo sobrevive a abrir e salvar sem nenhum diff.
- Um `---` sem fechamento não é tratado como frontmatter: o arquivo inteiro é corpo.

## Escrita atômica

Toda gravação escreve primeiro um arquivo temporário oculto na mesma pasta (`.nome.md.<pid>.tmp`), faz `fsync` e depois renomeia por cima do original. Uma queda no meio da gravação nunca deixa a nota truncada.
