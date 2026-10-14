# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Integrar a correção XSS do modal às mudanças recentes da branch `main`.

## Estado agora
- `showModal` usa `sanitizeHTML` com `DOMParser` para remover tags perigosas, atributos `on*` e URLs `javascript:`.
- A prévia tem controles de zoom; Ctrl/Cmd+S exporta o projeto.
- `tests/preview-controls.cjs` e `tests/res4k.cjs` foram adicionados; `tests/slowmo.cjs` cobre `rampCum`.
- `sw.js` está em `motion-v30` para incluir a correção XSS junto às mudanças recentes do app.
- Merge de `main` concluído; `app.js`, os testes e a documentação de `main` foram preservados.

## Como retomar
1. Rode `git status` e consulte `README.md` e `.ai/MAPA.md`.
2. Confira a sintaxe com `node --check app.js` e `git diff --check`.
3. Testes de navegador precisam de Node, Playwright e Chromium; nenhuma dependência foi adicionada ao app.

## Arquivos relevantes
- `app.js`: sanitização do modal e controles/recursos recentes.
- `sw.js`: versão do cache offline.
- `tests/preview-controls.cjs`, `tests/res4k.cjs` e `tests/slowmo.cjs`.

## Pendências e limitações
- Não houve teste em celular físico.
