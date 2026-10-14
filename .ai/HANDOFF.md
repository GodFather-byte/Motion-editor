## Status Atual
- Adicionado teste para o caminho de erro do MediaPipe, validando se uma exceção é levantada corretamente quando máscaras não são geradas (coverage de \`Nenhuma máscara gerada pelo MediaPipe.\`).
- O teste intercepta a requisição do \`app.js\` no Playwright e utiliza um mock de \`getMediaPipeSegmenter\` que retorna \`confidenceMasks: []\`.

## Arquivos Alterados
- \`tests/ai-mediapipe.cjs\`: Novo teste do caminho de erro do MediaPipe.

## Próximos Passos (se aplicável)
- O código de teste está pronto, testado e passa com sucesso sem impacto na produção.
- Limpeza dos artefatos de testes foi realizada para que nenhum \`package.json\` seja committado indevidamente.
