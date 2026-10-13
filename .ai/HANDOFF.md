# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Modo celular como app: barra superior compacta, prévia grande, barra inferior com 4 abas e ferramentas em folhas agrupadas. PC (≥ 861 px) não muda.

## Feito nas últimas sessões
- Celular (≤ 860 px): tela fixa, sem rolagem da página. Abas inferiores: Adicionar, IA, Propriedades, Projeto.
- Ferramentas (.add-bar) viram folha com grupos (Mídia, Texto e formas, Efeitos e grupos). Propriedades (#panel) viram folha. Projeto reúne o menu ⋮ e Seja Pro.
- Toque (pointer: coarse): alvos maiores.
- Testes: video-editor, ai-edit, photopea e mobile-sheets passaram (25 de 25). Testes atualizados só para abrir a folha antes de clicar; nenhuma asserção removida.
- PC comparado com a captura de antes: diferença só de 2 px na borda dos botões (ruído de renderização).
- Cache PWA motion-v20.

## Próximo passo
Testar no celular real, instalado e no navegador. Ver se a folha Projeto e a folha Propriedades ficam claras ao usar.

## Arquivos relevantes
- index.html: barra inferior (nav.tabbar), folhas e cabeçalho.
- style.css: bloco @media (max-width: 860px) e @media (pointer: coarse).
- app.js: abrir e fechar folhas (data-sheet / data-sheet-open), Esc, eventos das abas.
- tests/mobile-sheets.cjs: teste das folhas. Os outros testes têm helper sheet() que abre a folha antes de clicar.
- .ai/MAPA.md: atualizado com a estrutura nova.

## Decisões tomadas e motivo
- Uma só estrutura de DOM, duas apresentações: no celular o CSS reagrupa; no PC nada muda.
- Folhas são overlays fixos: abrir uma folha não redimensiona a prévia.
- Botões que aparecem em dois lugares usam encaminhamento sem id, nunca ids duplicados.

## Pendências e armadilhas
- Não há commit nem PR desta reformulação até este handoff ser commitado. Verifique git status antes de começar.
- Lottie (teste lottie.cjs) precisa de internet para o CDN; não foi rodado nesta sessão.
- Janela de PC com menos de 861 px recebe o layout de celular (comportamento antigo).
- Para mudar o celular, editar dentro de @media (max-width: 860px) e manter os ids.
- Sempre aumentar VERSION em sw.js quando mudar arquivos do app.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`.
`CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=2 tests/video-editor.cjs tests/ai-edit.cjs tests/photopea.cjs tests/mobile-sheets.cjs` (Playwright, FFmpeg). Se não houver /usr/bin/chromium, aponte CHROMIUM_PATH para o Chromium do Playwright.
