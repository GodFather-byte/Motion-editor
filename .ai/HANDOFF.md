# Handoff
Atualizado por: Jules

## Objetivo atual
Performance Optimization Task: Optimize expensive DOM Query in syncPanel Loop.

## Estado agora
- Implementada otimização no `app.js` dentro de `panel.addEventListener('input', ...)` para os inputs de `range-group` (`data-s`). Em vez de buscar por `$$('[data-s="..."]')` no documento inteiro a cada input (o que gera latência severa, especialmente em sliders), a busca é restrita aos elementos irmãos (`nextElementSibling` / `previousElementSibling`) dentro do `.range-group`. Se o elemento não pertencer a um `range-group`, faz fallback para a query no DOM completo.
- Implementada conversão da cadeia de verificações independentes `if (key === '...')` relacionadas ao `data-show` para `else if` chains.
- Benchmarks locais provaram a eficácia, pulando sobre `$$` em interações contínuas e melhorando significativamente a latência do loop.

## Como retomar (Codex)
- Ler a implementação e revisar se há novas oportunidades de melhoria de perf em `app.js`.

## Arquivos relevantes
- app.js

## Decisões tomadas e motivo
- Ao invés de cache global dos DOM nodes que quebraria se a UI for remontada (algo comum ao trocar de projeto ou layer), foi feita navegação relativa no DOM.
- Somente `numRow` duplica inputs com o mesmo `data-s` (`range` e `number`), agrupados em um parent `.range-group`. Ao modificar sliders via dragging, atualizar o vizinho instantaneamente e poupar chamadas document-wide traz grandes ganhos na framerate do editor.
