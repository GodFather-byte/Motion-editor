# Instruções do projeto: Motion Editor

Editor de motion graphics em HTML, CSS e JavaScript puro, publicado no GitHub Pages como PWA.
Vários agentes de IA trabalham aqui (Claude, Codex/ChatGPT, Antigravity/Gemini). Estas regras valem para todos.

## Antes de começar
1. Rode `git pull` para pegar o trabalho dos outros agentes.
2. Leia `.ai/HANDOFF.md`. Ele diz onde o trabalho parou. Se ele responder isso, não explore o repositório inteiro.
3. Use `.ai/MAPA.md` para achar onde cada coisa fica em vez de ler `app.js` inteiro.

## Ao terminar
1. Reescreva `.ai/HANDOFF.md` (substitua o conteúdo, máximo 40 linhas, use o modelo que já está lá).
2. Se mudou a estrutura do código, atualize `.ai/MAPA.md`.
3. Se mudou arquivos do app, aumente `VERSION` em `sw.js` (ex.: motion-v5 → motion-v6), senão o celular continua com a versão antiga.
4. Faça commit com mensagem em português no formato `feat: ...` / `fix: ...` e `git push`.

## Regras
- Um agente edita por vez. Não trabalhe em paralelo com outro agente nos mesmos arquivos.
- Sem dependências novas nem build: tudo roda abrindo `index.html`. Bibliotecas só por CDN com versão fixa, carregadas sob demanda.
- Textos da interface em português do Brasil, frases curtas e diretas.
- Cores sempre pelas variáveis de `style.css` (`--accent`, `--panel` etc.).
- O app precisa funcionar no celular (largura de 360 px): teste o layout estreito.
- Nunca suba `*.pem` (chave privada das licenças). O `.gitignore` já bloqueia.
- Não mexa em `pro-config.js` (chave pública) sem o dono pedir.

## Como testar
```bash
python3 -m http.server 8000   # abra http://localhost:8000
node --check app.js           # confere a sintaxe
```
