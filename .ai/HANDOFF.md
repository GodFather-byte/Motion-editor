# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Integrar IA nativa do Chrome, cortes de silêncio, recursos PWA e gestos de timeline.

## Estado agora
- Quatro módulos IIFE/globais carregados antes de app.js, sem novas dependências do app.
- ChromeAIService adapta APIs modernas/legadas; progresso, frame JPEG, metadados, cortes e legendas.
- SmartSilenceCutter usa RMS de 20 ms; chip "Cortar silêncios" na IA para vídeo/áudio selecionado.
- Ripple mantém trim/speed, rampas, keyframes e histórico por conversores injetados.
- Camadas-pai cortadas deixam grupo-âncora para preservar transformações dos filhos.
- MobilePWAIntegration oferece OPFS, Wake Lock durante exportVideo/fastExport e vibração.
- Share Target POST guarda File em shared-media; boot importa e limpa somente entregas concluídas.
- TimelineTouchEngine: pinça, scroll nos dois eixos, seleção por toque, toque longo, snap e trim de 44 px.
- Mouse e keyframes mantêm handlers existentes; cancelamento de gesto restaura a camada.
- `sw.js` está em `motion-v30`; shell inclui os quatro módulos.
- Testes novos: native-services, silence-cutter, share-target e media-modules.
- Regressões: mobile-sheets, preview-controls, ai-edit-plan e slowmo.

## Como retomar
1. Rode `git pull` e confira `git status`.
2. Consulte `README.md` e `.ai/MAPA.md` para localizar recursos e testes.
3. Teste com `python3 -m http.server 8000`, `node --check app.js` e os testes citados.
4. Testes de navegador usam Playwright/Chromium; slowmo também precisa de FFmpeg.

## Arquivos relevantes
- `chrome-ai.js`, `silence-cutter.js`, `mobile-pwa.js`, `timeline-touch.js`.
- `app.js`, `index.html`, `style.css`: integração e chip IA.
- `sw.js`, `manifest.webmanifest`: shell offline e Share Target.

## Pendências e limitações
- Sem teste em celular físico ou modelo Gemini Nano real; APIs nativas cobertas por mocks.
- APIs ausentes retornam null/false; diagnóstico da IA fica em ChromeAIService.reason.
- OPFS é serviço opt-in; IndexedDB continua sendo o armazenamento padrão do editor.
