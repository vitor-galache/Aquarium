# AGENTS.md

Instruções para agentes de código (Claude Code, Codex, Cursor, Copilot etc.) que trabalham no Notesea.
A visão do produto está em [`notesea.md`](notesea.md); o fluxo de contribuição em [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Stack

- App desktop **Tauri 2** (Rust em `src-tauri/`) + **React 19 + TypeScript + Vite** (em `src/`) + **Tailwind CSS 4**.
- Gerenciador de pacotes: **npm** (use `npm ci`; não troque por yarn/pnpm).
- Idioma do projeto: **português** (commits, PRs, issues, textos da UI e docs).

## Comandos

| Objetivo | Comando |
| --- | --- |
| Instalar deps | `npm ci` |
| Rodar o app | `npm run tauri dev` |
| Lint TS | `npm run lint` |
| Formatação TS/CSS/JSON | `npm run format` / `npm run format:check` |
| Typecheck + build web | `npm run build` |
| Lint Rust (clippy, `-D warnings`) | `npm run lint:rust` |
| Formatação Rust | `npm run format:rust` / `npm run format:rust:check` |

Linux precisa de `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf` para compilar o Tauri.

## Fluxo de trabalho por tarefa

1. Partir da `main` atualizada: `git checkout main && git pull --ff-only`.
2. Criar branch `vitor-galache/<NN>-<descricao-curta>` (NN = número da tarefa, quando houver).
3. Implementar com mudanças pequenas e focadas na tarefa.
4. **Antes do PR, rodar todas as verificações** (o CI não roda em PRs, só após o merge na `main`):
   ```bash
   npm run lint && npm run format:check && npm run build && npm run format:rust:check && npm run lint:rust
   ```
5. Commit em português, no imperativo (ex.: `Adiciona tela de captura rápida`).
6. `git push -u origin HEAD` e `gh pr create --base main` com o template de PR preenchido.
7. Se todas as verificações passaram e o dono pediu para concluir a tarefa: `gh pr merge <n> --merge --admin --delete-branch`, depois `git checkout main && git pull --ff-only`.
8. Se alguma verificação falhar, corrigir antes; nunca mergear com verificações quebradas.

## Regras

- **Nunca** dar push direto na `main`, force-push na `main`, nem alterar/remover a proteção da branch.
- A `main` exige 1 aprovação do code owner (@vitor-galache); só o dono faz bypass com `--admin`.
- Não commitar segredos, `.env`, `node_modules/`, `dist/` ou `src-tauri/target/`.
- Não adicionar dependências sem necessidade clara; preferir as já existentes.
- Clippy sem warnings; código formatado pelo Prettier/rustfmt (não ajustar formatação à mão).
- Dados do usuário são arquivos Markdown locais (princípio do produto) — não introduzir serviços externos/telemetria sem pedido explícito.
