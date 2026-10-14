# Handoff
Atualizado por: Copilot em 14/10/2026

## Objetivo atual
Entregar Creator Workstation OS preservando o editor de vídeo e os módulos nativos.

## Estado agora
- Shell responsivo e estado único em `project.workstation`; vídeo original mantém DOM e folhas.
- APIs reais: WorkstationShell, ProjectAssetBus, AudioLabModule, PixelStudioModule, AIScriptCamModule.
- APIs novas devolvem snapshots seguros; bus oferece OPFS, subscribe/unsubscribe e replay de existentes.
- OPFS usa revisões imutáveis; CustomEvents e BroadcastChannel compartilham metadados por projeto.
- Link envia novas mídias e atualiza vínculos sem duplicar; desligado só envia por ação explícita.
- Fontes Áudio/Pixel ficam no módulo até exportar; se enviadas manualmente, recebem atualizações.
- Áudio multifaixa e preset exato: 80 Hz, 3 kHz/+4 dB, compressor −24 dB, ratio 12:1.
- Mix WAV/WebM processado via OfflineAudioContext; Pixel exporta overlay PNG transparente.
- Roteiro LanguageModel local, teleprompter, fala opcional e captura composta tela/webcam/áudio.
- Câmera salva sem envio automático e pergunta sobre timeline/corte; ambas as escolhas abrem Vídeo.
- Uso/quota/livre em MB/GB: polling 10 s, saves e visibility; pagehide/pageshow limpam/restauram.
- Tokens isolam operações obsoletas; troca de módulo/projeto libera dispositivos e contextos.
- `sw.js`: motion-v33 inclui workstation.js/css no shell offline.
- Validação final: 94 testes executados; 93 passaram e 1 timeout de exportação já existe no HEAD.
- Workstation: 18/18 passaram; sintaxe app/workstation/chrome-ai/sw/teste e git diff --check OK.

## Como retomar
1. Confira `git status`; refinamento entregue sem commit/push por instrução do coordenador.
2. Suítes: workstation-unit/workstation/native-services/silence-cutter/share-target/ai-local.
3. Regressões: mobile-sheets/media-modules/home/short-form/preview-controls/slowmo/video-editor.
4. Use CHROMIUM_PATH=/usr/bin/chromium e TMPDIR apontando para a raiz do projeto; FFmpeg instalado.
5. Coordenador conclui scan de segredos, validação de segurança e commit; não precisa repetir testes.

## Arquivos relevantes
- workstation.js/css, chrome-ai.js, ponte app.js, index.html, sw.js, README/MAPA e testes workstation.

## Pendências e limitações
- video-editor.cjs:192 espera “Vídeo pronto” e estoura 15 s; reproduzido em cópia limpa do HEAD.
- Alteração alheia de seleção MediaRecorder em video-editor.cjs foi removida; fixture share-target mantida.
- APIs de captura/OPFS/LanguageModel/fala exigem navegador compatível e HTTPS/localhost.
- Modelo real e celular físico não verificados; testes usam API LanguageModel controlada.
- OPFS é privado por origem; reconhecimento de fala opt-in pode usar serviço do navegador.
