# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Motion Editor 100% código aberto (AGPL-3.0), gratuito. Novidades no navegador, sem nuvem: rastreio, cortes por cena, desfoque de movimento, mais estilos de cor e agulha que não invade as camadas.

## Estado agora
- main em 3442fb1. Branch ccr-a74f83ad-cpkqwi tem o commit do PR #9 (apoio ao projeto, aberto) e as novidades abaixo, em PR de rascunho.
- Feito: agulha da linha do tempo some sob a coluna de camadas ao rolar; 10 estilos de cor novos (17 no total); "Desfoque de movimento %" no painel do projeto (6 instantes dentro do obturador). sw.js em motion-v24.
- Testes: tests/modern.cjs (5) e regressão (video-editor, ai-edit, ai-edit-plan, photopea, mobile-sheets, export, effects, music, libs, donate) passaram: 55 de 55. lottie.cjs NÃO rodado.

## Como retomar (Codex)
1. `git fetch origin && git checkout ccr-a74f83ad-cpkqwi && git pull`. Confira `git status` antes de editar.
2. Não faça merge nem force-push. Merge só quando o dono pedir.
3. Próximos passos, em ordem:
   a. Testar o desfoque de movimento na prévia em aparelho real: com obturador alto a prévia fica lenta.
   b. Desfoque só vale para camadas com keyframes (texto, forma, imagem). Para vídeo, precisaria buscar quadros de forma assíncrona antes de cada amostra.
   c. Rodar `node --test tests/lottie.cjs` com internet (ainda não rodado).

## Arquivos relevantes
- app.js: `renderFrame` (envelope do desfoque) e `renderFrameOnce`; `clipPlayhead`; `COLOR_LOOKS`; seção "rastreio de movimento e cortes por cena"; "apoiar o projeto" (DONATE).
- tests/modern.cjs: rastreio, cortes, agulha, estilos e desfoque.

## Decisões tomadas e motivo
- Desfoque é síncrono (envelope sobre renderFrameOnce), então não busca quadros de vídeo. Por isso o efeito aparece em formas, textos e imagens que se movem.
- Agulha é escondida (visibility) quando fica a menos de 7 px da coluna de camadas, em vez de cortada, porque o triângulo também passa do limite.
- Estilos novos usam só os parâmetros de filtro que já existiam (brightness, contrast, saturate, sepia, hue).

## Pedidos da foto que ficaram de fora
- Anime Super Resolution, AI Interpolate e V-FPS changer: precisam de modelos de IA ou de fluxo óptico. Não foram feitos.
- "2100+ projetos": é conteúdo (modelos prontos), não código. Hoje são 8 modelos.
- Cloud space e assinatura SVIP: não se aplicam a um app gratuito e sem servidor. Não há paywall.

## Pendências e armadilhas
- Rastreio só faz translação (x, y). Não acompanha rotação nem escala.
- Cortes por cena usam diferença de cor, sem IA. Limite de 600 s.
- Fonte própria: não testei salvar e reabrir um .motion.json.
- DONATE em app.js está vazio: falta chave PIX e/ou links do dono.
