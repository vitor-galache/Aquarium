<p align="center">
  <img src="assets/logo/notesea-logo.png" alt="Notesea" width="420">
</p>

Ideias e estudo que ganham profundidade. Veja [notesea.md](notesea.md) para a visão do projeto.

## Rodando localmente

### Pré-requisitos

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Dependências de sistema do Tauri para o seu SO: <https://tauri.app/start/prerequisites/>

### Comandos

```bash
npm install
npm run tauri dev     # abre o app em modo desenvolvimento
npm run tauri build   # gera o binário de produção
```

### Qualidade

```bash
npm run lint          # ESLint
npm run format        # Prettier (escreve)
npm run format:check  # Prettier (verifica)
npm run lint:rust     # clippy
npm run format:rust   # rustfmt
```

## Stack

Tauri 2 · React · TypeScript · Vite · Tailwind CSS
