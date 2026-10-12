# Handoff
Atualizado por: Codex em 12/10/2026

## Objetivo atual
Suporte a Lottie e dotLottie entregue, integrado às atualizações recentes de Whisper e MediaPipe.

## Feito nas últimas sessões
- Botão Lottie / dotLottie importa JSON e pacotes v1/v2, incluindo imagens embutidas e múltiplas animações.
- Controles de velocidade, início, repetição, reverso, enquadramento e escolha de animação no pacote.
- Timeline sincronizada ao quadro da fonte, com split/trim, keyframes, grupos, máscaras, looks e transições.
- PNG/GIF/MP4/WEBM incluem a animação; congelar quadro cria imagem com alpha. IndexedDB, undo/redo e .motion.json preservam o original.
- Player ESM/WASM sob demanda, cache após primeira importação; reabertura offline conferida no Chromium.
- Mantidos edição Gemini, Whisper/MediaPipe, Photopea, FFmpeg, efeitos, exportação rápida, música e narração.
- Cache PWA motion-v18; 59 testes passaram, incluindo 8 de Lottie com runtime real, sem simular renderização.

## Próximo passo
Conferir desempenho no celular real e compatibilidade visual com arquivos complexos de designers.

## Arquivos relevantes
- lottie.js: MotionLottie.load/render/sourceInfo, dotlottie-web 0.81.0 ESM/WASM (MIT).
- app.js: tipo lottie em assets/modelo/drawShape/painel/importação; TIMED_MEDIA e freezeFrame.
- tests/lottie.cjs: 8 testes (JSON/ip, pacotes v1/v2/imagens, clones, timeline, portabilidade, exportação, erros e descarte).
- .ai/MAPA.md descreve também IA local/nuvem, Photopea e FFmpeg.

## Decisões tomadas e motivo
- MEDIA continua só vídeo/áudio para som; TIMED_MEDIA inclui Lottie para cortes, velocidade e duração.
- Player pausado por asset: setFrame/resize/loadAnimation síncronos antes de desenhar cada camada, inclusive clones.
- Validação antes de registrar; cargas tardias e troca de projeto destroem o player, sem anexar mídia ao projeto novo.

## Pendências e armadilhas
- Importe até 20 MB; pacote até 60 MB descompactado, animação até 10 min, canvas intermediário limitado.
- JSON precisa de imagens embutidas; exporte textos como formas para preservar fontes.
- Formas internas não são editáveis separadamente. Áudio e interatividade do pacote não são reproduzidos.
- Primeiro carregamento do player precisa de internet; Gemini precisa da chave do usuário e não foi chamado ao vivo.
- Sempre aumentar VERSION em sw.js e manter lottie.js/ai-edit.js no shell; teste ai-local aceita versões >=17.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --check lottie.js`.
`CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=2 tests/*.cjs` (Playwright, FFmpeg, curl e internet).
