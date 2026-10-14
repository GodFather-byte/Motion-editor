'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');

// Apoiar o projeto: sem chave PIX nem links preenchidos em DONATE, o item do menu fica escondido.
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
after(async () => {
  await browser?.close(); server?.kill();
});

test('Apoiar: item escondido sem chave PIX nem links configurados', async t => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);
  await page.locator('#btnMenu').click();
  assert.equal(await page.locator('#menu [data-menu="donate"]').isHidden(), true, 'Apoiar fica escondido por padrão');
  assert.equal(await page.locator('#menu [data-menu="help"]').isVisible(), true, 'os outros itens continuam visíveis');
});
