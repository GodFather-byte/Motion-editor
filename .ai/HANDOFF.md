# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Integrar a correção XSS do modal às mudanças recentes da branch `main`.

## Estado agora
- `showModal` usa `sanitizeHTML` com `DOMParser` para remover tags perigosas, atributos `on*` e URLs `javascript:`.
- A prévia tem controles de zoom; Ctrl/Cmd+S exporta o projeto.
- Exportação 4K usa nível H.264 conforme resolução/FPS e alternativas de codec.
- `cleanRamp` e `rampCum` estão expostas em `window.__motion`; `tests/slowmo.cjs` cobre filtros e integral da rampa.
- Testes: `tests/preview-controls.cjs`, `tests/res4k.cjs` e `tests/slowmo.cjs`.
- `sw.js` está em `motion-v31` após integrar mudanças de app da main.

## Como retomar
1. Rode `git status` e consulte `README.md` e `.ai/MAPA.md`.
2. Confira a sintaxe com `node --check app.js` e `git diff --check`.
3. Testes de navegador precisam de Node, Playwright e Chromium; nenhuma dependência foi adicionada ao app.

## Arquivos relevantes
- `app.js`: sanitização do modal e lógica do editor.
- `sw.js`: versão do cache offline.
- `tests/preview-controls.cjs`, `tests/res4k.cjs` e `tests/slowmo.cjs`.

## Pendências e limitações
- Não houve teste em celular físico.
