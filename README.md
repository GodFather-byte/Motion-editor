# Motion Editor

Editor de motion graphics que roda direto no navegador e pode ser instalado como app (PWA), no celular ou no computador. Sem servidor e sem build: HTML, CSS e JavaScript puro.

**App:** https://godfather-byte.github.io/Motion-editor/

## Recursos

**Camadas**
- Texto, retângulo, círculo, estrela, traço livre (caneta), imagem, vídeo, música e grupo.
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

**Exportação**
- MP4 rápido quadro a quadro (WebCodecs): H.264 + AAC quando o aparelho tem, senão VP9 + Opus. Não pula quadros e continua com a aba em segundo plano. 720p, 1080p ou 4K (Pro), 24/30/60 fps.
- GIF animado (com fundo transparente opcional) e PNG do quadro atual (também transparente).
- Gravação em tempo real (MediaRecorder) continua como alternativa em navegadores sem WebCodecs.
- O preview desenha na resolução da tela enquanto toca, bem mais leve no celular.

**Animação por código (GSAP)** (botão Código)
- Escreva a animação em JavaScript com GSAP 3 (`tl.from(layers, { y: '+=80', opacity: 0, stagger: 0.1 })`), ou peça para a IA escrever.
- O código vira keyframes normais, editáveis. `add()` cria camadas, `every(t => …)` calcula movimento quadro a quadro.
- Roda isolado (iframe sandbox + worker): não acessa arquivos nem chaves do app, e laço infinito é interrompido em 12 s.
- Precisa de internet na hora de aplicar, para baixar o GSAP.

**IA** (botão IA, usa o Gemini com a chave do próprio usuário)
- Criar animação a partir de uma descrição em texto.
- Legendas automáticas a partir da fala, sincronizadas e animadas.
- Remover fundo de imagens, no próprio aparelho.

**Produto**
- 8 modelos prontos (4 grátis e 4 Pro).
- Versão grátis exporta com a marca "feito com Motion". O plano Pro tira a marca e libera os modelos exclusivos.
- Salvamento automático (arquivos no IndexedDB), desfazer/refazer, salvar e abrir `.motion.json`, funciona offline.

## Publicar (GitHub Pages)

Settings → Pages → *Deploy from a branch* → branch **main**, pasta **/ (root)** → Save.

## Plano Pro: como vender licenças

As licenças são assinadas com uma chave privada que **só você tem** (`motion-licenca-privada.pem`). O app confere a assinatura com a chave pública em `pro-config.js`, então ninguém consegue inventar uma licença.

1. Guarde `motion-licenca-privada.pem` num lugar seguro, fora do GitHub (o `.gitignore` já bloqueia `*.pem`).
2. Edite `pro-config.js` com o preço, o texto e o link de compra (Telegram, WhatsApp ou página de pagamento).
3. Quando alguém pagar, gere a chave e envie para a pessoa:

```bash
# Node
node tools/licenca.mjs nova "cliente@email.com" 30     # 30 dias
node tools/licenca.mjs nova "cliente@email.com" 0      # sem validade

# Python (dá pra usar dentro do seu bot do Telegram)
pip install cryptography
python tools/licenca.py "cliente@email.com" 30
```

No bot: `from licenca import gerar_licenca` e depois `gerar_licenca("cliente", 30)`.

O cliente cola a chave em **Seja Pro → Ativar**. Para trocar o par de chaves (invalida todas as licenças antigas): apague o `.pem` e rode `node tools/licenca.mjs iniciar`.

## Rodar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Para usar as novas ferramentas, selecione uma camada e procure **Enquadrar**, **Looks de cor** e **Transições** no painel de propriedades. Os efeitos também são aplicados na exportação.

Testes de navegador, no ambiente de desenvolvimento com Playwright, Chromium, FFmpeg e Python disponíveis:

```bash
node --check app.js
node --test tests/video-editor.cjs
node --test tests/code-animation.cjs   # painel Código (baixa o GSAP, precisa de internet)
node --test tests/export.cjs           # exportação rápida, GIF e preview leve (precisa de internet)
node --test tests/effects.cjs          # câmera, efeitos, chroma key, partículas, texto curvo
```

O teste inicia seu próprio servidor e gera mídia temporária. Confere recorte, cores, transições, divisão, desfazer/refazer, persistência, exportação e áudio em diferentes velocidades; inclui layout de 360 px. Defina `CHROMIUM_PATH` se o Chromium não estiver em `/usr/bin/chromium`. Essas ferramentas são apenas para testes; o app continua sem instalação de dependências ou build.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura da interface |
| `style.css` | Visual e layout (desktop e celular) |
| `app.js` | Editor completo: modelo, render, áudio/vídeo, timeline, painel, IA, Pro, modelos, exportação |
| `pro-config.js` | Chave pública e textos do plano Pro |
| `tools/` | Geradores de licença (Node e Python) |
| `sw.js` | Cache offline. Mude `VERSION` a cada atualização |
| `manifest.webmanifest`, `icons/` | Dados de instalação do app |

## Licenças de terceiros

A remoção de fundo usa [@imgly/background-removal](https://github.com/imgly/background-removal-js), licença **AGPL-3.0**. Enquanto o código deste app for público, isso está coberto. Para fechar o código, troque essa função por uma alternativa com licença permissiva.

## Atalhos

`Espaço` reproduz/pausa · `K` keyframe em todas · setas movem (Shift = 10 px) · `,` `.` quadro a quadro · `Ctrl+Z` desfaz · `Ctrl+D` duplica · `Delete` exclui · `Shift` ao girar prende em 15°.
