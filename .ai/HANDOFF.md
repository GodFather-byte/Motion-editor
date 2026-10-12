# Handoff
Atualizado por: Antigravity em 12/10/2026

## Objetivo atual
Integração completa do FFmpeg e Photopea concluídas com sucesso.

## Feito nas últimas sessões
- Photopea: edição e criação de imagens via iframe, Live Messaging e salvamento direto com Ctrl+S.
- FFmpeg WebAssembly: caixa de ferramentas completa (`ffmpegModal`) carregada sob demanda via CDN.
- Operações do FFmpeg: converter para MP4 (H.264), extrair áudio (WAV), comprimir com CRF, gerar GIF animado com paleta Lanczos, remover som (mudo) e comandos personalizados.
- Pontos de acesso do FFmpeg: chip na barra de adicionar, botão nos painéis de vídeo e áudio, e menu do projeto.
- Barra de progresso em tempo real, console de log expansível, prévia imediata e botões para adicionar à timeline, substituir camada ou baixar arquivo.
- Testes unitários em `tests/photopea.cjs` (4/4) e `tests/ffmpeg.cjs` (4/4). PWA em `motion-v15`.

## Próximo passo
Testar transcodificação e compressão com arquivos de vídeo reais de diferentes formatos (MOV, MKV, WebM) em navegadores desktop e móveis.

## Arquivos relevantes
- `app.js`: seções `photopea` e `FFmpeg` (`getFFmpeg`, `ffmpegModal`), botões no painel e menu.
- `index.html`: chips `#btnPhotopea` e `#btnFFmpeg`, menus e inputs de arquivos.
- `style.css`: `.sw-photopea`, `.sw-ffmpeg`, `.ffmpeg-log`, `.ffmpeg-preview`.
- `tests/ffmpeg.cjs`, `tests/photopea.cjs`. `sw.js`: versão `motion-v15`.

## Decisões tomadas e motivo
- Carregamento 100% sob demanda do FFmpeg WebAssembly (single-threaded core sem necessidade de COOP/COEP para compatibilidade total com GitHub Pages).
- Opção para substituir camada existente preservando sincronia ou adicionar como nova faixa.
- Arquivos processados são registrados no IndexedDB via `registerAsset`.

## Pendências e armadilhas
- FFmpeg e Photopea requerem conexão com a internet na primeira inicialização para baixar os binários.
- Sempre atualizar `VERSION` em `sw.js` a cada mudança nos assets do app.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --test tests/ffmpeg.cjs tests/photopea.cjs`.
