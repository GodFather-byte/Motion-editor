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
  const context = await browser.newContext({ viewport: { width, height } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__motion?.P());
  return page;
}

test('marcador usa o cursor, aparece na régua e abre a edição', async t => {
  const page = await editor(t);
  const marker = await page.evaluate(() => {
    const m = window.__motion;
    m.setProject({ v: 2, name: 'Roteiro', aspect: '16:9', width: 1280, height: 720, fps: 30, duration: 5, background: '#111111', assets: {}, layers: [] });
    m.setTime(1.2);
    document.querySelector('#btnMarker').click();
    return m.P().markers[0];
  });
  assert.equal(marker.t, 1.2, 'mantém o tempo da agulha');
  assert.equal(marker.label, 'Marcador 1');
  await page.locator(`[data-marker-id="${marker.id}"]`).click();
  await assert.doesNotReject(page.locator('#markerLabel').waitFor());
  assert.equal(await page.locator('#markerTime').inputValue(), '1.2');
});

test('estúdio aplica estilos em lote e mantém o cartão de texto', async t => {
  const page = await editor(t);
  const before = await page.evaluate(() => {
    const m = window.__motion;
    m.setProject({ v: 2, name: 'Vídeo curto', aspect: '9:16', width: 1080, height: 1920, fps: 30, duration: 5, background: '#14122a', assets: {}, layers: [], markers: [], safeArea: false });
    m.createCaptionLayers({ start: 0 }, [
      { start: 0, end: 0.9, text: 'Primeira fala' },
      { start: 1.1, end: 2, text: 'Segunda fala' },
    ], 'faixa');
    const group = m.P().layers.find(layer => layer.s.captionGroup);
    m.select(group.id);
    return {
      style: group.s.captionStyle,
      captions: m.P().layers.filter(layer => layer.parent === group.id).map(layer => ({ backplate: layer.s.backplate, color: layer.s.backColor })),
    };
  });
  assert.equal(before.style, 'faixa');
  assert.deepEqual(before.captions, [{ backplate: true, color: '#d3f88a' }, { backplate: true, color: '#d3f88a' }]);
  await page.locator('.caption-style-card[data-caption-style="conversa"]').click();
  const after = await page.evaluate(() => {
    const m = window.__motion, group = m.P().layers.find(layer => layer.s.captionGroup);
    return { style: group.s.captionStyle, cards: document.querySelectorAll('.caption-style-card').length,
      captions: m.P().layers.filter(layer => layer.parent === group.id).map(layer => ({ backplate: layer.s.backplate, color: layer.s.backColor })) };
  });
  assert.equal(after.style, 'conversa');
  assert.equal(after.cards, 5, 'mostra os cinco estilos próprios');
  assert.deepEqual(after.captions, [{ backplate: true, color: '#0c0f11' }, { backplate: true, color: '#0c0f11' }]);
});

test('guia de área segura fica só na prévia vertical', async t => {
  const page = await editor(t);
  await page.evaluate(() => { const m = window.__motion; m.setProject({ v: 2, name: 'Vídeo curto', aspect: '9:16', width: 1080, height: 1920, fps: 30, duration: 5, background: '#14122a', assets: {}, layers: [], markers: [], safeArea: false }); m.select(null); });
  await page.locator('[data-proj-check="safeArea"]').check();
  const guide = await page.evaluate(() => {
    const m = window.__motion, overlay = document.querySelector('#overlay');
    const pixel = overlay.getContext('2d').getImageData(1, 1, 1, 1).data;
    return { enabled: m.P().safeArea, alpha: pixel[3] };
  });
  assert.equal(guide.enabled, true);
  assert.ok(guide.alpha > 0, 'a faixa de área segura desenha no canvas de sobreposição');
});

test('celular não mostra o fluxo compacto do desktop nem cria rolagem lateral', async t => {
  const page = await editor(t, 360, 740);
  const mobile = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    quickFlow: getComputedStyle(document.querySelector('.quick-flow')).display,
    markerWidth: document.querySelector('#btnMarker').getBoundingClientRect().width,
  }));
  assert.equal(mobile.scrollWidth, mobile.clientWidth, 'sem rolagem lateral na página');
  assert.equal(mobile.quickFlow, 'none');
  assert.ok(mobile.markerWidth >= 32, 'marcador continua acessível no cabeçalho da timeline');
});
