# Mapa de Código (v26)
O Motion Editor é escrito em HTML, CSS e JavaScript puros (vanilla). Este arquivo serve para o LLM entender onde estão as coisas.
Foi projetado para ser minificado em uma única tag `<script>`. Funções são declaradas direto na raiz ou logo após sua dependência. Ordem dos blocos em `app.js`:

| Bloco | O que faz |
| --- | --- |
| utilidades | `$`, `$$`, `clamp`, `uid`, `esc`, `round`, `wait`, `hexA`, blobToDataURL |
| fontes, curvas e cores | `EASES`, `BEZ_OF`, `bezier`, array `COLORS` e `COLOR_NAMES`, parse de cor |
| atalhos de tempo e snap | `kfTimes`, `parentMatrix`, `localPt`, snap magnético `snap`, `isAnimated` |
| som (geração) | `S` (AudioContext), compressor, `beep` |
| estado e dados | IndexedDB (`openDB`), `P()` (projeto), `S` (time, dragging, etc), `setProp`, formatações (`val`, `kfIndex`), `toast` |
| arquivos pesados (IndexedDB) | carrega mídias (`loadAsset`, `cleanupAssets`, blob de IndexedDB); cria video e audio tags. Exporta blobs limpos/hacks offline; `assetThumb` |
| camadas (definições) | matriz de propriedades visuais para cada tipo de camada (video, audio, text, shape, image, icon, path). `makeLayer`, `normalize` |
| render | O loop central de desenho e pipeline do projeto. `drawFrame` chama `drawLayer`, que chama o desenhista do tipo correspondente e cuida de filtros (desfoque, chromakey, transformações, opacidade, crop). |
| efeitos, partículas e câmera | shaders WebGL compartilhados (`GL`, `GL_FRAG`), `PARTICLES` (sem estado, função pura), `activeCamera` (aplica perspectiva global na cena inteira) |
| batida, narração e figurinhas | `detectBeats` (análise de BPM via autocorrelação), arrays com nome e ícones, modais |
| câmera lenta | `RAMPS`, `speedAt`, integrais e inversas `srcTime`/`timeAtSrc` para manter duração e suavizar frames e som. Quadros suaves e cortes sem recodificação |
| UI do preview | ferramentas (seleção, caminhos, nodes das curvas, redimensionamento com alças no canvas) |
| navegação no tempo | controles, manipulação do ponteiro, play/pause |
| linha do tempo | desenha blocos de vídeo e ondas de áudio (`drawTimeline`), manipula cliques na track |
| painel de propriedades | define os cards html de opções para cada tipo de layer, evento 'input' otimizado, editor gráfico de curvas customizadas de keyframes |
| animações prontas | `applyPreset` e definições (escala, posição e fade predefinidos) |
| ações de projeto/camadas | undo/redo, duplicar, deletar, `setProject`, exportar media |
| exportador MP4 e GIF | `fastExport` com WebCodecs, fallback em MediaRecorder + Web Audio |
| IA e legendas | integração com Google Gemini e Hugging Face Transformers local (Whisper). Funções de prompts `gemini()`. Geração de vídeo e recortes. |
| animação via código | runtime isolado num Worker para manipular matrizes em Javascript limpo (GSAP fallback via código) e interface modal. |
| bibliotecas externas nativas | Lucide icons, wavesurfer.js e MP4Box injectados por CDN na função `lib()`. |
| track/smart | rastreamento por template match simple e recortes automáticos |
| motion blur | acúmulo de buffers renderizados entre a diferença dos quadros (`renderFrameOnce`) |
| modelos prontos | templates pré formatados gerando múltiplos layers |
| Photopea | Integração completa com iframe (mensagens de via dupla) para live editing de raster image e salvamento automático sem sair do editor. |
| FFmpeg WASM | processamento local para tasks indisponíveis via WebCodecs nativo (compressões complexas e encoders específicos) |
| abas e UI mobile | Folhas modais deslizando, gestão via atributos dataset `data-sheet`, touch event router |
| home page e lib | Galeria de "Meus Projetos" offline, persistência multi projeto (migrado p/ DB `projects` no indexedDB), manipulação de nomes / deletar. |
| App Lifecycle e Service Worker | init, `showHome`, load do project 1º frame, boot do SW (`sw.js`) |

## Modelo de dados (resumo)
Projeto: `{ name, aspect, width, height, fps, duration, background, layers[], assets{} }`.
Camada: `{ id, type, name, start, end, visible, parent, p{valores fixos}, kf{prop:[{t,v,e,bz?}]}, s{campos do tipo, flipH, flipV, speed, muted}, codeKf?[props geradas por código], fromCode? }`. Projeto também guarda `code` (último código aplicado) e `id` (registro na biblioteca).
Velocidade: `s.speed` (0.1–4 em vídeo/áudio), `s.rampPts` ([[t, multiplicador]] em tempo absoluto, como keyframes; vazio = constante), `s.ramp` (id do modelo), `s.smoothSlow` (quadros suaves). Use sempre `srcTime`/`timeAtSrc`, nunca `trimIn + (t - start) * speed`.
Armazenamento: IndexedDB `motion-editor` v2 com `assets` e `projects` (um registro por projeto: json, miniatura, data). `STORE_KEY` guarda a cópia rápida do projeto aberto e `LAST_KEY` o id dele. `cleanupAssets` só apaga mídia que nenhum projeto da biblioteca usa.
`layers[0]` fica na frente. Arquivos (imagem, vídeo, áudio) ficam no IndexedDB; `assets` guarda só nome e tipo.
