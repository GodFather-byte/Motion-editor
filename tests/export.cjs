'use strict';
/* Exportação rápida (WebCodecs), GIF e preview leve. Precisa de internet (mp4-muxer e gifenc vêm do jsDelivr) e de FFmpeg.
   Rode com: node --test tests/export.cjs */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin, dir;
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motion-export-test-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', path.join(dir, 'tone.wav')]);
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', d => { const m = String(d).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

async function editor(t, viewport = { width: 1280, height: 800 }, size = [360, 640]) {
  const context = await browser.newContext({ viewport });
  t.after(() => context.close());
  await context.addInitScript(([w, h]) => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Teste', aspect: '9:16', width: w, height: h, fps: 30, duration: 2,
      background: '#102030', assets: {}, layers: [{ id: 'a', type: 'rect', name: 'Caixa', start: 0, end: 2, visible: true, parent: null,
        p: { x: 180, y: 320, scale: 100, rotation: 0, opacity: 100 }, kf: { x: [{ t: 0, v: 60, e: 'linear' }, { t: 2, v: 300, e: 'linear' }] },
        s: { w: 120, h: 120, fill: '#ff0000' } }] }));
    sessionStorage.setItem('seeded', '1');
  }, size);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}
async function saveResult(page, selector, file) {
  const b64 = await page.evaluate(async sel => {
    const buf = new Uint8Array(await (await fetch(document.querySelector(sel).src)).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(s);
  }, selector);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}
const probe = (file, args) => execFileSync('ffprobe', ['-v', 'error', ...args, '-of', 'csv=p=0', file]).toString().trim();

test('MP4 rápido tem todos os quadros, som e a resolução escolhida', async t => {
  const page = await editor(t);
  await page.evaluate(() => window.__motion.setTime(0));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-add=audio]')]);
  await chooser.setFiles(path.join(dir, 'tone.wav'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'audio'));
  await page.evaluate(() => { window.__motion.P().duration = 2; });
  await page.click('#btnExport');
  await page.selectOption('#expRes', '720');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar' }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Vídeo pronto', null, { timeout: 60000 });
  const file = await saveResult(page, '#modal video', path.join(dir, 'out.mp4'));
  assert.equal(probe(file, ['-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames']), '60');
  assert.equal(probe(file, ['-select_streams', 'v', '-show_entries', 'stream=width,height']), '720,1280');
  assert.match(probe(file, ['-select_streams', 'a', '-show_entries', 'stream=codec_name']), /aac|opus/);
});

test('GIF com fundo transparente', async t => {
  const page = await editor(t);
  await page.click('#btnExport');
  await page.selectOption('#expFmt', 'gif');
  await page.check('#expAlpha');
  await page.selectOption('#expGif', '320');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar' }).click();
  await page.waitForSelector('#modal img.export-preview', { timeout: 60000 });
  const file = await saveResult(page, '#modal img.export-preview', path.join(dir, 'out.gif'));
  assert.equal(probe(file, ['-show_entries', 'stream=width,height']), '320,569');
  assert.equal(probe(file, ['-count_frames', '-show_entries', 'stream=nb_read_frames']), '30');
});

test('preview desenha em resolução menor só enquanto toca', async t => {
  const page = await editor(t, { width: 393, height: 852 }, [1080, 1920]);
  await page.click('#btnPlay');
  await page.waitForTimeout(300);
  const playing = await page.evaluate(() => document.querySelector('#canvas').width);
  await page.click('#btnPlay');
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => document.querySelector('#canvas').width);
  assert.ok(playing < 1080, `tocando: ${playing}`);
  assert.equal(paused, 1080);
});
