# Handoff
Atualizado por: Claude em 14/10/2026

## Objetivo atual
Motion Editor 100% aberto (AGPL-3.0). Nesta rodada: suporte a 4K na exportação.

## Estado agora
- main tem câmera lenta, tela inicial (PR #10) e a suavização do rastreio em O(N) (PR #12, outro agente).
- Branch ccr-a74f83ad-cpkqwi: 4K, em PR de rascunho. sw.js em motion-v27.
- 4K: `pickVideoCodec` escolhe o nível H.264 pelo tamanho e fps (`avcLevel`: 4K30 = 5.1, 4K60 = 5.2) e tenta H.265, VP9 e AV1 se o aparelho não codificar H.264. Bitrate até 80 Mbps.
- Janela Exportar: testa cada resolução no aparelho e desliga a que não dá ("não disponível neste aparelho"), mostra o tamanho estimado e avisa que 4K demora mais. PNG sai na resolução escolhida (até 4K).
- Painel do vídeo mostra a resolução do arquivo, com "(4K)".
- Testes: tests/res4k.cjs (3) e regressão export, video-editor, slowmo, home, mobile-sheets, effects, ai-edit: 45 de 45 (mobile-sheets falhou uma vez só rodando em paralelo; sozinho passa 6 de 6).

## Como retomar (Codex)
1. `git fetch origin && git checkout ccr-a74f83ad-cpkqwi && git pull`. Confira `git status` antes de editar.
2. Não faça merge nem force-push. Merge só quando o dono pedir.
3. Testes abrem `origin + '/#editor'`. Use CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome e NODE_PATH=/opt/node22/lib/node_modules.
4. Próximos passos sugeridos:
   a. Testar exportação 4K em celular real (memória e tempo).
   b. Vídeos 4K longos: o MP4 fica todo na memória (ArrayBufferTarget). Para arquivos grandes, gravar direto no disco com o StreamTarget do mp4-muxer.
   c. Revisão de segurança dos dados da tela inicial (troca rápida de projeto, várias abas).

## Arquivos relevantes
- app.js: "exportação rápida": `AVC_LEVELS`, `avcLevel`, `videoBitrate`, `pickVideoCodec`/`findVideoCodec`; `exportModal` (teste de suporte e tamanho); `exportPng(transparent, k)`.
- tests/res4k.cjs.

## Decisões tomadas e motivo
- Projetos continuam com base 1080 px; o 4K vem da exportação em escala (`renderFrame` com k). Textos e formas ficam nítidos e vídeos 4K mantêm o detalhe, porque o desenho acontece no tamanho final.
- H.264 primeiro por compatibilidade; os outros codecs só entram quando o aparelho não codifica H.264 nesse tamanho.
- Gravação em tempo real e GIF não mudam (tempo real grava a tela; GIF vai até 720 px).

## Pendências e armadilhas
- Várias abas no mesmo projeto: vale o último que salvou.
- Quadros suaves não aparecem na gravação em tempo real.
- DONATE em app.js continua vazio: falta chave PIX e/ou links do dono.
