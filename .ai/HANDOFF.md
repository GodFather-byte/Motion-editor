# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Corrigir revisão do Creator Workstation OS, preservando as correções DOM XSS anteriores.

## Estado agora
- Shell responsivo e estado único em `project.workstation`; DOM/folhas do vídeo preservados.
- APIs reais de módulos, ProjectAssetBus, OPFS imutável e Link opcional continuam ativos.
- Correções DOM XSS anteriores e testes de projetos maliciosos/estado mutado preservados.
- Reexportar pelo mesmo mixKey ajusta apenas caudas antes completas, comparadas via srcTime.
- Novo fim usa timeAtSrc (inclusive rampas); trims, cortes, início, velocidade e keyframes preservados.
- Projeto cresce sem reposicionar clipes, até 600 s; mínimo de 0,1 s ou um frame.
- Assets anteriores continuam disponíveis para undo; fundo acompanha crescimento do projeto.
- Substituição vinculada pausa playback após decodificação/guards e antes da troca de assets.
- BroadcastChannel revalida revisão após leitura OPFS/token, evitando sobrescrever edição concorrente.
- Corridas determinísticas cobrem arquivo existente, criação concorrente e revisão duplicada.
- Cancelar microfone por visibilitychange libera dispositivos e reabilita gravação, inclusive ao voltar.
- `sw.js`: motion-v35; sem novas dependências, ferramentas ou mudanças no README.
- workstation-unit + workstation: 25/25 aprovados (inclui cinco novas regressões).
- slowmo + media-modules + native-services + home + mobile-sheets: 52/52 aprovados.
- Total validado: 77/77; layout de 360/390 px, XSS, captura e áudio real incluídos.
- Sintaxe app/workstation/sw/teste e git diff --check aprovados.

## Como retomar
1. Confira `git status`; alterações anteriores preservadas, sem commit/push por instrução explícita.
2. Testes usam TMPDIR="$PWD" CHROMIUM_PATH=/usr/bin/chromium node --test e os sete arquivos acima.
3. Coordenador pode fazer scan de segredos, commit e parallel_validation; não executados nesta revisão.

## Arquivos relevantes
- Correção atual: app.js, workstation.js, sw.js, tests/workstation.cjs e este handoff.

## Pendências e limitações
- video-editor.cjs:192 tem timeout de exportação reproduzido no HEAD pelo coordenador; não alterado/reexecutado.
- CodeQL/parallel_validation precisam ser reexecutados pelo coordenador, se necessário.
- APIs de captura/OPFS/LanguageModel/fala exigem navegador compatível e HTTPS/localhost.
- Modelo real e celular físico não verificados; testes usam API LanguageModel controlada.
- OPFS é privado por origem; reconhecimento de fala opt-in pode usar serviço do navegador.
