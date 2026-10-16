# Contribuindo com o Aquarium

## Fluxo

1. Crie uma branch a partir de `main` (`<usuario>/<numero>-<descricao>`).
2. Faça commits pequenos e descritivos.
3. Abra um PR para `main` preenchendo o template.
4. A `main` é protegida: todo código entra via PR, sem force-push.
5. Após o merge, o CI roda em `main` (lint, formatação, clippy, audit e build em macOS/Linux/Windows). Se quebrar, corrija antes de seguir.

> O CI **não** roda em PRs. Rode as verificações localmente antes de abrir/atualizar o PR:

```bash
npm run lint && npm run format:check && npm run build
npm run lint:rust && npm run format:rust:check
```

Para validar uma branch no CI antes do merge, use **Actions → CI → Run workflow** e escolha a branch.

## Padrões

- Formatação: Prettier (TS/CSS/JSON) e rustfmt (Rust). Use `npm run format` e `npm run format:rust`.
- Clippy sem warnings (`-D warnings`).
- Dependências são atualizadas semanalmente via Dependabot.

## Issues

Use os templates de **Bug** ou **Funcionalidade**, com passos de reprodução ou critérios de aceite.
