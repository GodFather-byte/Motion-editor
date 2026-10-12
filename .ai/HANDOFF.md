# Handoff
Atualizado por: Codex em 12/10/2026

## Objetivo atual
Edição automática por pedido entregue, integrada às atualizações recentes de Photopea e FFmpeg.

## Feito nas últimas sessões
- Editar com IA: Gemini analisa áudio/quadros, escolhe cortes, cria legendas e zoom; revisão antes de aplicar.
- Trecho de até 10 minutos, analisado em partes de 60 s; montagem de até 120 s, com formato e enquadramento escolhidos.
- Revisão permite desmarcar cortes; timeline editável, preview, exportação, undo/redo e backup persistente do original.
- Cortar pausas sem IA funciona localmente, sem chave ou envio de dados.
- Cancelamento, timeout, validação de tempos e proteção contra respostas de um projeto alterado.
- Mantidos Photopea, FFmpeg, exportação rápida/GIF, efeitos, música, narração e figurinhas. PWA motion-v16.
- 47 verificações validadas: 16 novas de IA e 31 existentes; exportação com mídia real e layout de 360 px.

## Próximo passo
Avaliar transcrição e escolha dos destaques com vídeos reais e a chave Gemini do usuário; não houve chamada real à API nesta sessão.

## Arquivos relevantes
- ai-edit.js: normalizePlan, normalizeTranscript, findSilences, assemble (helpers puros).
- app.js: seção "editar vídeo por pedido"; editWithAIModal, beginAIEdit, reviewAIEdit, applyAIEditAssembly, restoreAIEditOriginal.
- tests/ai-edit-plan.cjs e tests/ai-edit.cjs: Gemini simulado, áudio/vídeo real, múltiplas partes, erros, cancelamento e restauração.
- .ai/MAPA.md descreve as demais seções, incluindo Photopea/FFmpeg.

## Decisões tomadas e motivo
- IA retorna somente dados; tempos validados antes de montar. Não executa código, URLs ou IDs fornecidos pelo modelo.
- Envio de áudio WAV mono e 3 quadros JPEG reduzidos por parte, usando a chave configurada no app.
- aiEdit.original guarda um único backup; assets preservados e troca de projeto mantém o histórico de undo.
- Tempos do modelo são relativos ao trecho; trim soma sourceFrom, e a timeline divide pela velocidade.

## Pendências e armadilhas
- Gemini precisa de internet/chave e pode cobrar; qualidade de transcrição e seleção ainda precisa de avaliação real.
- Pausas usam energia do áudio: música contínua pode impedir cortes. Enquadramento focal é fixo por clipe, sem tracking.
- FFmpeg/Photopea/CDNs precisam de internet; microfone precisa de HTTPS/localhost e permissão.
- Aumentar VERSION em sw.js sempre que mudar o app; manter ai-edit.js no cache.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --check ai-edit.js`.
`CHROMIUM_PATH=/usr/bin/chromium node --test --test-concurrency=2 tests/*.cjs` (Playwright, FFmpeg e internet).
