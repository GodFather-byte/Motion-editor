# Handoff
Atualizado por: Claude em 13/10/2026

## Objetivo atual
Motion Editor 100% código aberto (AGPL-3.0). Novidades de IA local no navegador, sem nuvem: rastreio de movimento e cortes por cena.

## Estado agora
- main em 23b339e (PR #7 mergeado). A branch ccr-a74f83ad-cpkqwi traz as novidades abaixo, em PR de rascunho.
- Feito: "Rastrear movimento" (seção Transformação) grava keyframes de x e y; "Cortar por cenas" (vídeos) divide a camada nas trocas de cena. sw.js em motion-v22.
- Testes: tests/modern.cjs (2) e regressão (video-editor, ai-edit, ai-edit-plan, photopea, mobile-sheets, export, effects, music, libs) passaram: 51 de 51.

## Como retomar (Codex)
1. `git fetch origin && git checkout ccr-a74f83ad-cpkqwi && git pull`. Confira `git status` antes de editar.
2. Não faça merge nem force-push. Merge só quando o dono pedir.
3. Próximos passos, em ordem:
   a. Testar o rastreio em vídeo real de celular, não só no vídeo de teste.
   b. Se o objeto correr rápido demais, aumentar a janela de busca (r em trackLayer).
   c. Rodar `node --test tests/lottie.cjs` com internet (ainda não rodado).

## Arquivos relevantes
- app.js: seção "rastreio de movimento e cortes por cena" (grayOf, patchOf, matchPatch, trackLayer, cutByScenes).
- tests/modern.cjs: testes do rastreio (quadrado que anda 100 px/s) e dos cortes (vermelho para azul).

## Decisões tomadas e motivo
- O rastreio mede a composição com a própria camada invisível, então segue o que está atrás dela.
- Modelo fixo, do quadro inicial: atualizar a cada quadro fazia o erro acumular.
- Análise a 1/4 da resolução e 10 amostras por segundo, para ser leve.
- Termina dois quadros antes do fim: o último quadro do vídeo volta atrasado ao buscar.

## Pendências e armadilhas
- O rastreio só faz translação (x, y). Não acompanha rotação nem escala.
- Cortes por cena usam diferença de cor, sem IA: podem falhar em cortes suaves. Limite de 600 s.
- Fonte própria: não testei salvar e reabrir um .motion.json.
- lottie.cjs não foi rodado (precisa de internet).
