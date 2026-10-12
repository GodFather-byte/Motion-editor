# Handoff
Atualizado por: Antigravity em 12/10/2026

## Objetivo atual
Integração com o Photopea concluída com sucesso.

## Feito nas últimas sessões
- Integração bidirecional do Photopea via iframe e Live Messaging (`postMessage` + `saveToOE`).
- Chip "Photopea" na barra de adicionar (`.add-bar`) com modal de escolha (novo gráfico no tamanho do projeto, editar camada, editar frame atual, abrir arquivo/PSD).
- Botão "Editar no Photopea" no painel de propriedades de camadas de imagem.
- Opção "Editar frame atual no Photopea" no menu do projeto.
- Atalho `Ctrl+S` / `Cmd+S` e `Arquivo > Salvar` dentro do Photopea mapeados via `customIO.save` para enviar o PNG direto ao projeto.
- Opção para substituir a camada existente ou adicionar como nova camada.
- Modal dedicado responsivo para desktop e celular (360 px), tema escuro e idioma em português.
- Teclado do editor suspenso durante o uso do Photopea para evitar conflito de atalhos.
- Testes unitários adicionados em `tests/photopea.cjs` (4/4 passando). PWA atualizado para `motion-v14`.

## Próximo passo
Testar no celular e desktop reais a edição de imagens com filtros e recortes PSD via Photopea online.

## Arquivos relevantes
- `app.js`: seção `photopea` (`openPhotopea`, `closePhotopea`, `photopeaChoiceModal`, `applyPhotopeaResult`).
- `index.html`: chip `#btnPhotopea`, menu `photopea-frame`, input `#photopeaFileInput` e `#photopeaModal`.
- `style.css`: `.sw-photopea`, `.photopea-modal`, `.photopea-card`, `.photopea-bar`, estilos mobile.
- `tests/photopea.cjs`: testes da integração. `sw.js`: versão `motion-v14`.

## Decisões tomadas e motivo
- Imagens <800 KB passam via data URI no hash `files[]` para carregamento instantâneo no boot do Photopea; arquivos maiores usam `ArrayBuffer` via `postMessage`.
- `customIO.save: 'app.activeDocument.saveToOE("png");'` intercepta o `Ctrl+S` nativo do Photoshop/Photopea e salva no projeto sem cliques extras.
- PWA suspende teclas do editor enquanto Photopea estiver aberto; fecha suavemente com Escape ou botão Fechar.

## Pendências e armadilhas
- O Photopea requer conexão ativa com a internet para carregar o iframe (`photopea.com`).
- Manter `VERSION` em `sw.js` atualizado a cada mudança nos assets do app.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --test tests/photopea.cjs`.
