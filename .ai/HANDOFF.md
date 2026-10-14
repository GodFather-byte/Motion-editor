# Handoff
Atualizado por: Codex em 14/10/2026

## Fluxo de vídeo curto
- Estúdio de Legendas: cinco estilos Motion, aplicação em lote e cartão ajustável atrás do texto.
- Marcadores de roteiro persistentes: botão da timeline, `Shift+M`, edição, snap magnético e lista no projeto.
- Guia de área segura para 9:16: só na prévia, nunca na exportação.
- Atalhos rápidos de importar, legendar e abrir modelos no desktop.
- Legendas por Whisper, Gemini e edição com IA usam os estilos novos.

## Arquivos centrais
- `app.js`: `CAPTION_STYLES`, `createCaptionLayers`, `addMarker`, `drawSafeAreaGuide`.
- `index.html` e `style.css`: controles e layout responsivo.
- `tests/short-form.cjs`: cobertura do fluxo novo.
- `sw.js`: cache em `motion-v30`.

## Validação feita
- `node --check app.js` e `node --check tests/short-form.cjs` passaram.
- `tests/short-form.cjs`: 4 cenários Playwright passaram (desktop e 360 px).
- 19 testes estáticos existentes passaram; `git diff --check` passou.

## Continuidade
- Publicar na branch `feat/estudio-video-curto`, sem tocar na PR #27.
- Manter textos em PT-BR, cores de UI em variáveis CSS e sem dependências novas.
