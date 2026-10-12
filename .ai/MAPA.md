# Mapa do repositório

## Arquivos
- `index.html`: estrutura da interface (barra de projeto, status de salvamento, cabeçalho de prévia com formato/fps, ferramentas de criação, linha do tempo, painel, modal).
- `style.css`: visual. Variáveis no topo; bloco `@media (max-width: 860px)` é o layout de celular.
- `app.js`: o editor inteiro, num único IIFE, dividido em seções (abaixo).
- `pro-config.js`: chave pública ECDSA e textos/preço do plano Pro.
- `sw.js`: service worker (cache offline). Mude `VERSION` a cada release.
- `manifest.webmanifest`, `icons/`: instalação como app.
- `tools/licenca.mjs`, `tools/licenca.py`: geram chaves de licença Pro (precisam do `.pem`, que não fica no git).
- `tests/video-editor.cjs`: testes funcionais com Playwright/Chromium, mídia gerada pelo FFmpeg e servidor Python temporário.
- `tests/effects.cjs`: câmera, efeitos WebGL, chroma key, partículas, texto curvo/no traço.
- `tests/export.cjs`: exportação rápida, GIF e preview leve.
- `tests/music.cjs`: detecção de batida, pulso e montagem na batida, batidas prontas, narração (microfone falso do Chromium), figurinhas.
- `tests/code-animation.cjs`: testes do painel Código (GSAP isolado). Precisa de internet. Rode com `CHROMIUM_PATH` apontando para o Chromium do Playwright se não houver `/usr/bin/chromium`.

## Seções de app.js (busque pelo título `/* ===... nome ===... */`)
| Seção | O que tem |
|---|---|
| utilidades | helpers, FONTS, ASPECTS, EASES, curvas Bézier, PROPS animáveis, COLOR_LOOKS, TRANSITIONS, MEDIA_FITS, TEXT_ANIMS, BLENDS |
| estado | objeto `S`, mapas `A` (arquivos carregados) e `VIDS` (vídeos por camada) |
| arquivos (IndexedDB) | `idb`, `loadAsset`, `registerAsset`, `syncMedia` (vídeo), `scheduleAudio` (som) |
| modelo | `newProject`, `defaultS` (campos de cada tipo), `makeLayer`, `normalize`, `val` (valor no tempo), keyframes, `transitionState` (envelope de entrada/saída), `worldMatrix`, `setParent` |
| render | `drawText` (animações de texto), `drawPath`, `drawFramedMedia` (contain/cover/stretch e foco), `drawShape`, `drawLayer` (filtros, looks, transições, sombra, brilho), `renderFrame` (máscara de recorte) |
| efeitos, partículas e câmera | `GL` (WebGL compartilhado, `GL_FRAG` com os shaders), `chromaSource`, `applyFx` (camada fx em `renderFrame`), `PARTICLES`/`drawParticles` (sem estado), `activeCamera`/`cameraMatrix` (entra no `parentMatrix` das camadas raiz), `textPathPoints`/`pointOnPath` |
| batida, narração, batidas prontas e figurinhas | `detectBeats` (BPM por autocorrelação), `beatsOf`/`projectBeats` (batidas no tempo da timeline), `magnet` (gruda nas batidas), `analyzeBeats`, `applyBeatPreset` (beatPulse/beatFlash/beatShake), `beatMontage`, `BEAT_STYLES`/`synthBeat`/`beatMakerModal`, `recordVoiceModal` (MediaRecorder), `EMOJIS`, `ICONS` (path SVG 24x24), `iconPath`, `drawIcon`, `stickersModal` |
| seleção no preview | caminho de movimento, caneta, alças, `fitStage`, arrastar no canvas |
| tempo e reprodução | `refreshTime`, `play`, `pause` |
| linha do tempo | `renderTimeline`, forma de onda, arrastar keyframes e blocos, botão de mudo, snap magnético |
| painel de propriedades | `renderPanel` (cabeçalho fixo e cartões), `layerPanel`, `projectPanel`, `syncPanel`, editor de curva `setupCurve`, eventos do painel |
| animações prontas | `applyPreset` (fade, zoom, slide, flash, shake, bounce, etc.) |
| camadas | adicionar, duplicar, dividir (`splitLayer`), congelar quadro (`freezeFrame`), excluir, `setAspect`, importação de mídia |
| desfazer / salvar | `commit` (sempre chame após uma mudança), `scheduleSave` (status real em #saveStatus), localStorage, `setProject` |
| exemplo inicial | `demoProject` |
| exportação | `exportModal`, `exportVideo` (MediaRecorder + Web Audio, fallback MP4 → WEBM) |
| exportação rápida | `fastExport` (WebCodecs + mp4-muxer), `renderAudioMix` (OfflineAudioContext), `seekVideosExact`, `exportGif` (gifenc), `exportPng`, `fileReady`. `renderFrame(c, t, {k, transparent})` desenha em qualquer escala (`RK`) |
| IA | `gemini()` (generateContent com a chave do usuário), gerar animação, legendas, remover fundo |
| animação por código (GSAP) | `codeWorkerMain` (roda no worker isolado), `runCodeSandbox`, `simplifySeries`, `bakeCode`, `applyCode`, `codeModal`, `CODE_EXAMPLES`, `aiWriteCode` |
| plano Pro | `verifyLicense`, `proModal`, `drawWatermark` |
| modelos prontos | `TEMPLATES` (cada um é uma função que cria camadas), miniaturas |
| menu, modal, teclado, PWA, início | resto da interface e inicialização |

## Modelo de dados (resumo)
Projeto: `{ name, aspect, width, height, fps, duration, background, layers[], assets{} }`.
Camada: `{ id, type, name, start, end, visible, parent, p{valores fixos}, kf{prop:[{t,v,e,bz?}]}, s{campos do tipo, flipH, flipV, speed, muted}, codeKf?[props geradas por código], fromCode? }`. Projeto também guarda `code` (último código aplicado).
`layers[0]` fica na frente. Arquivos (imagem, vídeo, áudio) ficam no IndexedDB; `assets` guarda só nome e tipo.

Novos campos em `s`: `colorLook`, `lookIntensity`, `transitionIn/Out`, `transitionInDuration/OutDuration`, `mediaFit`, `focalX/Y`. `transitionStart/End` são âncoras opcionais preservadas pelo split, deslocadas ao mover o clipe e removidas ao editar a borda ou a transição correspondente. Projetos antigos usam look Original, sem transição e enquadramento livre.

Música: camada de áudio guarda `s.beats` (segundos do arquivo, antes de corte e velocidade) e `s.bpm`. A régua e o painel Código usam `projectBeats()`. Tipo `icon`: `s.iconName`, `s.d` (path SVG), `s.size`, mais preenchimento/degradê/contorno/brilho das formas.

Tema do editor: tokens no início de `style.css`; `theme` em app.js lê essas variáveis para alças, caminho de movimento, curvas e ondas de áudio. Cores de conteúdo dos projetos são independentes. No desktop, propriedades ocupam a coluna direita inteira; em <=860 px a página empilha os blocos com rolagem, sem reduzir a prévia em telas curtas.
