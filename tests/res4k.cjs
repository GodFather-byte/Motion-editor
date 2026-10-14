'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// 4K: nível do codificador, janela Exportar, PNG e MP4 em 2160 px no lado menor.
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); });

async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', acceptDownloads: true });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion && window.__motion.P());
  return page;
}

test('Nível H.264 cresce com o tamanho e os quadros/s (4K30 = 5.1, 4K60 = 5.2)', async t => {
  const page = await editor(t);
  const lv = await page.evaluate(() => {
    const f = window.__motion.avcLevel;
    return [f(1280, 720, 30), f(1920, 1080, 30), f(1080, 1920, 60), f(3840, 2160, 30), f(2160, 3840, 60), f(7680, 4320, 30)];
  });
  assert.deepEqual(lv, ['1f', '28', '2a', '33', '34', '3c']);
});

test('Janela Exportar oferece 4K, mostra o tamanho estimado e gera PNG 4K', async t => {
  const page = await editor(t);
  await page.locator('#btnExport').click();
  const label = await page.locator('#expRes option[value="2160"]').textContent();
  assert.match(label, /^4K \(2160×3840\)/);
  await page.locator('#expRes').selectOption('2160');
  assert.match(await page.locator('#expSize').textContent(), /Tamanho estimado: .* MB\. 4K demora mais/);
  await page.locator('#expFmt').selectOption('png');
  await page.locator('#expRes').selectOption('2160');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#modalActions button', { hasText: 'Exportar' }).click(),
  ]);
  const png = readFileSync(await download.path());
  assert.equal(png.readUInt32BE(16), 2160, 'largura do PNG');
  assert.equal(png.readUInt32BE(20), 3840, 'altura do PNG');
});

test('MP4 em 4K: gera 2160×3840 quando o aparelho codifica, ou a opção fica desligada', async t => {
  const page = await editor(t);
  await page.evaluate(() => { const m = window.__motion; m.P().duration = 0.4; m.commit(); });
  const ok = await page.evaluate(async () => !!(await window.__motion.pickVideoCodec(2160, 3840, 30)));
  await page.locator('#btnExport').click();
  await page.locator('#expFps').selectOption('30');
  const opt = page.locator('#expRes option[value="2160"]');
  if (!ok) {
    await page.waitForFunction(() => document.querySelector('#expRes option[value="2160"]').disabled);
    assert.match(await opt.textContent(), /não disponível neste aparelho/);
    return;
  }
  await page.locator('#expRes').selectOption('2160');
  await page.locator('#modalActions button', { hasText: 'Exportar' }).click();
  await page.waitForFunction(() => /2160×3840/.test(document.querySelector('#modalBody')?.textContent || ''), null, { timeout: 180000 });
  assert.match(await page.locator('#modalBody').textContent(), /MP4 (H\.264|H\.265|VP9|AV1).* · 2160×3840 · 30 fps/);
});
