# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Manter os controles da prévia, suporte a exportação 4K e cobertura das rampas.

## Estado agora
- Controles de zoom da prévia no cabeçalho: diminuir/aumentar de 50% a 200%; tocar na porcentagem ajusta à área.
- Zoom visual fica em `S.stageZoom`; não entra no projeto. Em ampliação, a rolagem fica dentro da prévia.
- `Ctrl/Cmd+S` exporta `.motion.json` pelo mesmo fluxo do menu. Atalhos não atuam em campos de texto.
- `pickVideoCodec` calcula níveis H.264 pela resolução e FPS e tenta H.265, VP9 e AV1 como alternativas; 4K30 usa H.264 5.1 e 4K60 usa 5.2.
- `cleanRamp` e `rampCum` estão expostas em `window.__motion`; `tests/slowmo.cjs` cobre filtros e integral da rampa.
- `sw.js` está em `motion-v29`.
- Testes: `tests/preview-controls.cjs`, `tests/res4k.cjs` e `tests/slowmo.cjs`.
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
