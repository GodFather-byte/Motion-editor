'use strict';
/* Música e redes sociais: detectar batidas, animar e montar na batida, batidas prontas, gravar voz e figurinhas.
   Rode com: node --test tests/music.cjs */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin, dir, clickFile;

/* trilha de teste: um clique a cada 0,5 s (120 BPM), o primeiro em 0,13 s */
function clickTrack(seconds = 8, bpm = 120, first = 0.13) {
  const rate = 44100, n = Math.round(seconds * rate), data = Buffer.alloc(44 + n * 2);
  const pcm = new Float32Array(n);
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s0 = Math.round(t * rate);
    for (let i = 0; i < rate * 0.04 && s0 + i < n; i++) pcm[s0 + i] += 0.8 * Math.sin(2 * Math.PI * 1000 * i / rate) * Math.exp(-i / (rate * 0.008));
  }
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 2, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  return data;
}

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motion-music-test-'));
  clickFile = path.join(dir, 'clique120.wav');
  writeFileSync(clickFile, clickTrack());
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', d => { const m = String(d).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await browser?.close(); server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Música', aspect: '9:16', width: 1080, height: 1920, fps: 30, duration: 8,
      background: '#202020', assets: {}, layers: [{ id: 't', type: 'text', name: 'Título', start: 0, end: 8, visible: true, parent: null,
        p: { x: 540, y: 960, scale: 100, rotation: 0, opacity: 100 }, kf: {}, s: { text: 'BATIDA', size: 120, fill: '#ffffff' } }] }));
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
async function addMusic(page) {
  await page.evaluate(() => window.__motion.setTime(0));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-add=audio]')]);
  await chooser.setFiles(clickFile);
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'audio'));
  await page.click('[data-act=beats]');
  await page.waitForFunction(() => window.__motion.P().layers.find(l => l.type === 'audio').s.beats, null, { timeout: 15000 });
}
const layer = (page, fn) => page.evaluate(`(${fn})(window.__motion.P().layers)`);

test('detecta 120 BPM, marca as batidas e anima o texto na batida', async t => {
  const page = await editor(t);
  await addMusic(page);
  const [bpm, first, count] = await layer(page, ls => { const L = ls.find(l => l.type === 'audio'); return [L.s.bpm, L.s.beats[0], L.s.beats.length]; });
  assert.equal(bpm, 120);
  assert.ok(Math.abs(first - 0.13) < 0.03, `primeira batida em ${first}`);
  assert.equal(count, 16);
  assert.equal(await page.locator('.beat-mark').count(), 16, 'marcas na régua');

  await page.evaluate(() => { const M = window.__motion; M.select(M.P().layers.find(l => l.name === 'Título').id); });
  await page.click('[data-beat=beatPulse]');
  const scale = await layer(page, ls => ls.find(l => l.name === 'Título').kf.scale);
  assert.equal(scale.length, 1 + 16 * 3, 'três keyframes por batida');
  assert.ok(scale.some(k => Math.abs(k.v - 115) < 0.01), 'o texto cresce 15% na batida');
});

test('montagem coloca as fotos uma por batida', async t => {
  const page = await editor(t);
  await addMusic(page);
  await page.evaluate(async () => {
    const M = window.__motion;
    for (const color of ['#ff0000', '#00ff00']) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 64, 64);
      const rec = await M.registerAsset(await new Promise(r => c.toBlob(r, 'image/png')), 'image', color + '.png');
      M.addLayer(M.makeLayer('image', { name: color, s: { asset: rec.id, w: 400, h: 400 } }), true);
    }
    M.select(M.P().layers.find(l => l.type === 'audio').id);
  });
  await page.click('[data-act=montage]');
  const r = await layer(page, ls => {
    const beats = ls.find(l => l.type === 'audio').s.beats;
    const imgs = ls.filter(l => l.type === 'image').sort((a, b) => a.start - b.start);
    return { n: imgs.length, onBeat: imgs.every(l => beats.some(b => Math.abs(b - l.start) <= 1 / 30)), gapless: imgs.every((l, i) => i === 0 || Math.abs(imgs[i - 1].end - l.start) < 1e-6) };
  });
  assert.equal(r.n, 7, 'a cada 2 batidas, repetindo as fotos');
  assert.ok(r.onBeat, 'cada foto começa numa batida');
  assert.ok(r.gapless, 'sem buracos entre as fotos');
});

test('batida pronta gera música sem direitos com as batidas marcadas', async t => {
  const page = await editor(t);
  for (const [style, bpm] of [['funk', 130], ['lofi', 84]]) {
    await page.click('#btnBeats');
    await page.selectOption('#bmStyle', style);
    await page.fill('#bmDur', '4');
    await page.click('.modal-actions .btn-primary');
    await page.waitForFunction(b => window.__motion.P().layers.some(l => l.s.bpm === b && l.type === 'audio'), bpm, { timeout: 20000 });
    const r = await page.evaluate(b => { const M = window.__motion, L = M.P().layers.find(l => l.s.bpm === b); const a = M.A.get(L.s.asset); return [L.s.beats.length, Math.round(a.duration), !!a.buffer]; }, bpm);
    assert.deepEqual(r, [Math.ceil(4 * bpm / 60), 4, true], style);
  }
});

test('grava narração pelo microfone', async t => {
  const page = await editor(t);
  await page.click('#btnVoice');
  await page.uncheck('#recPlay');
  await page.click('.modal-actions .btn-primary');
  await page.waitForTimeout(1500);
  await page.click('.modal-actions .btn-primary');
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.name === 'Narração'), null, { timeout: 10000 });
  const [start, len, ok] = await layer(page, ls => { const L = ls.find(l => l.name === 'Narração'); return [L.start, L.end - L.start, !!window.__motion.A.get(L.s.asset)]; });
  assert.equal(start, 0);
  assert.ok(len > 1 && len < 4, `duração ${len}`);
  assert.ok(ok);
});

test('figurinhas: emoji vira texto e ícone vetorial troca de desenho', async t => {
  const page = await editor(t);
  await page.click('#btnStickers');
  await page.click('[data-emoji="🔥"]');
  await page.click('#btnStickers');
  await page.click('[data-tab=icon]');
  await page.click('[data-icon="coração"]');
  const before = await layer(page, ls => ls[0].s.d);
  await page.selectOption('#s-iconName', 'raio');
  const r = await layer(page, ls => [ls[0].type, ls[0].s.iconName, ls[1].type, ls[1].s.text]);
  assert.deepEqual(r, ['icon', 'raio', 'text', '🔥']);
  assert.notEqual(await layer(page, ls => ls[0].s.d), before, 'o desenho mudou');
  await page.evaluate(() => { window.__motion.select(null); window.__motion.setTime(1); });
  const filled = await page.evaluate(() => {
    const d = document.querySelector('#canvas').getContext('2d').getImageData(0, 0, 1080, 1920).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 120) n++;
    return n;
  });
  assert.ok(filled > 500, `ícone vermelho visível (${filled})`);
});
