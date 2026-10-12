'use strict';
/* Testes do painel "Código" (GSAP isolado em iframe + worker).
   Precisa de internet para baixar o GSAP do jsDelivr. Rode com: node --test tests/code-animation.cjs */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin;
before(async () => {
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', data => {
      const port = String(data).match(/port (\d+)/);
      if (port) resolve(`http://localhost:${port[1]}`);
    });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (window.top !== window) return;   // o iframe isolado do código não tem armazenamento
    if (sessionStorage.getItem('seeded')) return;
    const L = (id, name, x, y) => ({ id, type: 'rect', name, start: 0, end: 4, visible: true, parent: null,
      p: { x, y, scale: 100, rotation: 0, opacity: 100 }, kf: {}, s: { w: 40, h: 40, fill: '#ff0000' } });
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Teste', aspect: '9:16',
      width: 180, height: 320, fps: 30, duration: 4, background: '#000000', assets: {},
      layers: [L('a', 'Frente', 90, 100), L('b', 'Fundo', 90, 200)] }));
    sessionStorage.setItem('seeded', '1');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}

async function apply(page, code) {
  if (await page.evaluate(() => document.querySelector('#modal').hidden)) await page.click('#btnCode');
  await page.fill('#codeIn', code);
  await page.click('.modal-actions .btn-primary');
  await page.waitForFunction(() => document.querySelector('#modal').hidden ||
    /Linha|não|demorou|nada/i.test((document.querySelector('#codeStatus') || {}).textContent || ''), null, { timeout: 20000 });
  return page.evaluate(() => document.querySelector('#modal').hidden ? '' : document.querySelector('#codeStatus').textContent);
}
const valueAt = (page, name, prop, t) => page.evaluate(([name, prop, t]) => {
  const M = window.__motion, L = M.P().layers.find(l => l.name === name);
  M.setTime(t);
  const k = L.kf[prop];
  if (!k || !k.length) return L.p[prop];
  // interpolação linear entre keyframes, igual ao editor
  if (t <= k[0].t) return k[0].v;
  for (let i = 0; i < k.length - 1; i++) if (t <= k[i + 1].t) return k[i].v + (k[i + 1].v - k[i].v) * (t - k[i].t) / (k[i + 1].t - k[i].t);
  return k[k.length - 1].v;
}, [name, prop, t]);

test('tween GSAP vira keyframes com as unidades do editor', async t => {
  const page = await editor(t);
  assert.equal(await apply(page, "tl.fromTo(layer('Frente'), { x: 0, opacity: 0 }, { x: 150, opacity: 1, duration: 1, ease: 'none' });"), '');
  assert.ok(Math.abs(await valueAt(page, 'Frente', 'x', 0.5) - 75) < 1.5);
  assert.ok(Math.abs(await valueAt(page, 'Frente', 'opacity', 0.5) - 50) < 1);
  assert.ok(Math.abs(await valueAt(page, 'Frente', 'x', 2) - 150) < 1);
  const codeKf = await page.evaluate(() => window.__motion.P().layers.find(l => l.name === 'Frente').codeKf);
  assert.deepEqual(codeKf.sort(), ['opacity', 'x']);
});

test('aplicar de novo substitui a animação anterior e as camadas criadas', async t => {
  const page = await editor(t);
  await apply(page, "add('star', { name: 'Nova' }); tl.to(layers[1], { rotation: 90, duration: 1 });");
  await apply(page, "tl.to(layers[0], { scale: 2, duration: 1 });");
  const s = await page.evaluate(() => {
    const P = window.__motion.P();
    return { names: P.layers.map(l => l.name), fundo: P.layers.find(l => l.name === 'Fundo').kf.rotation || null };
  });
  assert.deepEqual(s.names, ['Frente', 'Fundo']);
  assert.equal(s.fundo, null);
});

test('every() e random() são determinísticos', async t => {
  const page = await editor(t);
  const code = "const b = add('ellipse', { name: 'Bola', x: random(0, 100) }); every(t => { b.y = 100 + t * 10; });";
  await apply(page, code);
  const first = await page.evaluate(() => window.__motion.P().layers.find(l => l.name === 'Bola').p.x);
  await apply(page, code);
  const second = await page.evaluate(() => window.__motion.P().layers.find(l => l.name === 'Bola').p.x);
  assert.equal(first, second);
  assert.ok(Math.abs(await valueAt(page, 'Bola', 'y', 2) - 120) < 1.5);
});

test('erros mostram a linha e o código não acessa o armazenamento do app', async t => {
  const page = await editor(t);
  assert.match(await apply(page, 'tl.to(layers[0], { x: 1 });\nfoo();'), /^Linha 2: /);
  assert.match(await apply(page, "localStorage.getItem('motion-editor:ai');"), /localStorage/);
  assert.match(await apply(page, "layer('Nada');"), /não encontrada/);
});
