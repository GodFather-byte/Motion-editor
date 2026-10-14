'use strict';
/* Câmera virtual, camada de efeito (WebGL), chroma key, partículas e texto curvo/no traço.
   Rode com: node --test tests/effects.cjs */
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
    server.stdout.on('data', d => { const m = String(d).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    const L = (id, name, p, s) => ({ id, type: 'rect', name, start: 0, end: 4, visible: true, parent: null,
      p: Object.assign({ x: 540, y: 960, scale: 100, rotation: 0, opacity: 100 }, p), kf: {}, s });
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'FX', aspect: '9:16', width: 1080, height: 1920, fps: 30, duration: 4,
      background: '#202020', assets: {}, layers: [
        L('c', 'Centro', {}, { w: 200, h: 200, fill: '#ffffff' }),
        L('o', 'Lado', { x: 740 }, { w: 100, h: 100, fill: '#ff0000' }),
        L('f', 'Fixo', { x: 100, y: 100 }, { w: 80, h: 80, fill: '#0000ff', parallax: 0 })] }));
    sessionStorage.setItem('seeded', '1');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin + '/#editor', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}
const px = (page, x, y) => page.evaluate(([x, y]) => [...document.querySelector('#canvas').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);

test('câmera dá zoom na cena e respeita o parallax 0', async t => {
  const page = await editor(t);
  await page.click('[data-add=camera]');
  await page.evaluate(() => { const M = window.__motion; M.P().layers[0].p.scale = 200; M.select(null); M.setTime(1); });
  assert.deepEqual(await px(page, 940, 960), [255, 0, 0], 'o quadrado do lado se afasta do centro com o zoom');
  assert.deepEqual(await px(page, 100, 100), [0, 0, 255], 'camada com parallax 0 fica fixa na tela');
  await page.evaluate(() => { const M = window.__motion; M.select(M.P().layers[0].id); });
  assert.deepEqual(await px(page, 740, 960), [255, 0, 0], 'com a câmera selecionada aparece a cena inteira');
});

test('camada de efeito escurece as bordas (vinheta)', async t => {
  const page = await editor(t);
  await page.click('[data-add=fx]');
  await page.evaluate(() => { const M = window.__motion; M.P().layers[0].s.amount = 100; M.select(null); M.setTime(1); });
  const corner = await px(page, 10, 10), mid = await px(page, 540, 700);
  assert.ok(corner[0] < mid[0] - 10, `canto ${corner} deveria ser mais escuro que o meio ${mid}`);
});

test('chroma key remove o verde e mantém o resto', async t => {
  const page = await editor(t);
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400;
    const g = c.getContext('2d'); g.fillStyle = '#00ff00'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#ff0000'; g.fillRect(150, 150, 100, 100);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const M = window.__motion, rec = await M.registerAsset(blob, 'image', 'verde.png');
    const L = M.makeLayer('image', { name: 'Verde', p: { x: 540, y: 1500 }, s: { asset: rec.id, w: 400, h: 400, chromaOn: true } });
    M.addLayer(L, true); M.select(null); M.setTime(1);
  });
  assert.deepEqual(await px(page, 380, 1500), [32, 32, 32], 'a parte verde vira o fundo');
  assert.deepEqual(await px(page, 540, 1500), [255, 0, 0], 'o vermelho continua');
});

test('partículas aparecem e todos os tipos desenham sem erro', async t => {
  const page = await editor(t);
  await page.click('[data-add=particles]');
  for (const pre of ['sparks', 'snow', 'smoke', 'bubbles', 'twinkle', 'confetti']) await page.selectOption('#s-preset', pre);
  await page.evaluate(() => window.__motion.setTime(1.2));
  const colored = await page.evaluate(() => {
    const c = document.querySelector('#canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - d[i + 1]) > 60 || Math.abs(d[i + 1] - d[i + 2]) > 60) n++;
    return n;
  });
  assert.ok(colored > 100, `confete visível (${colored})`);
});

test('texto curvo e texto no traço desenham e o traço vira máscara', async t => {
  const page = await editor(t);
  await page.evaluate(() => {
    const M = window.__motion;
    M.addLayer(M.makeLayer('text', { name: 'Curvo', p: { y: 400 }, s: { text: 'CURVADO', curve: 60, size: 90 } }), true);
    const pa = M.makeLayer('path', { name: 'Trilha', p: { y: 1300 }, s: { points: [[-400, 0], [0, -150], [400, 0]] } });
    M.addLayer(pa, true);
    M.addLayer(M.makeLayer('text', { name: 'NoTraço', p: { y: 1300 }, s: { text: 'seguindo', size: 60, onPath: pa.id } }), true);
    M.select(pa.id); M.setTime(1);
  });
  await page.click('[data-act=path-mask]');
  const r = await page.evaluate(() => { const P = window.__motion.P(); const i = P.layers.findIndex(l => l.name === 'Trilha'); return [P.layers[i].s.fillOn, P.layers[i - 1].name, P.layers[i - 1].s.clip]; });
  assert.deepEqual(r, [true, 'NoTraço', true]);
});
