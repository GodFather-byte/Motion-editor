# Handoff
Atualizado por: Codex em 12/10/2026

## Objetivo atual
Adicionar ferramentas de edição de vídeo. Novos recursos implementados e testados.

## Feito nesta sessão
- Looks Cinema, Vibrante, Quente, Frio, Vintage e Preto e branco, com intensidade.
- Transições ajustáveis de entrada/saída: dissolver, zoom e cortina lateral.
- Enquadramento inteiro/recorte/livre, ponto focal X/Y e botão Quadro do projeto.
- Split preserva a continuidade das transições, inclusive no quadro exato do corte.
- Congelar quadro preserva enquadramento, look e vínculo com camada pai.
- Corrigidos duração de áudio por velocidade, trim em segundos de fonte e fades longos.
- Testes de navegador com vídeo/áudio reais; seis testes passaram, incluindo 360 px e exportação.
- Integradas correções de velocidade numérica e curvas de keyframe no split.
- Cache PWA atualizado para motion-v8.

## Próximo passo
Validar arquivos longos e exportação em aparelhos reais, sobretudo Safari.

## Arquivos relevantes
- app.js: transitionState, drawFramedMedia, COLOR_LOOKS, controles do painel e áudio.
- tests/video-editor.cjs: regressões de edição, persistência, exportação e áudio.
- README.md: uso e comando de testes. .ai/MAPA.md atualizado.

## Decisões tomadas e motivo
- Efeitos independentes de p/kf preservam animações e compatibilidade com projetos antigos.
- Transições são de camada; não fazem união automática/crossfade entre clipes.
- Enquadramento usa recorte da fonte no canvas, sem dependências nem build.

## Pendências e armadilhas
- Exportação é em tempo real e exige a aba visível.
- Congelar quadro captura o frame da mídia com enquadramento/look, sem congelar transições.
- Gemini real e remoção de fundo não foram exercitados nesta sessão.
- Sempre aumentar VERSION em sw.js quando mudar o app.

## Como rodar e testar
`python3 -m http.server 8000`, `node --check app.js`, `node --test tests/video-editor.cjs`.
Testes requerem Playwright, Chromium, FFmpeg e Python (presentes neste ambiente).
