# Mapa do repositório

## Arquivos
- `index.html`: estrutura da interface (topo com nome e histórico, prévia, barra Adicionar, linha do tempo, painel de propriedades, menu do projeto, barra de abas e scrim do celular, modal). Um DOM só: no celular os mesmos nós viram folhas.
- `style.css`: visual. Variáveis no topo; `@media (max-width: 860px)` é o celular como app (tela de trabalho fixa, barra de abas e folhas, veja a seção abaixo); `@media (pointer: coarse)` aumenta os alvos de toque em celular e tablet. As peças novas do celular ficam `display: none` no PC, fora de media.
- `app.js`: o editor inteiro, num único IIFE, dividido em seções (abaixo).
- `ai-edit.js`: helpers puros `normalizePlan`, `normalizeTranscript`, `findSilences`, `assemble` (navegador/Node).
- `lottie.js`: `MotionLottie.load/render/sourceInfo`, runtime dotlottie-web 0.81.0 ESM/WASM sob demanda (JSON e dotLottie v1/v2).
- `sw.js`: service worker (cache offline). Mude `VERSION` a cada release.
- `manifest.webmanifest`, `icons/`: instalação como app.
- `tests/slowmo.cjs`: câmera lenta (rampas, ida e volta do tempo, divisão, quadros suaves, som com rampa, 360 px).
- `tests/home.cjs`: tela inicial e biblioteca (novo projeto, reabrir, mídia por projeto, renomear/duplicar/excluir, modelos, migração, voltar do navegador, celular).
- Todos os testes abrem `origin + '/#editor'`: sem o hash o app mostra a tela inicial.
- `tests/mobile-sheets.cjs`: celular (360 e 390 px): tela fixa, abas, folhas, toque na prévia e na linha do tempo, Projeto, Play e largura.
- `tests/video-editor.cjs`: testes funcionais com Playwright/Chromium, mídia gerada pelo FFmpeg e servidor Python temporário. Em 360 px usa `sheet()`/`closeSheet()` para abrir a folha certa antes de cada clique.
- `tests/ai-edit-plan.cjs` e `tests/ai-edit.cjs`: plano, pausas e edição por pedido com Gemini simulado, mídia real, exportação e backup.
- `tests/lottie.cjs`: runtime real, pacotes v1/v2 com imagens, frames/trim/speed/loop/reverso, clones, portabilidade, MP4/GIF, falhas e troca de projeto.
- `tests/effects.cjs`: câmera, efeitos WebGL, chroma key, partículas, texto curvo/no traço.
- `tests/export.cjs`: exportação rápida, GIF e preview leve.
- `tests/res4k.cjs`: 4K (nível H.264, janela Exportar com tamanho estimado, PNG e MP4 em 2160 px).
- `tests/music.cjs`: detecção de batida, pulso e montagem na batida, batidas prontas, narração (microfone falso do Chromium), figurinhas.
- `tests/photopea.cjs`: integração do Photopea (Live Messaging, API hash, salvar no projeto, responsividade).
- `tests/ffmpeg.cjs`: integração do FFmpeg WebAssembly (conversão, extração de áudio, compressão, GIF).
- `tests/ai-local.cjs`: testes das integrações de Transformers.js / Whisper (transcrição/legendas locais) e Google MediaPipe (segmentação de pessoas e auto-enquadramento facial).
- `tests/code-animation.cjs`: testes do painel Código (GSAP isolado). Precisa de internet. Rode com `CHROMIUM_PATH` apontando para o Chromium do Playwright se não houver `/usr/bin/chromium`.

## Seções de app.js (busque pelo título `/* ===... nome ===... */`)
| Seção | O que tem |
|---|---|
| utilidades | helpers, FONTS, ASPECTS, EASES, curvas Bézier, PROPS animáveis, COLOR_LOOKS, TRANSITIONS, MEDIA_FITS, TEXT_ANIMS, BLENDS |
| estado | objeto `S`, mapas `A` (arquivos carregados) e `VIDS` (vídeos por camada) |
| arquivos (IndexedDB) | `idb`, `loadAsset`, `registerAsset`, `syncMedia` (vídeo), `scheduleAudio` (som) |
| Lottie / dotLottie | tipo `lottie` no modelo/painel/importação; `MotionLottie` valida arquivos e renderiza o quadro síncrono em `drawShape`; `freezeFrame` também captura Lottie |
| modelo | `newProject`, `defaultS` (campos de cada tipo), `makeLayer`, `normalize`, `val` (valor no tempo), keyframes, `transitionState` (envelope de entrada/saída), `worldMatrix`, `setParent` |
| render | `drawText` (animações de texto), `drawPath`, `drawFramedMedia` (contain/cover/stretch e foco), `drawShape`, `drawLayer` (filtros, looks, transições, sombra, brilho), `renderFrame` (máscara de recorte) |
| efeitos, partículas e câmera | `GL` (WebGL compartilhado, `GL_FRAG` com os shaders), `chromaSource`, `applyFx` (camada fx em `renderFrame`), `PARTICLES`/`drawParticles` (sem estado), `activeCamera`/`cameraMatrix` (entra no `parentMatrix` das camadas raiz), `textPathPoints`/`pointOnPath` |
| batida, narração, batidas prontas e figurinhas | `detectBeats` (BPM por autocorrelação), `beatsOf`/`projectBeats` (batidas no tempo da timeline), `magnet` (gruda nas batidas), `analyzeBeats`, `applyBeatPreset` (beatPulse/beatFlash/beatShake), `beatMontage`, `BEAT_STYLES`/`synthBeat`/`beatMakerModal`, `recordVoiceModal` (MediaRecorder), `EMOJIS`, `ICONS` (path SVG 24x24), `iconPath`, `drawIcon`, `stickersModal` |
| câmera lenta (velocidade e rampas) | `RAMPS`, `speedAt`, `srcTime` (tempo da linha → tempo do arquivo, integral exata), `timeAtSrc` (inversa), `applyRamp` (mantém o mesmo trecho e aumenta o projeto até 600 s), `automateRate` (som segue a curva), quadros suaves: `blendInfo`, `video2For`/`VIDS2`, `nextFrameOf`, `blendCanvas`; `exactSeeks` impede o `syncMedia` de mexer nos vídeos durante uma busca exata |
| seleção no preview | caminho de movimento, caneta, alças, `fitStage`, arrastar no canvas |
| tempo e reprodução | `refreshTime`, `play`, `pause` |
| linha do tempo | `renderTimeline`, forma de onda, arrastar keyframes e blocos, botão de mudo, snap magnético |
| painel de propriedades | `renderPanel` (cabeçalho fixo e cartões), `layerPanel`, `projectPanel`, `syncPanel`, editor de curva `setupCurve`, eventos do painel |
| animações prontas | `applyPreset` (fade, zoom, slide, flash, shake, bounce, etc.) |
| camadas | adicionar, duplicar, dividir (`splitLayer`), congelar quadro (`freezeFrame`), excluir, `setAspect`, importação de mídia |
| desfazer / salvar | `commit` (sempre chame após uma mudança), `scheduleSave` (status real em #saveStatus), localStorage, `setProject` |
| exemplo inicial | `demoProject` |
| exportação | `exportModal`, `exportVideo` (MediaRecorder + Web Audio, fallback MP4 → WEBM) |
| exportação rápida | `fastExport` (WebCodecs + mp4-muxer), `pickVideoCodec` (cache por tamanho e fps; H.264 com nível de `avcLevel`, depois H.265, VP9 e AV1; 4K a 30 e 60 fps), `videoBitrate` (até 80 Mbps), `renderAudioMix` (OfflineAudioContext), `seekVideosExact`, `exportGif` (gifenc), `exportPng`, `fileReady`. `renderFrame(c, t, {k, transparent})` desenha em qualquer escala (`RK`) |
| IA | `gemini()` (nuvem), legendas e transcrição local com Transformers.js / Whisper (`getWhisper`, `runCaptionsWhisper`), Google MediaPipe (`segmentPersonMediaPipe`, `mediaPipeCutPerson`, `mediaPipeFaceAutoFrame`), remoção de fundo (@imgly) |
| edição de vídeo com IA | `editWithAIModal`, `beginAIEdit` (áudio/quadros em partes), `reviewAIEdit`, `applyAIEditAssembly`, `restoreAIEditOriginal`; `gemini(parts,json,{signal,temperature})` |
| animação por código (GSAP) | `codeWorkerMain` (roda no worker isolado), `runCodeSandbox`, `simplifySeries`, `bakeCode`, `applyCode`, `codeModal`, `CODE_EXAMPLES`, `aiWriteCode` |
| bibliotecas abertas | `LIBS` e `lib()` carregam sob demanda: Lucide (`loadLucide`, `lucideD`, `lucideGridHtml`), wavesurfer (`mountPanelWave`, forma de onda no painel de áudio), mp4box (`videoInfo`, rotação e fps no `loadAsset` de vídeo), opentype (`pickFont`, `addCustomFont`, `registerFontFace` para fontes próprias) |
| rastreio e cortes por cena | `trackLayer` (grava keyframes de x e y a partir de `matchPatch`, com modelo fixo), `cutByScenes` (diferença de cor entre quadros pequenos e `splitLayer`), `grayOf`, `patchOf` |
| desfoque de movimento e agulha | `renderFrame` (envelope, média de `MB_SAMPLES` instantes dentro do obturador `P().motionBlur`) chama `renderFrameOnce`; `clipPlayhead` esconde a agulha sob a coluna de camadas |
| modelos prontos | `TEMPLATES` (cada um é uma função que cria camadas), miniaturas |
| photopea | `openPhotopea`, `closePhotopea`, `photopeaChoiceModal`, `applyPhotopeaResult`, Live Messaging (`saveToOE`), integração de atalhos e arquivo |
| FFmpeg | `getFFmpeg`, `ffmpegModal` (converter para MP4 H.264, extrair áudio WAV, comprimir CRF, gerar GIF animado, mudo, comandos livres) |
| abas e folhas (celular) | logo após `const app`: `phoneMQ`, `openSheet`/`closeSheet`, estado em `app.dataset.sheet`, clique delegado (abas, X, fundo, encaminhamentos), fechamento antes de ações de chip e de Projeto |
| biblioteca de projetos e tela inicial | `libAll/libGet/libPut/libDel` (fila `libQueue`), `libSave` (registro com miniatura), `migrateStore`, `showHome/showEditor/enterEditor/goHome` (history: `#editor`), `startProject` (sempre id novo), `openProjectById`, `renderHome`, renomear/duplicar/excluir, `newProjectModal` (formatos) |
| menu, modal, teclado, PWA, início | resto da interface e inicialização |

## Modelo de dados (resumo)
Projeto: `{ name, aspect, width, height, fps, duration, background, layers[], assets{} }`.
Camada: `{ id, type, name, start, end, visible, parent, p{valores fixos}, kf{prop:[{t,v,e,bz?}]}, s{campos do tipo, flipH, flipV, speed, muted}, codeKf?[props geradas por código], fromCode? }`. Projeto também guarda `code` (último código aplicado) e `id` (registro na biblioteca).
Velocidade: `s.speed` (0.1–4 em vídeo/áudio), `s.rampPts` ([[t, multiplicador]] em tempo absoluto, como keyframes; vazio = constante), `s.ramp` (id do modelo), `s.smoothSlow` (quadros suaves). Use sempre `srcTime`/`timeAtSrc`, nunca `trimIn + (t - start) * speed`.
Armazenamento: IndexedDB `motion-editor` v2 com `assets` e `projects` (um registro por projeto: json, miniatura, data). `STORE_KEY` guarda a cópia rápida do projeto aberto e `LAST_KEY` o id dele. `cleanupAssets` só apaga mídia que nenhum projeto da biblioteca usa.
`layers[0]` fica na frente. Arquivos (imagem, vídeo, áudio) ficam no IndexedDB; `assets` guarda só nome e tipo.

Novos campos em `s`: `colorLook`, `lookIntensity`, `transitionIn/Out`, `transitionInDuration/OutDuration`, `mediaFit`, `focalX/Y`. `transitionStart/End` são âncoras opcionais preservadas pelo split, deslocadas ao mover o clipe e removidas ao editar a borda ou a transição correspondente. Projetos antigos usam look Original, sem transição e enquadramento livre.

Música: camada de áudio guarda `s.beats` (segundos do arquivo, antes de corte e velocidade) e `s.bpm`. A régua e o painel Código usam `projectBeats()`. Tipo `icon`: `s.iconName`, `s.d` (path SVG), `s.size`, mais preenchimento/degradê/contorno/brilho das formas.

Tema do editor: tokens no início de `style.css`; `theme` em app.js lê essas variáveis para alças, caminho de movimento, curvas e ondas de áudio. Cores de conteúdo dos projetos são independentes. No desktop, propriedades ocupam a coluna direita inteira; em <=860 px a página empilha os blocos com rolagem, sem reduzir a prévia em telas curtas.

Edição IA: `sourceStart/End` e transcrição são relativos ao início do trecho enviado, em segundos de fonte. `assemble` soma `sourceFrom` no trim e divide por speed na timeline, fecha pausas e limita a duração a quadros completos. Projeto guarda `aiEdit.original` (um único backup, sem aninhamento), request/summary/sourceAsset/localOnly. Assets originais ficam declarados; aplicar/restaurar preserva undo e não chama cleanupAssets. Modais cancelam `aiEditJob`; snapshots rejeitam resultados de uma versão antiga do projeto.

Lottie: `assets.kind='lottie'` guarda o blob original (JSON ou ZIP). `s` tem `animationId`, `trimIn`, `speed`, `loop`, `reverse`, `w/h` e enquadramento. `TIMED_MEDIA` inclui Lottie para cortes/duração; `MEDIA` continua só vídeo/áudio para som. Um player/canvas por asset, reposicionado/resize síncrono antes de cada draw; metadados separados por animationId. Tempo de fonte `(t-start)*speed+trimIn`, com módulo da duração em loop; frame usa a taxa da fonte. Runtime limita o canvas e não inicia player/state machines. Cargas descartadas destroem o player; arquivos só são registrados após validar. `sw.js` guarda ESM/WASM fixos após primeiro uso, além de lottie.js no shell.

## Celular como app (até 860 px)
- Abas: `nav.tabbar > button[data-sheet-open]` (add, ia, props, project). Aba aberta tem `aria-pressed="true"`. Tocar a aba aberta fecha.
- Folhas (`.sheet`, `position: fixed` acima de `--tab-h`): `.add-bar` (folhas add e ia; grupos com `data-g` e `.add-title`; `#app[data-sheet=ia]` mostra só `data-g=ia`), `#panel` (props; cabeçalho com `.fwd-play` e `.sheet-close`), `#menu` (project; `.menu-group` com títulos). Scrim: `.sheet-scrim` (último filho de `#app`).
- Estado: só `app.dataset.sheet` (`add`, `ia`, `props`, `project`). CSS usa `#app[data-sheet=...]`. No celular o atributo `hidden` do `#menu` não controla mais a visibilidade.
- Abrir: aba; toque no nome da camada (`.tl-label`); toque sem arraste sobre a camada no preview (`drag.tap` em `endDrag`, menos de 8 px). Não abre ao adicionar camada, ao desfazer nem ao usar IA.
- Fechar: X (`[data-sheet-close]`), fundo, Esc (no teclado, Esc e atalhos ficam bloqueados com folha aberta), aba aberta, ou ação de chip ou item do Projeto (`closeSheet(false)` antes da ação).
- Encaminhamentos: `button[data-forward="ID"]` chama `#ID.click()` sem duplicar IDs. Usados: `btnAI` (IA), `btnInstall` (Projeto, copiados ao abrir) e `btnPlay` com `data-keep` (cabeçalho de Propriedades).
- Inputs de arquivo (`#mediaInput`, `#photopeaFileInput`, `#ffmpegFileInput`, `#projectInput`) ficam no fim de `#app`, escondidos.
- `#btnMenu`, `#btnAI`, `#btnInstall` e `#btnFFmpeg` ficam `display: none` no celular. A ação de FFmpeg está em Projeto > Ferramentas (`data-menu="ffmpeg"`).
