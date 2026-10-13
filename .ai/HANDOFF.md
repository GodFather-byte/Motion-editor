# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Visual de celular: no celular o editor vira um app de tela cheia; no PC continua com três colunas. Quem entra pelo navegador do celular ou instala o app vê o layout de celular; quem entra pelo PC vê o layout de PC.

## Feito nas últimas sessões
- Celular (até 860 px): sem molduras nem margens, seções separadas por linhas, cabeçalho compacto, prévia maior (o título "Prévia" some) e barra de ferramentas de borda a borda.
- Toque (`pointer: coarse`, celular e tablet): ícones e chips com 40 px, losangos de keyframe e alças de corte com 16 px.
- PC conferido em captura antes/depois: sem mudança de layout.
- Testes video-editor, ai-edit (inclui 360 px) e photopea: 19 de 19 passaram.
- Cache PWA motion-v19.
- Lottie/dotLottie (sessão anterior, commit 1b23046) continua igual.

## Próximo passo
Ver no celular real, no navegador e instalado. Se a prévia ainda ficar pequena, o próximo passo é o painel de propriedades virar folha inferior (bottom sheet) e a barra de ferramentas ir para a parte de baixo.

## Arquivos relevantes
- style.css: bloco `@media (max-width: 860px)` (celular) e `@media (pointer: coarse)` logo antes de `prefers-reduced-motion`.
- sw.js: VERSION motion-v19.
- .ai/MAPA.md: descreve as media queries.
- lottie.js: MotionLottie.load/render/sourceInfo, dotlottie-web 0.81.0 ESM/WASM (MIT).

## Decisões tomadas e motivo
- Detecção só por CSS (largura e `pointer: coarse`), sem user agent: muda sozinho ao girar ou redimensionar.
- App instalado usa o mesmo layout de celular: o modo standalone já ocupa a tela toda e as áreas seguras já são tratadas.
- Desktop não foi alterado para não regredir o layout que funciona.

## Pendências e armadilhas
- No celular, `.stage-wrap` precisa de `grid-template-rows: minmax(0, 1fr) auto`: sem isso a barra de ferramentas some (já aconteceu).
- Janela de PC com menos de 861 px também recebe o layout de celular (comportamento antigo). Tablet em paisagem recebe o layout de PC com alvos de toque.
- Não testado em aparelho real nem com app instalado: o Playwright não simula `display-mode: standalone`.
- Lottie: importe até 20 MB; pacote até 60 MB descompactado; JSON precisa de imagens embutidas. Formas internas não são editáveis separadamente.
- Sempre aumentar VERSION em sw.js e manter lottie.js/ai-edit.js no shell.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --check lottie.js`.
`CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=2 tests/*.cjs` (Playwright, FFmpeg, curl e internet). Se não houver `/usr/bin/chromium`, aponte CHROMIUM_PATH para o Chromium do Playwright.
