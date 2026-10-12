# Mapa do repositório

## Arquivos
- `index.html`: estrutura da interface (barra superior, preview, botões de adicionar, linha do tempo, painel, modal).
- `style.css`: visual. Variáveis no topo; bloco `@media (max-width: 860px)` é o layout de celular.
- `app.js`: o editor inteiro, num único IIFE, dividido em seções (abaixo).
- `pro-config.js`: chave pública ECDSA e textos/preço do plano Pro.
- `sw.js`: service worker (cache offline). Mude `VERSION` a cada release.
- `manifest.webmanifest`, `icons/`: instalação como app.
- `tools/licenca.mjs`, `tools/licenca.py`: geram chaves de licença Pro (precisam do `.pem`, que não fica no git).

## Seções de app.js (busque pelo título `/* ===... nome ===... */`)
| Seção | O que tem |
|---|---|
| utilidades | helpers, FONTS, ASPECTS, EASES, curvas Bézier, PROPS animáveis, TEXT_ANIMS, BLENDS |
| estado | objeto `S`, mapas `A` (arquivos carregados) e `VIDS` (vídeos por camada) |
| arquivos (IndexedDB) | `idb`, `loadAsset`, `registerAsset`, `syncMedia` (vídeo), `scheduleAudio` (som) |
| modelo | `newProject`, `defaultS` (campos de cada tipo), `makeLayer`, `normalize`, `val` (valor no tempo), keyframes, `worldMatrix`, `setParent` |
| render | `drawText` (animações de texto), `drawPath`, `drawShape`, `drawLayer` (filtros, sombra, brilho), `renderFrame` (máscara de recorte) |
| seleção no preview | caminho de movimento, caneta, alças, `fitStage`, arrastar no canvas |
| tempo e reprodução | `refreshTime`, `play`, `pause` |
| linha do tempo | `renderTimeline`, forma de onda, arrastar keyframes e blocos, botão de mudo, snap magnético |
| painel de propriedades | `layerPanel`, `projectPanel`, `syncPanel`, editor de curva `setupCurve`, eventos do painel |
| animações prontas | `applyPreset` (fade, zoom, slide, flash, shake, bounce, etc.) |
| camadas | adicionar, duplicar, dividir (`splitLayer`), congelar quadro (`freezeFrame`), excluir, `setAspect`, importação de mídia |
| desfazer / salvar | `commit` (sempre chame após uma mudança), localStorage, `setProject` |
| exemplo inicial | `demoProject` |
| exportação | `exportModal`, `exportVideo` (MediaRecorder + Web Audio, fallback MP4 → WEBM) |
| IA | `gemini()` (generateContent com a chave do usuário), gerar animação, legendas, remover fundo |
| plano Pro | `verifyLicense`, `proModal`, `drawWatermark` |
| modelos prontos | `TEMPLATES` (cada um é uma função que cria camadas), miniaturas |
| menu, modal, teclado, PWA, início | resto da interface e inicialização |

## Modelo de dados (resumo)
Projeto: `{ name, aspect, width, height, fps, duration, background, layers[], assets{} }`.
Camada: `{ id, type, name, start, end, visible, parent, p{valores fixos}, kf{prop:[{t,v,e,bz?}]}, s{campos do tipo, flipH, flipV, speed, muted} }`.
`layers[0]` fica na frente. Arquivos (imagem, vídeo, áudio) ficam no IndexedDB; `assets` guarda só nome e tipo.
