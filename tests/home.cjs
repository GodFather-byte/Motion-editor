'use strict';
/* Tela inicial e biblioteca de projetos: abrir sem #editor mostra o início, projetos ficam no IndexedDB
   com miniatura, cada um com seus arquivos, e o voltar do navegador leva ao início. Não precisa de internet.
   Rode com: node --test tests/home.cjs */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin, dir;
before(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'motion-home-'));
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', d => { const m = String(d).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const OLD = { v: 2, name: 'Antigo', aspect: '9:16', width: 360, height: 640, fps: 30, duration: 3, background: '#102030', assets: {},
  layers: [{ id: 'a', type: 'rect', name: 'Caixa', start: 0, end: 3, visible: true, parent: null,
    p: { x: 180, y: 320, scale: 100, rotation: 0, opacity: 100 }, kf: {}, s: { w: 120, h: 120, fill: '#ff0000' } }] };

async function open(t, { width = 1280, height = 800, mobile = false, seed = null, hash = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  t.after(() => context.close());
  if (seed) await context.addInitScript(seed => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify(seed));
    sessionStorage.setItem('seeded', '1');
  }, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(`${origin}/${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}
const M = (page, fn, arg) => page.evaluate(fn, arg);
const inEditor = page => page.waitForFunction(() => !document.getElementById('app').hidden && !!window.__motion.P() && !window.__motion.isHome());
const atHome = page => page.waitForFunction(() => window.__motion.isHome() && !document.getElementById('home').hidden);
const cardCount = (page, n) => page.waitForFunction(n => document.querySelectorAll('#homeGrid .proj').length === n, n);
const card = (page, text) => page.locator('#homeGrid .proj', { hasText: text });
async function createProject(page, fmt) {
  await page.locator('.home-new').click();
  await page.locator(`#modalBody [data-fmt="${fmt}"]`).click();
  await inEditor(page);
}
async function home(page) {
  await page.locator('#btnHome').click();
  await atHome(page);
}
/* nome do projeto pelo campo do topo, como o usuário faz */
async function setName(page, name) {
  await page.locator('#projectName').fill(name);
  await page.locator('#projectName').dispatchEvent('change');
}
const hasAsset = (page, id) => page.evaluate(id => new Promise(res => {
  const r = indexedDB.open('motion-editor');
  r.onsuccess = () => {
    const db = r.result, g = db.transaction('assets').objectStore('assets').get(id);
    g.onsuccess = () => { res(!!g.result); db.close(); };
    g.onerror = () => { res(false); db.close(); };
  };
  r.onerror = () => res(false);
}), id);
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); }
  return false;
}

test('abrir sem #editor mostra o início, esconde o editor e Espaço não reproduz', async t => {
  const page = await open(t);
  await atHome(page);
  assert.equal(await page.locator('#home').isVisible(), true);
  assert.equal(await page.locator('#app').isHidden(), true, '#app escondido');
  assert.equal(await M(page, () => location.hash), '');
  assert.equal(await page.locator('#homeEmpty').isVisible(), true, 'estado vazio');
  assert.equal(await page.locator('.home-foot a').getAttribute('href'), 'https://github.com/GodFather-byte/Motion-editor');
  assert.match(await page.locator('.home-foot').textContent(), /Gratuito e de código aberto \(AGPL-3\.0\)/);
  assert.equal(await page.locator('[data-home="donate"]').isHidden(), true, 'Apoiar só com DONATE preenchido');
  await page.waitForFunction(() => document.querySelectorAll('#homeTpls .home-tpl img').length >= 8, null, { timeout: 15000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  assert.equal(await M(page, () => window.__motion.S.playing), false, 'Espaço no início não toca');
  assert.equal(await M(page, () => window.__motion.P()), null, 'nenhum projeto aberto');
  // Ajuda abre os atalhos; o botão de instalar acompanha o do editor
  await page.locator('.home-act[data-home="help"]').click();
  assert.equal(await page.locator('#modalTitle').textContent(), 'Atalhos');
  await page.locator('#modalActions button').click();
  assert.equal(await page.locator('#homeInstall').isHidden(), true);
  await M(page, () => { document.getElementById('btnInstall').hidden = false; });
  await page.waitForFunction(() => !document.getElementById('homeInstall').hidden);
});

test('novo 16:9 abre o editor em 1920x1080, volta ao início com o cartão e reabre com a camada', async t => {
  const page = await open(t);
  await page.locator('.home-new').click();
  assert.deepEqual(await page.locator('#modalBody .fmt').allInnerTexts().then(a => a.map(s => s.replace(/\s+/g, ' ').trim())),
    ['9:16 Stories, Reels e TikTok', '16:9 YouTube e tela cheia', '1:1 Feed quadrado', '4:5 Feed retrato']);
  await page.locator('#modalBody [data-fmt="16:9"]').click();
  await inEditor(page);
  assert.equal(await M(page, () => location.hash), '#editor');
  assert.deepEqual(await M(page, () => [window.__motion.P().width, window.__motion.P().height, window.__motion.P().aspect]), [1920, 1080, '16:9']);
  assert.deepEqual(await M(page, () => [document.getElementById('canvas').width, document.getElementById('canvas').height]), [1920, 1080]);
  assert.ok(await M(page, () => document.getElementById('canvas').getBoundingClientRect().width > 300), 'prévia com tamanho de verdade');
  await page.locator('[data-add="text"]').click();
  await setName(page, 'Meu vídeo');
  const id = await M(page, () => window.__motion.P().id);
  assert.ok(id, 'projeto com id');
  await home(page);
  assert.equal(await page.locator('#app').isHidden(), true);
  assert.equal(await M(page, () => location.hash), '');
  await cardCount(page, 1);
  const c = card(page, 'Meu vídeo');
  assert.equal(await c.locator('.proj-name').textContent(), 'Meu vídeo');
  assert.equal(await c.locator('.proj-meta').textContent(), '16:9 · 5s');
  assert.equal(await c.locator('.proj-time').textContent(), 'agora');
  assert.match(await c.locator('.proj-thumb img').getAttribute('src'), /^data:image\/jpeg/, 'miniatura da prévia');
  const rec = (await M(page, () => window.__motion.libAll()))[0];
  assert.equal(rec.id, id);
  assert.deepEqual([rec.name, rec.aspect, rec.width, rec.height, rec.duration, rec.layerCount], ['Meu vídeo', '16:9', 1920, 1080, 5, 1]);
  assert.ok(rec.updated > Date.now() - 60000 && JSON.parse(rec.json).layers[0].type === 'text');
  // recarrega a página: a biblioteca vem do IndexedDB e o projeto reabre com a camada
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await atHome(page); await cardCount(page, 1);
  await card(page, 'Meu vídeo').locator('.proj-open').click();
  await inEditor(page);
  assert.deepEqual(await M(page, () => [window.__motion.P().id, window.__motion.P().name, window.__motion.P().layers.map(l => l.type)]), [id, 'Meu vídeo', ['text']]);
  assert.equal(await page.locator('#projectName').inputValue(), 'Meu vídeo');
});

test('dois projetos guardam cada um os seus arquivos no IndexedDB', async t => {
  const page = await open(t);
  await createProject(page, '9:16');
  await setName(page, 'Projeto A');
  const asset = await M(page, async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 30;
    const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 40, 30);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const m = window.__motion, rec = await m.registerAsset(blob, 'image', 'vermelho.png');
    m.addLayer(m.makeLayer('image', { name: 'Foto', s: { asset: rec.id, w: 400, h: 300 } }));
    return rec.id;
  });
  await home(page);
  await createProject(page, '1:1');
  await setName(page, 'Projeto B');
  assert.ok(await until(() => M(page, id => !window.__motion.A.has(id), asset)), 'o arquivo de A sai da memória ao abrir B');
  await M(page, () => window.__motion.flushSave());
  await M(page, () => window.__motion.cleanupAssets());
  assert.equal(await hasAsset(page, asset), true, 'o arquivo de A continua no IndexedDB');
  await home(page);
  await cardCount(page, 2);
  assert.deepEqual(await page.locator('#homeGrid .proj-name').allTextContents(), ['Projeto B', 'Projeto A'], 'mais recente primeiro');
  await card(page, 'Projeto A').locator('.proj-open').click();
  await inEditor(page);
  await page.waitForFunction(id => window.__motion.A.get(id)?.el?.naturalWidth === 40, asset);
  assert.equal(await M(page, () => window.__motion.P().name), 'Projeto A');
  assert.equal(await M(page, () => window.__motion.P().layers[0].type), 'image');
  // excluir A apaga o arquivo que só ele usava
  await home(page);
  await card(page, 'Projeto A').locator('.proj-more').click();
  await page.locator('#modalBody [data-opt="del"]').click();
  assert.equal(await page.locator('#modalTitle').textContent(), 'Excluir este projeto?');
  assert.match(await page.locator('#modalBody').textContent(), /Não dá para desfazer\./);
  await page.locator('#modalActions button', { hasText: 'Excluir' }).click();
  await cardCount(page, 1);
  assert.ok(await until(async () => !(await hasAsset(page, asset))), 'arquivo órfão apagado');
  assert.equal(await M(page, () => window.__motion.P()), null, 'o projeto aberto foi excluído');
  await page.keyboard.press('Space');
  assert.equal(await M(page, () => window.__motion.S.playing), false);
});

test('renomear, duplicar e excluir pelo menu do cartão', async t => {
  const page = await open(t);
  await createProject(page, '9:16'); await setName(page, 'Primeiro'); await home(page);
  await createProject(page, '1:1'); await setName(page, 'Segundo'); await home(page);
  await cardCount(page, 2);
  // renomear um projeto que não está aberto (só na biblioteca)
  await card(page, 'Primeiro').locator('.proj-more').click();
  assert.equal(await page.locator('#modalTitle').textContent(), 'Primeiro');
  await page.locator('#modalBody [data-opt="rename"]').click();
  await page.locator('#renameField').fill('Abertura');
  await page.locator('#renameField').press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('#homeGrid .proj-name')].some(n => n.textContent === 'Abertura'));
  assert.equal(await M(page, () => window.__motion.P().name), 'Segundo', 'o aberto não muda');
  // renomear o projeto aberto também troca o nome no editor
  await card(page, 'Segundo').locator('.proj-more').click();
  await page.locator('#modalBody [data-opt="rename"]').click();
  await page.locator('#renameField').fill('Final');
  await page.locator('#modalActions .btn-primary').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#homeGrid .proj-name')].some(n => n.textContent === 'Final'));
  assert.equal(await M(page, () => window.__motion.P().name), 'Final');
  assert.equal(await page.locator('#projectName').inputValue(), 'Final');
  // duplicar
  await card(page, 'Abertura').locator('.proj-more').click();
  await page.locator('#modalBody [data-opt="dup"]').click();
  await cardCount(page, 3);
  const names = await page.locator('#homeGrid .proj-name').allTextContents();
  assert.deepEqual(names.sort(), ['Abertura', 'Abertura (cópia)', 'Final']);
  const recs = await M(page, () => window.__motion.libAll());
  const copy = recs.find(r => r.name === 'Abertura (cópia)'), orig = recs.find(r => r.name === 'Abertura');
  assert.notEqual(copy.id, orig.id); assert.equal(JSON.parse(copy.json).id, copy.id); assert.equal(copy.aspect, '9:16');
  // excluir pede confirmação; Cancelar não apaga
  await card(page, 'Abertura (cópia)').locator('.proj-more').click();
  await page.locator('#modalBody [data-opt="del"]').click();
  await page.locator('#modalActions button', { hasText: 'Cancelar' }).click();
  assert.equal(await page.locator('#homeGrid .proj').count(), 3);
  await card(page, 'Abertura (cópia)').locator('.proj-more').click();
  await page.locator('#modalBody [data-opt="del"]').click();
  await page.locator('#modalActions button', { hasText: 'Excluir' }).click();
  await cardCount(page, 2);
  // tudo continua depois de recarregar
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await atHome(page); await cardCount(page, 2);
  assert.deepEqual((await page.locator('#homeGrid .proj-name').allTextContents()).sort(), ['Abertura', 'Final']);
});

test('modelo e arquivo .motion.json pelo início viram projetos novos', async t => {
  const page = await open(t);
  await createProject(page, '9:16'); await setName(page, 'Em branco'); await home(page);
  await page.locator('[data-tpl-new="lower"]').click();
  await inEditor(page);
  assert.deepEqual(await M(page, () => [window.__motion.P().name, window.__motion.P().aspect, window.__motion.P().layers.length > 0]), ['Nome na tela (lower third)', '16:9', true]);
  const tplId = await M(page, () => window.__motion.P().id);
  await home(page); await cardCount(page, 2);
  assert.equal(await page.locator('#homeGrid .proj-name').first().textContent(), 'Nome na tela (lower third)');
  // abrir arquivo: mesmo com id de outro projeto, entra como projeto novo
  const file = path.join(dir, 'arquivo.motion.json');
  writeFileSync(file, JSON.stringify({ ...OLD, id: tplId, name: 'Do arquivo' }));
  await page.locator('#projectInput').setInputFiles(file);
  await inEditor(page);
  assert.equal(await M(page, () => window.__motion.P().name), 'Do arquivo');
  assert.notEqual(await M(page, () => window.__motion.P().id), tplId);
  await home(page); await cardCount(page, 3);
  // modelo pelo menu do editor (Modelos) também cria um projeto novo, sem aviso de substituição
  await card(page, 'Em branco').locator('.proj-open').click(); await inEditor(page);
  await page.locator('#btnTemplates').click();
  await page.locator('#modalBody [data-tpl="quote"]').click();
  await page.waitForFunction(() => window.__motion.P().name === 'Citação');
  assert.equal(await page.locator('#modal').isHidden(), true);
  await page.locator('#btnMenu').click();
  await page.locator('#menu [data-menu="home"]').click();
  await atHome(page); await cardCount(page, 4);
});

test('quem já usava o app: o projeto do localStorage entra na biblioteca', async t => {
  const page = await open(t, { seed: OLD });
  await atHome(page);
  await cardCount(page, 1);
  assert.equal(await card(page, 'Antigo').locator('.proj-meta').textContent(), '9:16 · 3s');
  const recs = await M(page, () => window.__motion.libAll());
  assert.equal(recs.length, 1);
  const stored = await M(page, () => JSON.parse(localStorage.getItem('motion-editor:v1')));
  assert.equal(stored.id, recs[0].id, 'a cópia rápida ganhou o mesmo id');
  await card(page, 'Antigo').locator('.proj-open').click();
  await inEditor(page);
  assert.deepEqual(await M(page, () => [window.__motion.P().id, window.__motion.P().layers[0].name]), [recs[0].id, 'Caixa']);
  // recarregar com #editor fica no editor, no mesmo projeto
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__motion?.P());
  assert.equal(await M(page, () => window.__motion.isHome()), false);
  assert.equal(await M(page, () => window.__motion.P().id), recs[0].id);
  // Início sem pushState (entrou direto por #editor) tira o hash
  await home(page);
  assert.equal(await M(page, () => location.hash), '');
  await cardCount(page, 1);
});

test('banco antigo (IndexedDB v1) vira v2 sem perder os arquivos', async t => {
  const page = await open(t, { hash: '#editor' });
  // recria o estado de quem usava a versão anterior: só 'assets' na v1 e o projeto no localStorage
  await page.goto(`${origin}/README.md`, { waitUntil: 'load' });
  await M(page, async old => {
    await new Promise(r => { const d = indexedDB.deleteDatabase('motion-editor'); d.onsuccess = d.onerror = d.onblocked = r; });
    const c = new OffscreenCanvas(40, 30), g = c.getContext('2d'); g.fillStyle = '#00ff00'; g.fillRect(0, 0, 40, 30);
    const blob = await c.convertToBlob({ type: 'image/png' });
    await new Promise((res, rej) => {
      const r = indexedDB.open('motion-editor', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('assets');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const db = r.result, tx = db.transaction('assets', 'readwrite');
        tx.objectStore('assets').put({ blob, kind: 'image', name: 'verde.png', mime: 'image/png' }, 'img1');
        tx.oncomplete = () => { db.close(); res(); };
      };
    });
    localStorage.clear();
    localStorage.setItem('motion-editor:v1', JSON.stringify({ ...old, name: 'Com foto', assets: { img1: { kind: 'image', name: 'verde.png', mime: 'image/png' } },
      layers: [{ id: 'i', type: 'image', name: 'Foto', start: 0, end: 3, visible: true, parent: null, p: { x: 180, y: 320 }, kf: {}, s: { asset: 'img1', w: 200, h: 150 } }] }));
  }, OLD);
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await atHome(page); await cardCount(page, 1);
  assert.deepEqual(await M(page, () => new Promise(res => { const r = indexedDB.open('motion-editor'); r.onsuccess = () => { res([r.result.version, [...r.result.objectStoreNames]]); r.result.close(); }; })),
    [2, ['assets', 'projects']]);
  await card(page, 'Com foto').locator('.proj-open').click();
  await inEditor(page);
  await page.waitForFunction(() => window.__motion.A.get('img1')?.el?.naturalWidth === 40);
  assert.equal(await hasAsset(page, 'img1'), true);
});

test('voltar do navegador sai do editor para o início e avançar volta', async t => {
  const page = await open(t);
  await createProject(page, '4:5');
  await page.locator('[data-add="rect"]').click();
  await page.goBack();
  await atHome(page);
  assert.equal(await page.locator('#app').isHidden(), true);
  assert.equal(await M(page, () => location.hash), '');
  await cardCount(page, 1);
  assert.equal(await page.locator('#homeGrid .proj-meta').textContent(), '4:5 · 5s');
  assert.equal(JSON.parse((await M(page, () => window.__motion.libAll()))[0].json).layers.length, 1, 'gravou ao sair');
  await page.goForward();
  await inEditor(page);
  assert.equal(await M(page, () => window.__motion.P().layers.length), 1);
  // Início com pushState usa history.back(): o histórico não cresce
  const len = await M(page, () => history.length);
  await home(page);
  assert.equal(await M(page, () => history.length), len);
});

test('celular (360 e 390 px): início sem rolagem lateral, cartão abre com toque e Início no topo do editor', async t => {
  for (const [width, height] of [[360, 740], [390, 844]]) {
    const page = await open(t, { width, height, mobile: true });
    await atHome(page);
    const overflow = () => M(page, () => ({ doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      home: document.getElementById('home').scrollWidth - document.getElementById('home').clientWidth }));
    assert.deepEqual(await overflow(), { doc: 0, home: 0 }, `${width}: sem rolagem horizontal`);
    for (const sel of ['.home-new', '.home-act[data-home="templates"]', '.home-act[data-home="open"]', '.home-tpl']) {
      const b = await page.locator(sel).first().boundingBox();
      assert.ok(b.height >= 44 && b.width >= 44, `${width}: ${sel} com 44 px`);
    }
    const tpls = await M(page, () => { const r = document.getElementById('homeTpls'); return r.scrollWidth > r.clientWidth; });
    assert.ok(tpls, 'modelos rolam para o lado dentro da linha');
    await page.locator('.home-new').tap();
    await page.locator('#modalBody [data-fmt="9:16"]').tap();
    await inEditor(page);
    const hb = await page.locator('#btnHome').boundingBox();
    assert.equal(await page.locator('#btnHome').isVisible(), true, 'Início visível no topo');
    assert.ok(hb.width >= 40 && hb.height >= 40 && hb.x < 40, `${width}: Início à esquerda com 40 px`);
    for (const sel of ['#btnUndo', '#btnRedo', '#btnExport']) {
      const b = await page.locator(sel).boundingBox();
      assert.ok(b.width >= 40 && b.height >= 40 && b.x + b.width <= width, `${sel} cabe no topo`);
    }
    assert.equal(await M(page, () => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await page.locator('#btnHome').tap();
    await atHome(page); await cardCount(page, 1);
    assert.deepEqual(await overflow(), { doc: 0, home: 0 }, `${width}: sem rolagem com cartão`);
    const cols = await M(page, () => getComputedStyle(document.getElementById('homeGrid')).gridTemplateColumns.split(' ').length);
    assert.equal(cols, 2, 'duas colunas de projetos');
    const more = await page.locator('.proj-more').first().boundingBox();
    assert.ok(more.width >= 44 && more.height >= 44, 'opções com 44 px');
    await page.locator('#homeGrid .proj-open').first().tap();
    await inEditor(page);
    // Projeto > Meus projetos (folha do celular) também volta ao início
    await page.locator('[data-sheet-open="project"]').tap();
    await page.locator('#menu [data-menu="home"]').tap();
    await atHome(page);
    assert.equal(await M(page, () => document.getElementById('app').dataset.sheet || null), null, 'folha fechada');
  }
});
