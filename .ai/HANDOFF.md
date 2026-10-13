# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Motion Editor 100% código aberto: sem plano Pro, sem marca d'água e sem licença. As bibliotecas abertas entram só quando o usuário usa a função.

## Feito nas últimas sessões
- Plano Pro removido: licença, modal, marca d'água, bloqueio de 4K, modelos exclusivos, pro-config.js e tools/licenca.*.
- Figurinhas: aba Lucide com busca (ícones de traço, Lucide 1.2.130, licença ISC).
- Áudio: forma de onda no painel com wavesurfer.js 7.12.12 (zoom e clique para ir ao ponto).
- Vídeo MP4/MOV: mp4box.js 2.4.1 mostra codec, fps e rotação gravada no arquivo.
- Texto: fonte própria (.ttf, .otf, .woff), validada com opentype.js 1.3.4 e guardada como ativo do projeto.
- sw.js: motion-v21, com as bibliotecas em cache depois do primeiro uso.
- Testes: tests/libs.cjs (4 novos) e regressão em video-editor, ai-edit, ai-edit-plan, photopea, mobile-sheets, export, effects e music: 49 de 49 passaram.

## Próximo passo
Escolher a licença do projeto (MIT ou AGPL-3.0) e adicionar o arquivo LICENSE. Testar fonte própria e forma de onda no celular real.

## Arquivos relevantes
- app.js: seção "bibliotecas abertas" (LIBS, lib(), loadLucide, lucideD), videoInfo, pickFont, addCustomFont e mountPanelWave.
- style.css: .sticker.line e .wave-box, no fim do arquivo.
- sw.js: CDN_FILES, lista das bibliotecas guardadas no cache.
- tests/libs.cjs: um teste por biblioteca.

## Decisões tomadas e motivo
- Bibliotecas em CDN com versão fixa, carregadas sob demanda, para não pesar a abertura.
- wavesurfer só no painel de áudio. Os clipes da linha do tempo continuam com a forma de onda própria, mais leve.
- mp4box só lê metadados. O navegador já aplica a rotação na prévia, então o valor é informativo.
- Rotação segue a convenção do ffprobe: 90 quer dizer girado 90°.

## Pendências e armadilhas
- A licença do projeto ainda não foi escolhida. @imgly/background-removal é AGPL-3.0, então a licença precisa ser compatível.
- O primeiro uso de cada biblioteca precisa de internet. Depois ela fica no cache do sw.
- mp4box lê o arquivo inteiro na memória: vídeos acima de 400 MB não são analisados.
- Fonte própria com o mesmo nome de uma fonte do Google sobrescreve a exibição daquele nome.
- Não testei se a fonte própria sobrevive ao salvar e reabrir um .motion.json.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`.
`CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome NODE_PATH=/opt/node22/lib/node_modules node --test --test-concurrency=2 tests/*.cjs`. Precisa de FFmpeg e de internet para as bibliotecas.
