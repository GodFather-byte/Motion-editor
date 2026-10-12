# Handoff
Atualizado por: Claude em 12/10/2026

## Objetivo atual
Três blocos pedidos pelo dono: qualidade/velocidade, efeitos que vendem, música e redes sociais. Os três estão prontos.

## Feito nas últimas sessões
- Exportação rápida (WebCodecs + mp4-muxer), GIF/PNG transparente, preview leve ao tocar.
- Efeitos: chroma key, camada de efeito WebGL, partículas, câmera virtual, texto curvo e no traço.
- Música: detectar batidas (BPM + marcas na régua, clipes grudam nas batidas), "Na batida" (pulsar, piscar, tremer), montagem de fotos/vídeos na batida.
- Batidas prontas sem direitos (Eletrônica, Funk, Trap, Lo-fi), geradas no aparelho com as batidas já marcadas.
- Gravar narração (microfone, medidor de volume), entra na posição da agulha.
- Figurinhas: emojis (camada de texto) e tipo novo `icon` com 16 ícones vetoriais.
- Painel Código recebe `beats` (tempos das batidas na timeline).
- Correção geral: modal alto abria rolado para baixo no celular (foco no botão); agora abre no topo.
- PWA em motion-v13.

## Próximo passo
Testar no celular real: microfone (permissão no Safari/Android), detecção de batida em músicas reais e montagem com vídeos.

## Arquivos relevantes
- app.js: seção "batida, narração, batidas prontas e figurinhas"; régua (`.beat-mark`), arraste de clipes (`magnet`), painel de áudio (Ritmo) e "Na batida".
- index.html: chips Batidas, Gravar voz e Figurinhas. style.css: estilos `sw-beats`, `sw-mic`, `sw-sticker`, `sticker-*`, `vu`.
- tests/music.cjs (5 testes). Todos os 23 testes passam.

## Decisões tomadas e motivo
- `s.beats` fica em segundos do arquivo; `beatsOf()` converte com corte e velocidade, então cortar/acelerar a música mantém as marcas certas.
- Batidas sintetizadas por OfflineAudioContext: zero arquivos de música no repositório e zero risco de direitos autorais.
- Keyframes são arredondados para quadros; o pulso usa 1 quadro antes da batida para o golpe cair na batida.

## Pendências e armadilhas
- Detecção de batida busca entre 60 e 180 BPM, com preferência perto de 120; músicas sem bateria podem não ter ritmo claro.
- Gravar voz precisa de HTTPS ou localhost e permissão de microfone.
- Exportação rápida depende de WebCodecs; Chromium headless não tem H.264/AAC, usa VP9/Opus.
- Sempre aumentar VERSION em sw.js quando mudar o app.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`,
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node --test tests/*.cjs` (precisa de internet e FFmpeg).
