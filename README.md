# Motion Editor

Editor de motion graphics que roda direto no navegador e pode ser instalado como app (PWA), no celular ou no computador. Sem servidor, sem dependências: HTML, CSS e JavaScript puro.

## O que já faz

- **Camadas:** texto, retângulo, círculo, estrela e imagem.
- **Keyframes** em posição, escala, rotação, opacidade, desfoque e brilho, com 8 curvas de animação (suave, ultrapassar, elástico, quicar, corte seco…).
- **Linha do tempo:** arrastar o cursor, mover e aparar camadas, arrastar keyframes, zoom.
- **Preview interativo:** arrastar para mover, alça azul para escalar, bolinha de cima para girar, ímã no centro.
- **Texto animado letra por letra:** máquina de escrever, subir, estourar, aparecer, onda.
- **Animações prontas:** entrar com zoom, deslizar, subir, cair quicando, surgir do desfoque, pulsar, girar, sumir.
- **Formatos:** 9:16, 16:9, 1:1 e 4:5, com 24, 30 ou 60 quadros por segundo.
- **Exportação de vídeo** em MP4 (Chrome recente e Safari) ou WEBM, e de frame em PNG.
- **Projeto:** salvamento automático no navegador, desfazer/refazer, salvar e abrir arquivo `.motion.json`.
- **Funciona offline** depois de instalado.

## Como publicar (GitHub Pages)

1. No repositório, abra **Settings → Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
3. Depois de 1 ou 2 minutos o app fica em `https://<seu-usuario>.github.io/<repositorio>/`.

Para instalar: no Android/Chrome aparece o botão **Instalar app** no topo. No iPhone, abra no Safari e use **Compartilhar → Adicionar à Tela de Início**.

## Rodar no computador

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura da interface |
| `style.css` | Visual e layout (desktop e celular) |
| `app.js` | Editor: modelo, render no canvas, linha do tempo, exportação |
| `sw.js` | Service worker (cache offline). Mude `VERSION` a cada atualização |
| `manifest.webmanifest`, `icons/` | Dados de instalação do app |

## Atalhos

`Espaço` reproduz/pausa · `K` keyframe em todas as propriedades · setas movem (Shift = 10 px) · `,` `.` quadro a quadro · `Ctrl+Z` desfaz · `Ctrl+D` duplica · `Delete` exclui.

## Próximos passos

- Áudio (trilha e sincronia com a timeline)
- Máscaras e mais efeitos (sombra, cor, distorção)
- Gerar animação a partir de uma descrição em texto (IA)
- Legenda automática a partir do áudio
