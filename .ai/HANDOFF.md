# Handoff
Atualizado por: Jules

## Objetivo atual
Motion Editor 100% aberto (AGPL-3.0). Nesta rodada: adicionado teste para a função `rampCum` responsável pelas rampas de velocidade.

## Estado agora
- `rampCum` exportada no `app.js` e acessível pelo `window.__motion`.
- Adicionado caso de teste compreensivo em `tests/slowmo.cjs` cobrindo a lógica de cálculo de integral da função.
- Incremento da versão no arquivo `sw.js` (motion-v26) após alteração do app.
- Todos os testes aprovados via Playwright local.

## Como retomar (Codex)
1. `git fetch origin && git checkout ccr-a74f83ad-cpkqwi && git pull`. Confira `git status` antes de editar.
2. Não faça merge nem force-push. Merge só quando o dono pedir.
3. Testes abrem `origin + '/#editor'` (sem o hash aparece a tela inicial). Use CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome e NODE_PATH=/opt/node22/lib/node_modules.
4. Próximos passos sugeridos:
   a. Testar em celular real: tela inicial, Início, voltar do Android e câmera lenta na prévia.
   b. Revisão da tela inicial não foi feita por outro agente (limite de sessão). Vale uma leitura de segurança dos dados (troca rápida de projeto, várias abas).
   c. Rampa para camadas de áudio (o modelo já aceita; falta só o controle no painel).

## Arquivos relevantes
- app.js: seções "câmera lenta (velocidade e rampas)" e "biblioteca de projetos e tela inicial"; `seekVideosExact` (quadros suaves e `exactSeeks`); `drawShape` caso video (`blendCanvas`).
- index.html: `#home` (fora de `#app`), `#btnHome` no topo do editor, item "Meus projetos" no menu.
- tests/slowmo.cjs e tests/home.cjs.

## Decisões tomadas e motivo
- Pontos da rampa em tempo absoluto (como keyframes): dividir o bloco mantém a reprodução contínua e mover o bloco move a rampa junto.
- Aplicar uma curva mantém o mesmo trecho do vídeo; o bloco fica mais longo e o projeto cresce até 600 s.
- Quadros suaves só na prévia pausada e na exportação quadro a quadro (MP4/GIF). Em tempo real o navegador não entrega dois quadros vizinhos ao mesmo tempo.
- Novo projeto, modelo, exemplo e arquivo aberto criam sempre um projeto novo na biblioteca; nada é substituído.

## Pendências e armadilhas
- Várias abas no mesmo projeto: vale o último que salvou. Aba antiga aberta bloqueia a atualização do IndexedDB para v2 (aparece aviso).
- Abaixo de 0.1x efetivo a prévia avança por buscas e pode parecer travada; a exportação fica certa.
- Desfoque de movimento + quadros suaves: amostras que cruzam um quadro desenham só o quadro a.
- DONATE em app.js continua vazio: falta chave PIX e/ou links do dono.
