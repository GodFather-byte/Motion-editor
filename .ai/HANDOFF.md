# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Motion Editor 100% código aberto, licenciado sob AGPL-3.0: sem plano Pro, sem marca d'água, bibliotecas abertas carregadas sob demanda.

## Estado agora
- PR #4 mergeado na main. Esta branch acrescenta o arquivo LICENSE (AGPL-3.0) e o README atualizado.
- Feito: Pro removido; Lucide, wavesurfer, mp4box e opentype integrados; sw.js em motion-v21.
- Testes: tests/libs.cjs (4) e regressão (video-editor, ai-edit, ai-edit-plan, photopea, mobile-sheets, export, effects, music) passaram: 49 de 49. lottie.cjs NÃO rodado.

## Como retomar (Codex)
1. `git fetch origin && git checkout ccr-a74f83ad-cpkqwi && git pull`. Confira `git status` antes de editar.
2. Não faça merge nem force-push. Merge só quando o dono pedir, com merge commit.
3. Passos, nesta ordem:
   a. Rode `node --test tests/lottie.cjs` com internet. Se falhar, anote o erro aqui.
   b. Teste fonte própria: enviar .ttf, salvar o .motion.json, reabrir. Se a fonte sumir, corrija.
   c. Confira no celular real (390 px): folhas Adicionar e Propriedades, e a forma de onda.

## Arquivos relevantes
- app.js: seção "bibliotecas abertas" (LIBS, lib, loadLucide, lucideD); videoInfo, pickFont, addCustomFont e mountPanelWave.
- sw.js: CDN_FILES. style.css: .sticker.line, .wave-box.
- tests/libs.cjs: um teste por biblioteca. LICENSE: AGPL-3.0.

## Decisões tomadas e motivo
- Bibliotecas em CDN com versão fixa e carregamento sob demanda, para não pesar a abertura.
- wavesurfer só no painel de áudio; os clipes da linha do tempo mantêm a forma de onda própria.
- AGPL-3.0 porque @imgly/background-removal é AGPL-3.0 e o app roda na web (cláusula de rede).

## Pendências e armadilhas
- Verificar a licença do build do FFmpeg.wasm (builds com x264 são GPL). Ainda não verificado.
- Fonte própria com nome igual ao de uma fonte do Google sobrescreve a exibição daquele nome.
- mp4box lê o arquivo inteiro na memória; vídeos acima de 400 MB não são analisados.
- O primeiro uso de cada biblioteca precisa de internet; depois fica no cache do sw.

## Como rodar e testar
`node --check app.js`; `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NODE_PATH=/opt/node22/lib/node_modules node --test --test-concurrency=2 tests/libs.cjs`.
