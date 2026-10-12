# Handoff
Atualizado por: Claude em 12/10/2026

## Objetivo atual
App completo e publicado. Fase atual: testar com usuários reais e corrigir o que aparecer.

## Feito nesta sessão
- Revisei o commit do Antigravity (dividir, velocidade, mudo, congelar quadro, espelhar, novas animações, modal de exportação). Tudo mantido.
- Corrigido: com velocidade diferente de 1x o som da exportação cortava cedo (2x) ou passava do fim do bloco (0,5x). `start()` do Web Audio recebe duração em segundos do arquivo.
- Corrigido: velocidade era salva como texto; agora é número (inclusive em projetos antigos, via `normalize`).
- Mudar a velocidade agora reajusta o tamanho do bloco na timeline (mesmo trecho do arquivo).
- Dividir camada mantém todos os keyframes nas duas partes (antes a curva mudava no corte).
- Congelar quadro herda o "Seguir camada" do vídeo; botão Exportar não quebra sem MediaRecorder.
- sw.js em motion-v7.

## Próximo passo
Testar com a chave real do Gemini e com vídeos longos gravados no celular.

## Arquivos relevantes
- app.js: `scheduleAudio`, painel (`key === 'speed'`), `splitLayer`, `freezeFrame`, `exportModal`

## Decisões tomadas e motivo
- Keyframes ficam em tempo absoluto; dividir só muda start/end (e trimIn da mídia).
- Animação de texto (pop, rise…) recomeça na parte 2 de um texto dividido, igual a outros editores.

## Pendências e armadilhas
- Remover fundo usa @imgly/background-removal (AGPL).
- Exportação é em tempo real: a aba precisa ficar visível.
- Tecla S divide a camada mesmo com Ctrl (Ctrl+S não salva a página).

## Como rodar e testar
`python3 -m http.server 8000` e abrir http://localhost:8000. `node --check app.js` para sintaxe.
