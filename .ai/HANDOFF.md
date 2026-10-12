# Handoff
Atualizado por: Gemini em 12/10/2026

## Objetivo atual
Novas funcionalidades de edição de vídeo adicionadas com sucesso. Próxima fase: validar testes com usuários e novos formatos de mídia.

## Feito nesta sessão
- Dividir camada na agulha (S / Ctrl+K, botão na timeline e painel, com corte correto de trimIn e keyframes).
- Controle de velocidade (0.25x a 4x) para vídeo e áudio em tempo real e na exportação.
- Botão de mutar/desmutar camada na linha do tempo e painel (tecla M).
- Congelar quadro de vídeo (cria camada de imagem com o frame exato).
- Espelhamento horizontal e vertical (Flip H / Flip V) para vídeo, imagem e formas.
- Novas animações prontas: fadeIn, slideRight, slideUp, zoomOut, flash e shake.
- Modal de confirmação de exportação com seleção de FPS e exportação de frame PNG.
- Alinhamento magnético ao cursor na timeline e bump para motion-v6 no sw.js.

## Próximo passo
Testar divisão e velocidade com arquivos de vídeo reais longos de câmera no celular.

## Arquivos relevantes
- app.js: splitLayer, freezeFrame, exportModal, velocidade e mudo
- index.html: botão de tesoura (btnSplit) na timeline
- style.css: botão mute e largura de label
- sw.js: versão motion-v6

## Decisões tomadas e motivo
- Dividir particiona keyframes interpolando valores no instante exato do corte.
- Velocidade ajusta playbackRate do vídeo e Web Audio bufferSource proporcionalmente.
- Magnet snapping puxa para a agulha quando o arrasto chega a menos de 8px.

## Pendências e armadilhas
- Exportação exige manter a aba em primeiro plano durante a gravação em tempo real.
- Sempre atualizar VERSION no sw.js em novas alterações.

## Como rodar e testar
`python3 -m http.server 8000` e abrir http://localhost:8000. `node --check app.js` para sintaxe.
