# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Manter a cobertura de testes das rampas e dos controles de prévia.

## Estado agora
- `cleanRamp` e `rampCum` estão expostas em `window.__motion`; `tests/slowmo.cjs` cobre ambas.
- Controles de zoom da prévia: de 50% a 200%; tocar na porcentagem ajusta à área.
- `Ctrl/Cmd+S` exporta `.motion.json`; atalhos não atuam em campos de texto.
- `sw.js` está em `motion-v29`.
- Testes adicionais: `tests/preview-controls.cjs` e `tests/res4k.cjs`.
- Executar `node --check app.js` e `git diff --check` após alterações.

## Como retomar
1. Rode `git pull` e confira `git status`.
2. Consulte `README.md` e `.ai/MAPA.md` para localizar recursos e testes.
3. Teste com `python3 -m http.server 8000`, `node --check app.js` e os testes de navegador.

## Arquivos relevantes
- `index.html`, `style.css`: controles de zoom da prévia e cabeçalho compacto.
- `app.js`: zoom, salvamento por atalho e lógica do editor.
- `tests/slowmo.cjs`: integração das rampas e teste de `cleanRamp`.

## Pendências e limitações
- Não houve teste em celular físico.
- O zoom muda só a visualização, não a dimensão ou os dados da composição.
