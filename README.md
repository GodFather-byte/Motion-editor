# Motion Editor

Editor de motion graphics que roda direto no navegador e pode ser instalado como app (PWA), no celular ou no computador. Sem servidor e sem build: HTML, CSS e JavaScript puro.

**App:** https://godfather-byte.github.io/Motion-editor/

## Recursos

**Creator Workstation OS**
- Dock com Vídeo, Áudio, Pixel, Roteiro e Arquivos. O editor de vídeo original continua no mesmo DOM, inclusive as folhas do celular.
- Todos os módulos usam o **projeto aberto do editor**, seu histórico de desfazer/refazer e sua biblioteca. Trocar de módulo não cria outro projeto.
- Arquivos compartilhados ficam no OPFS em `creator-workstation/<id-do-projeto>/{audio,pixel,video}`. Revisões são imutáveis para permitir desfazer; metadados e vínculos ficam em `project.workstation`. Não apague os dados do site sem baixar seus arquivos.
- **Link** envia novas mídias salvas e atualiza as camadas vinculadas nas substituições, sem duplicar clipes. Desligado, só envia por ação explícita (Enviar ou Salvar e enviar). Fontes importadas/gravadas para Áudio e Pixel ficam no módulo até exportar o mix/overlay; fontes enviadas manualmente também recebem atualizações vinculadas. Gravações de câmera sempre aguardam confirmação. BroadcastChannel aplica as mesmas regras entre abas do projeto.
- A barra mostra uso / quota e espaço livre em MB/GB (estimativa da origem, incluindo outros dados do app). Atualiza a cada 10 segundos, ao salvar arquivos e ao voltar à aba; pausa o monitor em segundo plano e no fechamento. APIs sem estimativa mostram valores indisponíveis, não zero fictício.
- APIs públicas: `WorkstationShell` (ativação, projeto, Link e armazenamento), `ProjectAssetBus` (OPFS/eventos), `AudioLabModule`, `PixelStudioModule` e `AIScriptCamModule` expõem as operações reais dos módulos. `getProject()`/`getState()` e `ProjectAssetBus.list()`/`get(key)` devolvem cópias, sempre do projeto atual. O estado continua único em `project.workstation`; `CreatorWorkstation` permanece como interface legada.
- `ProjectAssetBus.save(blob, kind, name, {key, send, role, suppressAutoSend, duration})`, `read(key)` e `send(key)` reutilizam OPFS e os vínculos existentes. `subscribe(listener, {replay: true})` entrega metadados de arquivos já existentes (`type: 'existing'`) e eventos CustomEvent `workstation:asset` (`saved`/`received`), filtrados pelo projeto atual; retorna uma função de cancelamento. Também há `unsubscribe(listener)`. `role: 'source'` reserva fontes dos módulos; `suppressAutoSend: true` exige envio explícito, inclusive entre abas. Os eventos legados `workstation:asset-saved` e `workstation:asset-received` continuam disponíveis.
- **Áudio:** importe várias faixas, ajuste início/volume/mudo ou grave o microfone. Espectro e onda usam Web Audio/rAF. Preset de voz: passa-altas 80 Hz, presença 3 kHz (+4 dB/Q 1), compressor −24 dB, knee 30, ratio 12:1, ataque 3 ms/release 250 ms. Monitor opcional (use fones), desligado inicialmente. O mix aplica o processamento aos samples via OfflineAudioContext, salva WAV PCM estéreo ou WebM em tempo real e envia à timeline.
- **Pixel:** imagens e textos em camadas, seleção, arraste, ordem, remoção, contorno/neon/degradê e ajustes de brilho, contraste, saturação e matiz. Importa o quadro exato da composição de vídeo na resolução do projeto. Salva PNG com transparência e o envia como overlay vinculado.
- **Roteiro:** tabela editável de áudio/vídeo, geração estruturada com o LanguageModel local pelo adaptador ChromeAIService (sem respostas simuladas), teleprompter com velocidade ajustável e acompanhamento opcional de palavras reconhecidas. Captura tela e/ou webcam, sobrepõe a webcam na tela e mistura áudio de tela/microfone. Ao finalizar, salva e pergunta “Deseja abrir na timeline e aplicar o corte automático de silêncios agora?”. Ambas as escolhas abrem Vídeo; só “Enviar e cortar silêncios” abre também o cortador nativo.
- Sem pedidos de câmera/microfone ao abrir. Trocar de projeto/módulo cancela tarefas antigas e desliga os dispositivos; finalizar também libera todas as pistas. O teleprompter não aparece no vídeo gravado.
- Requer HTTPS/localhost e APIs compatíveis. Sem OPFS, ações de arquivo/gravação ficam indisponíveis; erros de gravação não são apresentados como salvamento. LanguageModel, captura de tela, bateria e reconhecimento de fala variam por navegador/dispositivo. Reconhecimento de fala é opt-in e pode usar o serviço do navegador; apenas a geração de roteiro é garantidamente local. WAV é a alternativa quando WebM não é suportado.
- O OPFS é privado por origem/dispositivo, não é uma pasta pública nem uma sincronização em nuvem. Arquivos `.motion.json` continuam sendo o formato do editor; para transportar a sessão inteira, baixe também os arquivos OPFS pelo módulo Arquivos.

**Camadas**
- Texto, retângulo, círculo, estrela, traço livre (caneta), imagem, vídeo, música, Lottie / dotLottie e grupo.
- Grupos e "Seguir camada": uma camada herda posição, giro, escala e opacidade de outra.
- Máscara de recorte: a camada só aparece onde a camada de baixo existe.

**Animação**
- Keyframes em posição, escala, rotação, opacidade, desfoque, brilho, luminosidade, contraste, saturação, matiz e "desenhado %" do traço.
- 8 curvas prontas e editor de curva Bézier personalizada.
- Caminho de movimento visível no preview, com pontos arrastáveis.
- Texto animado: máquina de escrever, subir, estourar, aparecer, palavra por palavra, embaralhar, onda, letras pulando, glitch e neon.
- Animações prontas: zoom, deslizar, subir, cair quicando, surgir do desfoque, pulsar, girar, sumir e desenhar traço.

**Visual**
- Degradê linear e radial, contorno, sombra, brilho externo e modos de mistura.
- Fundo arredondado e ajustável atrás de qualquer texto, útil para títulos e legendas sobre cenas claras.

**Vídeos curtos**
- Estúdio de Legendas com cinco estilos próprios: Destaque, Faixa Motion, Impacto, Conversa e Limpo. Aplique um estilo ao grupo inteiro e depois refine cada trecho.
- Marcadores de roteiro para entradas, cortes e revisões; os clipes também grudam neles ao arrastar na timeline.
- Guia de área segura para projetos verticais, visível somente na prévia e fora da exportação.

**Lottie e dotLottie**
- Importe animações Lottie `.json` e pacotes `.lottie` v1/v2 pelo botão **Lottie / dotLottie** abaixo da prévia. Arquivos de até 20 MB, com animações de até 10 minutos.
- Controle velocidade, início, repetição e reprodução reversa. Se o pacote tiver várias animações, escolha uma no painel. Dividir e cortar na timeline mantém o momento correto da animação.
- Use posição, escala, rotação, opacidade, keyframes, grupos, máscaras, looks e transições do editor. **Congelar quadro** cria uma imagem transparente editável.
- As animações entram no vídeo MP4/WEBM, GIF e PNG. Transparência é preservada nas saídas que a suportam. Salvar `.motion.json` inclui o arquivo original, e o salvamento automático mantém a animação neste aparelho.
- Imagens precisam estar embutidas no JSON ou dentro do pacote dotLottie. Exporte textos como formas para preservar a fonte. A animação importada é uma camada; suas formas internas não são editadas separadamente. Áudio e interatividade do pacote não são reproduzidos.
- O player baixa na primeira importação, com internet, e fica no cache do app para uso offline.

**Som e vídeo**
- Vídeo e música na linha do tempo, com forma de onda, volume, entrada/saída suave e corte.
- Dividir na agulha (`S` ou `Ctrl+K`), mudar velocidade de 0,25x a 4x, silenciar (`M`) e congelar quadro.
- Enquadrar sem deformar: mostrar inteiro ou preencher e recortar, com ponto focal horizontal e vertical. Use **Quadro do projeto** para adaptar um vídeo horizontal ao formato vertical.
- Transições de entrada e saída com duração ajustável: dissolver, zoom suave e cortina lateral (imagem/vídeo). Preservam os keyframes e continuam no ponto correto após dividir um clipe.
- Seis looks de cor com intensidade: Cinema, Vibrante, Quente, Frio, Vintage e Preto e branco. Combinam com os ajustes manuais de cor.
- Exportação em MP4 (Chrome recente e Safari) ou WEBM, com som. Frame atual em PNG.

**Efeitos**
- Chroma key (fundo verde) em imagens e vídeos, com tolerância e suavidade.
- Camada de efeito (WebGL) que age em tudo abaixo dela: vinheta, granulação, VHS, glitch, separação RGB, pixelado e ondas.
- Partículas: confete, faíscas, neve, fumaça, bolhas e brilhos, calculadas pelo tempo (funcionam na exportação e ao arrastar o cursor).
- Câmera virtual: posição, zoom e rotação da cena inteira, com profundidade por camada ("Acompanha a câmera %") e movimentos prontos.
- Texto curvo e texto seguindo um traço; um traço pode virar máscara da camada de cima.

**Música e redes sociais**
- Detectar batidas: o editor ouve a música, acha o BPM e marca cada batida na régua. Ao mover ou cortar clipes, as bordas grudam nas batidas.
- Animações "Na batida" para qualquer camada: pulsar, piscar e tremer em cada batida.
- Montagem na batida: fotos e vídeos se encaixam um por batida (ou a cada 2 ou 4), repetindo se faltar mídia.
- Batidas prontas sem direitos autorais, geradas no aparelho: Eletrônica, Funk, Trap e Lo-fi, com BPM e duração ajustáveis.
- Gravar narração pelo microfone, com medidor de volume; entra na linha do tempo na posição da agulha.
- Figurinhas: emojis e 16 ícones vetoriais (coração, curtir, sino, fogo, play…) que aceitam cor, degradê, contorno e brilho.
- No painel Código, `beats` traz os tempos das batidas: `beats.forEach(b => tl.to(layer('Título'), { scale: 1.2, duration: 0.1, yoyo: true, repeat: 1 }, b))`.

**Exportação**
- MP4 rápido quadro a quadro (WebCodecs): H.264 + AAC quando o aparelho tem, senão VP9 + Opus. Não pula quadros e continua com a aba em segundo plano. 720p, 1080p ou 4K, 24/30/60 fps.
- GIF animado (com fundo transparente opcional) e PNG do quadro atual (também transparente).
- Gravação em tempo real (MediaRecorder) continua como alternativa em navegadores sem WebCodecs.
- O preview desenha na resolução da tela enquanto toca, bem mais leve no celular.

**Animação por código (GSAP)** (botão Código)
- Escreva a animação em JavaScript com GSAP 3 (`tl.from(layers, { y: '+=80', opacity: 0, stagger: 0.1 })`), ou peça para a IA escrever.
- O código vira keyframes normais, editáveis. `add()` cria camadas, `every(t => …)` calcula movimento quadro a quadro.
- Roda isolado (iframe sandbox + worker): não acessa arquivos nem chaves do app, e laço infinito é interrompido em 12 s.
- Precisa de internet na hora de aplicar, para baixar o GSAP.

**IA** (botão IA, usa o Gemini com a chave do próprio usuário)
- **Editar com IA**: analisa o som e as cenas de um vídeo, escolhe trechos conforme seu pedido, corta pausas, cria legendas e zoom nos destaques. Você revisa os cortes antes de aplicar.
- Criar animação a partir de uma descrição em texto.
- Legendas automáticas a partir da fala, sincronizadas e animadas.
- Remover fundo de imagens, no próprio aparelho.

Para editar um vídeo: importe o arquivo, toque em **Editar com IA**, descreva o resultado e escolha duração, formato e opções. Configure sua chave em **IA → Configurar chave do Gemini**. A análise envia ao Gemini o áudio e três quadros reduzidos por minuto do trecho escolhido; não envia o arquivo de vídeo completo. O serviço pode cobrar pelo uso.

Cada análise cobre até 10 minutos de fonte, em partes de 60 segundos. A montagem final tem até 2 minutos. Os tempos de início/fim são do arquivo original; corte e velocidade são respeitados. Vídeos sem áudio legível podem ser analisados visualmente, sem legendas. O enquadramento usa um ponto focal por clipe, sem rastreamento contínuo de pessoas.

Na revisão, desmarque os trechos que não quiser e toque em **Aplicar e ver prévia**. Clipes e legendas ficam editáveis na timeline e podem ser exportados normalmente. Confira o texto e os cortes sugeridos antes de exportar. **Desfazer** recupera a versão anterior; **Editar com IA → Voltar ao original** restaura o projeto original mesmo após recarregar. O backup do original e os arquivos permanecem na edição salva.

**Cortar pausas sem IA** funciona no aparelho, sem chave nem envio de dados: remove trechos de som baixo, sem escolher destaques ou criar legendas. Música contínua pode impedir a detecção de pausas.

**Produto**
- 8 modelos prontos.
- Salvamento automático (arquivos no IndexedDB), desfazer/refazer, salvar e abrir `.motion.json`, funciona offline.

## Publicar (GitHub Pages)

Settings → Pages → *Deploy from a branch* → branch **main**, pasta **/ (root)** → Save.

## Rodar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Para usar as novas ferramentas, selecione uma camada e procure **Enquadrar**, **Looks de cor** e **Transições** no painel de propriedades. Os efeitos também são aplicados na exportação.

Testes de navegador, no ambiente de desenvolvimento com Playwright, Chromium, FFmpeg, Python e curl disponíveis:

```bash
node --check app.js
node --check lottie.js
node --test tests/preview-controls.cjs # zoom da prévia, layout móvel e salvar por atalho
node --test tests/video-editor.cjs
node --test tests/code-animation.cjs   # painel Código (baixa o GSAP, precisa de internet)
node --test tests/export.cjs           # exportação rápida, GIF e preview leve (precisa de internet)
node --test tests/effects.cjs          # câmera, efeitos, chroma key, partículas, texto curvo
node --test tests/music.cjs            # batidas, montagem, batidas prontas, narração, figurinhas
node --test tests/ai-edit-plan.cjs tests/ai-edit.cjs # edição por pedido, corte de pausas e Gemini simulado
node --test tests/lottie.cjs           # runtime real, JSON/dotLottie v1/v2, cortes, transparência e exportação
node --test tests/short-form.cjs       # legendas, marcadores, guia seguro e 360 px
node --test tests/workstation-unit.cjs tests/workstation.cjs # OS, OPFS/Link, áudio/Pixel/roteiro/captura e 360 px
```

O teste inicia seu próprio servidor e gera mídia temporária. Confere recorte, cores, transições, divisão, desfazer/refazer, persistência, exportação e áudio em diferentes velocidades; inclui layout de 360 px. Defina `CHROMIUM_PATH` se o Chromium não estiver em `/usr/bin/chromium`. Essas ferramentas são apenas para testes; o app continua sem instalação de dependências ou build.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura da interface |
| `style.css` | Visual e layout (desktop e celular) |
| `app.js` | Editor completo: modelo, render, áudio/vídeo, timeline, painel, IA, modelos, exportação |
| `ai-edit.js` | Validação do plano, detecção de silêncio e remapeamento de clipes/legendas |
| `lottie.js` | Player vetorial sob demanda, leitura de JSON/dotLottie e render sincronizado com a timeline |
| `sw.js` | Cache offline. Mude `VERSION` a cada atualização |
| `manifest.webmanifest`, `icons/` | Dados de instalação do app |

## Apoiar o projeto

O Motion é gratuito. Para receber doações, preencha o objeto `DONATE` no topo da seção "apoiar o projeto" de `app.js` (chave PIX e/ou links). Sem nada preenchido, o item "Apoiar o projeto" não aparece no menu.

## Código aberto e licenças de terceiros

Motion Editor é 100% código aberto, sem plano pago e sem marca d'água.

Bibliotecas usadas, todas carregadas sob demanda de CDN com versão fixa:

| Biblioteca | Para quê | Licença |
|---|---|---|
| [dotlottie-web](https://github.com/LottieFiles/dotlottie-web) 0.81.0 | Lottie e dotLottie | MIT |
| [Lucide](https://lucide.dev) (ícones via @iconify-json/lucide 1.2.130) | Figurinhas de traço | ISC |
| [wavesurfer.js](https://wavesurfer.xyz) 7.12.12 | Forma de onda do áudio | BSD-3-Clause |
| [mp4box.js](https://github.com/gpac/mp4box.js) 2.4.1 | Metadados de MP4 e MOV | BSD-3-Clause |
| [opentype.js](https://opentype.js.org) 1.3.4 | Leitura de fontes próprias (.ttf, .otf) | MIT |
| [@imgly/background-removal](https://github.com/imgly/background-removal-js) | Remoção de fundo | AGPL-3.0 |

Este projeto é licenciado sob **AGPL-3.0** (arquivo [LICENSE](LICENSE)). Ela é necessária por causa da remoção de fundo, que também é AGPL-3.0.

## Atalhos

`Espaço` reproduz/pausa · `K` keyframe em todas · `Shift+M` cria marcador · setas movem (Shift = 10 px) · `,` `.` quadro a quadro · `Ctrl+Z` desfaz · `Ctrl+D` duplica · `Ctrl/Cmd+S` salva o projeto `.motion.json` · `Delete` exclui · `Shift` ao girar prende em 15°. Atalhos de edição não atuam enquanto você digita em campos.

Na prévia, use `−` e `+` para ampliar ou reduzir sem mudar a composição; toque na porcentagem para ajustar o quadro à área.
