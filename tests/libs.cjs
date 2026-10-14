'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

// Bibliotecas abertas carregadas sob demanda: Lucide, wavesurfer.js, mp4box.js e opentype.js.
let browser, server, origin, fixtures, fontFile;
before(async () => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'motion-libs-test-'));
  const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
  // rotação gravada no arquivo (matriz do tkhd): o FFmpeg só escreve com display_rotation na regravação
  const base = path.join(fixtures, 'base.mp4');
  try {
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', base]);
  } catch {
    ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25', '-t', '2', '-c:v', 'mpeg4', base]);
  }
  ff(['-display_rotation', '90', '-i', base, '-c', 'copy', path.join(fixtures, 'rot.mp4')]);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', path.join(fixtures, 'tone.wav')]);
  fontFile = execFileSync('sh', ['-c', 'find /usr/share/fonts -name "*.ttf" | head -1']).toString().trim();
  assert.ok(fontFile, 'precisa de uma fonte .ttf no sistema para o teste');
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
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);
  return page;
}

test('Lucide: busca e ícone de traço vira camada com contorno', async t => {
  const page = await editor(t);
  await page.locator('#btnStickers').click();
  await page.locator('[data-tab="lucide"]').click();
  await page.locator('[data-lucide]').first().waitFor({ timeout: 60000 });
  await page.locator('#lucideQ').fill('heart');
  await page.locator('[data-lucide="heart"]').click();
  const layer = await page.evaluate(() => {
    const L = window.__motion.P().layers.find(l => l.type === 'icon');
    return L && { line: L.s.line, iconName: L.s.iconName, dLength: L.s.d.length };
  });
  assert.equal(layer.line, true, 'ícone de traço');
  assert.equal(layer.iconName, 'lucide-heart');
  assert.ok(layer.dLength > 20, 'caminho do ícone preenchido');
});

test('Áudio: forma de onda do wavesurfer aparece no painel', async t => {
  const page = await editor(t);
  await page.locator('[data-add="audio"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'tone.wav'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'audio'));
  await page.evaluate(() => window.__motion.select(window.__motion.P().layers.find(l => l.type === 'audio').id));
  // wavesurfer desenha num shadow DOM dentro do contêiner #waveBox
  await page.waitForFunction(() => !!document.querySelector('#waveBox')?.firstElementChild?.shadowRoot?.querySelector('canvas'),
    null, { timeout: 60000 });
});

test('MP4: mp4box lê a rotação gravada e os quadros por segundo', async t => {
  const page = await editor(t);
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'rot.mp4'));
  await page.waitForFunction(() => [...window.__motion.A.values()].some(r => r.kind === 'video' && r.info), null, { timeout: 60000 });
  const info = await page.evaluate(() => [...window.__motion.A.values()].find(r => r.kind === 'video').info);
  assert.equal(info.rotation, 90, 'rotação gravada no arquivo');
  assert.ok(Math.abs(info.fps - 25) < 1, `fps ${info.fps}`);
  assert.match(info.codec, /^(avc1|mp4v)/);
});

test('Fonte própria: .ttf válido entra na lista e vira a fonte do texto', async t => {
  const page = await editor(t);
  await page.locator('[data-add="text"]').click();
  const before = await page.evaluate(() => window.__motion.P().layers.find(l => l.type === 'text').s.font);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-act="font-upload"]').click()]);
  await chooser.setFiles(fontFile);
  await page.waitForFunction(prev => {
    const L = window.__motion.P().layers.find(l => l.type === 'text');
    return L && L.s.font !== prev;
  }, before, { timeout: 30000 });
  const family = await page.evaluate(() => window.__motion.P().layers.find(l => l.type === 'text').s.font);
  assert.ok(family.length > 1, 'nome da família lido do arquivo');
  assert.equal(await page.evaluate(f => document.fonts.check(`16px "${f}"`), family), true, 'fonte carregada');
});
