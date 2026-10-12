# Handoff
Atualizado por: Claude em 12/10/2026

## Objetivo atual
App completo e publicado. Próxima fase: testar com usuários reais e corrigir o que aparecer.

## Feito nesta sessão
- Editor base, áudio/vídeo, efeitos, máscara, grupos.
- Editor de curva, caminho de movimento, caneta, animações de texto.
- IA (Gemini com chave do usuário), legendas automáticas, remover fundo.
- Modelos prontos, marca d'água e plano Pro com licença assinada.

## Próximo passo
Validar com a chave real do Gemini: "Criar animação com texto" e "Legendas automáticas" (só foram testados com respostas simuladas).

## Arquivos relevantes
- app.js: todo o editor (ver .ai/MAPA.md)
- pro-config.js: preço e link de compra do Pro (dono vai editar)

## Decisões tomadas e motivo
- Sem build e sem framework: roda direto no GitHub Pages e abre rápido no celular.
- Arquivos de mídia no IndexedDB: localStorage não aguenta vídeo.
- Licença Pro por assinatura ECDSA: dá para validar offline sem servidor.

## Pendências e armadilhas
- Remover fundo usa @imgly/background-removal (AGPL). Trocar se o código for fechado.
- Exportação é em tempo real: a aba precisa ficar visível.
- Esquecer de mudar VERSION em sw.js deixa o celular com versão antiga.

## Como rodar e testar
`python3 -m http.server 8000` e abrir http://localhost:8000. `node --check app.js` para sintaxe.
