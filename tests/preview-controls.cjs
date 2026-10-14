'use strict';
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

async function editor(t, width = 1280, height = 800) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  t.after(() => context.close());
  await context.addInitScript(() => localStorage.setItem('motion-editor:v1', JSON.stringify({
    v: 2, name: 'Projeto teste', aspect: '16:9', width: 640, height: 360, fps: 30, duration: 2,
    background: '#102030', assets: {}, layers: [{ id: 'layer1', type: 'rect', name: 'Caixa', start: 0, end: 2, visible: true, parent: null,
      p: { x: 320, y: 180, scale: 100, rotation: 0, opacity: 100 }, kf: {}, s: { w: 120, h: 120, fill: '#ff0000' } }],
  })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__motion?.P());
  return page;
}

test('zoom da prévia amplia e retorna ao ajuste sem alterar o projeto', async t => {
  const page = await editor(t);
  const original = await page.evaluate(() => JSON.stringify(window.__motion.P()));
  const originalWidth = await page.locator('#canvas').evaluate(el => parseInt(el.style.width));
  await page.locator('#btnPreviewZoomIn').click();
  assert.equal(await page.locator('#btnPreviewFit').textContent(), '110%');
  assert.ok(await page.locator('#canvas').evaluate(el => parseInt(el.style.width)) > originalWidth);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__motion.P())), original, 'zoom não grava mudanças na composição');
  await page.locator('#btnPreviewFit').click();
  assert.equal(await page.locator('#btnPreviewFit').textContent(), '100%');
  assert.equal(await page.locator('#canvas').evaluate(el => parseInt(el.style.width)), originalWidth);
});

test('prévia segue utilizável em 360 px e Ctrl+S salva fora de campos de texto', async t => {
  const page = await editor(t, 360, 740);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    tools: document.querySelector('.workspace-head').getBoundingClientRect().height,
  }));
  assert.equal(dimensions.width, dimensions.clientWidth, 'sem rolagem horizontal na página');
  assert.ok(dimensions.tools > 0, 'controles de zoom visíveis no celular');
  for (let i = 0; i < 10; i++) await page.locator('#btnPreviewZoomIn').click();
  assert.equal(await page.locator('#btnPreviewFit').textContent(), '200%');
  assert.ok(await page.locator('#stage').evaluate(el => el.scrollWidth > el.clientWidth), 'zoom ampliado pode ser navegado dentro da prévia');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360, 'zoom não cria rolagem na página');
  await page.locator('#btnPreviewFit').click();
  await page.locator('#projectName').focus();
  await page.keyboard.press('Control+s');
  await assert.rejects(page.waitForEvent('download', { timeout: 250 }), /Timeout/);
  await page.locator('#projectName').blur();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ]);
  assert.match(download.suggestedFilename(), /\.motion\.json$/);
  const file = await download.path();
  const saved = require('node:fs').readFileSync(file, 'utf8');
  assert.equal(JSON.parse(saved).name, 'Projeto teste');
});
