'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

// Rastreio de movimento e cortes por cena: tudo roda no navegador, sem nuvem.
let browser, server, origin, fixtures;
before(async () => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'motion-modern-test-'));
  const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
  // quadrado branco que anda 100 px/s, na horizontal, em um vídeo 320×180
  // (overlay aceita t como tempo; drawbox não)
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=white:s=40x40:r=30:d=2',
    '-filter_complex', "[0:v][1:v]overlay=x='20+100*t':y=60:shortest=1[v]", '-map', '[v]',
    '-c:v', 'libvpx', '-b:v', '2M', path.join(fixtures, 'moving.webm')]);
  // vermelho por 1 s, depois azul por 1 s: uma troca de cena em t = 1
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=1',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libvpx', '-b:v', '2M', path.join(fixtures, 'cut.webm')]);
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', data => {
      const port = String(data).match(/port (\d+)/);
      if (port) resolve(`http://localhost:${port[1]}`);
    });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close(); server?.kill();
  if (fixtures) rmSync(fixtures, { recursive: true, force: true });
});

async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);
  return page;
}

test('Rastreio: a camada segue o ponto que se move atrás dela e grava keyframes', async t => {
  const page = await editor(t);
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'moving.webm'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'video'), null, { timeout: 60000 });
  // o vídeo ocupa o projeto com encaixe "contain", centralizado: calcula onde está o quadrado no início
  const geo = await page.evaluate(() => {
    const m = window.__motion, P = m.P();
    const v = P.layers.find(l => l.type === 'video'), rec = m.A.get(v.s.asset);
    const s = Math.min(P.width / rec.w, P.height / rec.h);
    const offX = (P.width - rec.w * s) / 2, offY = (P.height - rec.h * s) / 2;
    return { s, cx: offX + 40 * s, cy: offY + 80 * s, dur: v.end - v.start };
  });
  await page.evaluate(({ cx, cy, dur }) => {
    const m = window.__motion;
    m.setTime(0);
    m.addLayer(m.makeLayer('rect', { name: 'Alvo', s: { fill: '#ff0000' } }));
    const R = m.P().layers.find(l => l.name === 'Alvo');
    R.p.x = cx; R.p.y = cy; R.start = 0; R.end = dur;
    m.select(R.id); m.commit();
  }, geo);
  await page.locator('[data-act="track"]').click();
  await page.waitForFunction(() => {
    const L = window.__motion.P().layers.find(l => l.name === 'Alvo');
    return !!(L && L.kf.x && L.kf.x.length > 10);
  }, null, { timeout: 120000 });
  const res = await page.evaluate(() => {
    const L = window.__motion.P().layers.find(l => l.name === 'Alvo'), xs = L.kf.x;
    return { first: xs[0].v, last: xs[xs.length - 1].v, lastT: xs[xs.length - 1].t };
  });
  // o quadrado anda 100 px de vídeo por segundo; em pixels do projeto, isso é 100 × t × escala
  const expected = 100 * res.lastT * geo.s, moved = res.last - res.first;
  assert.ok(Math.abs(moved - expected) < 0.12 * expected, `deslocamento ${moved.toFixed(1)} px, esperado ${expected.toFixed(1)} px`);
});

test('Cortes por cena: vídeo com troca de cor vira duas camadas no ponto da troca', async t => {
  const page = await editor(t);
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'cut.webm'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'video'), null, { timeout: 60000 });
  await page.evaluate(() => { const m = window.__motion; m.select(m.P().layers.find(l => l.type === 'video').id); });
  await page.locator('[data-act="scene-cut"]').click();
  await page.waitForFunction(() => window.__motion.P().layers.filter(l => l.type === 'video').length === 2, null, { timeout: 120000 });
  const parts = await page.evaluate(() => window.__motion.P().layers.filter(l => l.type === 'video')
    .map(l => [l.start, l.end]).sort((a, b) => a[0] - b[0]));
  assert.ok(Math.abs(parts[0][1] - 1) < 0.15, `corte em ${parts[0][1].toFixed(2)} s, esperado ~1 s`);
});
