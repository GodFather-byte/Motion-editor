# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Renovar a prévia do editor e adicionar controles úteis sem alterar o formato dos projetos.

## Estado agora
- Controles de zoom da prévia no cabeçalho: diminuir/aumentar de 50% a 200%; tocar na porcentagem ajusta à área.
- Zoom visual fica em `S.stageZoom`; não entra no projeto. Em ampliação, a rolagem fica dentro da prévia.
- `Ctrl/Cmd+S` exporta `.motion.json` pelo mesmo fluxo do menu. Atalhos não atuam em campos de texto.
- `sw.js` está em `motion-v28`.
- Testes: `tests/preview-controls.cjs` (2/2) e `tests/mobile-sheets.cjs` (6/6); `node --check` e `git diff --check` passaram.

## Como retomar
1. Rode `git pull` e confira `git status`.
2. Consulte `README.md` e `.ai/MAPA.md` para localizar recursos e testes.
3. Teste o editor com `python3 -m http.server 8000` e `node --check app.js`.
4. Testes de navegador precisam de Node, Playwright e Chromium; nenhuma dependência foi adicionada ao app.

## Arquivos relevantes
- `index.html`: controles de zoom no cabeçalho da prévia.
- `style.css`: estilo dos controles e cabeçalho compacto para celular.
- `app.js`: `S.stageZoom`, escala visual e atalho Ctrl/Cmd+S.
- `tests/preview-controls.cjs`: zoom, viewport de 360 px e salvamento.

## Pendências e limitações
- Não houve teste em celular físico.
- O zoom muda só a visualização, não a dimensão ou os dados da composição.
