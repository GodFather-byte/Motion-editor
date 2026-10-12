# Handoff
Atualizado por: Claude em 12/10/2026

## Objetivo atual
Animação por código (GSAP) integrada ao editor. Próximo: validar com usuários reais.

## Feito nesta sessão
- Botão **Código** (barra de adicionar) e item no menu IA: o usuário escreve GSAP 3 e o editor converte em keyframes.
- Execução isolada: iframe `sandbox="allow-scripts"` (origem opaca) cria um Worker que carrega gsap@3.15.0 do jsDelivr, roda o código, usa `gsap.exportRoot()` e amostra cada quadro. Timeout de 12 s mata laço infinito.
- Amostras viram keyframes lineares simplificados (Ramer-Douglas-Peucker, tolerâncias em `CODE_TOL`).
- API do código: `tl`, `gsap`, `layers`, `layer(nome|índice)`, `add(tipo, opções)`, `every(t => …)`, `duration()`, `background()`, `random()` determinístico, `W H D FPS`, `.start/.end`.
- Reaplicar substitui o resultado anterior (`L.codeKf` lista as props geradas; `L.fromCode` marca camadas criadas). Botão "Desfazer código".
- Timeline mostra animação de código como faixa tracejada, não como dezenas de losangos.
- IA escreve o código com as boas práticas da skill de GSAP e tenta corrigir uma vez se der erro.
- 6 exemplos prontos e referência no próprio modal. `tests/code-animation.cjs` (4 testes). Os 6 testes de `tests/video-editor.cjs` continuam passando.
- sw.js em motion-v9.

## Próximo passo
Testar "Gerar com IA" no painel Código com a chave real do Gemini.

## Arquivos relevantes
- app.js: seção "animação por código (GSAP)"
- tests/code-animation.cjs

## Decisões tomadas e motivo
- Código nunca roda ao abrir um projeto, só ao clicar Aplicar, e sempre isolado: projetos compartilhados não executam nada sozinhos.
- Unidades do código seguem o GSAP (scale 1, opacity 0–1, draw 0–1); a conversão está em `CODE_UNITS`.
- Bake em keyframes (e não código ao vivo) mantém exportação e edição iguais ao resto do editor.

## Pendências e armadilhas
- Precisa de internet para aplicar (GSAP vem do CDN; o service worker não cacheia o worker isolado).
- Camadas criadas pelo código são recriadas a cada aplicação: edições manuais nelas se perdem.
- Testes de navegador: `CHROMIUM_PATH=/opt/pw-browsers/.../chrome` se não houver /usr/bin/chromium.

## Como rodar e testar
`python3 -m http.server 8000`. `node --check app.js`. `node --test tests/video-editor.cjs tests/code-animation.cjs`.
