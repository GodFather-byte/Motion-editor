# Handoff
Atualizado por: Antigravity em 12/10/2026

## Objetivo atual
Integração de Whisper (Transformers.js) e Google MediaPipe ao editor.

## Feito nas últimas sessões
- Transformers.js v3 + Whisper (`onnx-community/whisper-tiny`): transcrição de áudio e legendas locais na timeline sem chave de API, além de exportação .SRT/texto.
- Modal de legendas (`aiCaptionsPicker`) atualizado com suporte a Whisper (local) e Gemini (nuvem).
- Google MediaPipe Tasks Vision:
  - Recorte instantâneo de pessoas (`selfie_segmenter`, ~250 KB) com máscara alfa suave.
  - Auto-enquadramento facial (`blaze_face_short_range`) ajustando foco X/Y da camada automaticamente.
- Botões integrados no painel de camadas e menu IA (`#btnAI`).
- Ícones `.sw-whisper` e `.sw-mediapipe` em `style.css`.
- Integrações de edição com IA (Gemini), Photopea e FFmpeg preservadas e compatíveis.
- Testes automatizados em `tests/ai-local.cjs`. Cache do PWA em `motion-v17`.

## Próximo passo
Testar desempenho de transcrição e detecção facial em celulares reais via PWA.

## Arquivos relevantes
- `app.js`: seções Whisper, MediaPipe, `createCaptionLayers`, `aiCaptionsPicker` e `window.__motion`.
- `style.css`: `.sw-whisper`, `.sw-mediapipe`.
- `sw.js`: `motion-v17`.
- `tests/ai-local.cjs`, `tests/ai-edit.cjs`, `tests/ffmpeg.cjs`, `tests/photopea.cjs`.

## Decisões tomadas e motivo
- Carregamento 100% sob demanda via CDN dinâmico (`import()`), mantendo o app leve e sem dependências no build.
- Whisper roda localmente via WebAssembly/WebGPU, sem depender de nuvem ou chaves pagas.
- MediaPipe usa máscaras de probabilidade alfa para recorte suave e suporta enquadramento inteligente em vídeos/imagens verticais.

## Pendências e armadilhas
- No primeiro uso offline, o usuário precisa carregar uma vez com internet para cachear os modelos.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --test tests/*.cjs`.
