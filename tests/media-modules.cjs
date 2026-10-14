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
    server.stdout.on('data', data => { const m = String(data).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); });
async function editor(t) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', err => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin + '/#editor');
  await page.waitForFunction(() => window.__motion?.P());
  await page.evaluate(() => {
    const m = window.__motion;
    m.P().layers = [m.makeLayer('rect', { start: 1, end: 3 })];
    m.P().duration = 10;
    m.setProject(m.P()); m.commit();
  });
  return page;
}
async function pointer(page, target, type, id, x, y = 20) {
  await page.locator(target).evaluate((el, e) => el.dispatchEvent(new PointerEvent(e.type, {
    bubbles: true, cancelable: true, pointerId: e.id, pointerType: 'touch', clientX: e.x, clientY: e.y
  })), { type, id, x, y });
}

test('360 px: fallback seguro, alças de 44 px, pinça e scroll sem arrastar clipe', async t => {
  const page = await editor(t);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  assert.ok(await page.locator('.tl-trim.left').evaluate(el => parseFloat(getComputedStyle(el, '::before').width)) >= 44);
  assert.equal(await page.evaluate(() => window.ChromeAIService.checkAvailability()), 'unavailable');
  const initial = await page.evaluate(() => window.__motion.S.pps);
  await pointer(page, '.clip', 'pointerdown', 1, 170);
  await pointer(page, '.clip', 'pointerdown', 2, 250);
  await pointer(page, '#tlScroll', 'pointermove', 2, 290);
  await page.waitForTimeout(40);
  await pointer(page, '#tlScroll', 'pointerup', 2, 290);
  await pointer(page, '#tlScroll', 'pointerup', 1, 170);
  assert.ok(await page.evaluate(() => window.__motion.S.pps) > initial);
  await pointer(page, '.clip', 'pointerdown', 3, 290);
  await pointer(page, '#tlScroll', 'pointermove', 3, 200);
  await page.waitForTimeout(40);
  await pointer(page, '#tlScroll', 'pointerup', 3, 200);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].start), 1);
});

test('toque longo move e cancelamento restaura; trim mantém undo', async t => {
  const page = await editor(t);
  await pointer(page, '.clip', 'pointerdown', 1, 200);
  await page.waitForTimeout(280);
  await pointer(page, '#tlScroll', 'pointermove', 1, 260);
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].start), 1.5);
  await pointer(page, '#tlScroll', 'pointercancel', 1, 260);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].start), 1);
  await pointer(page, '.tl-trim.right', 'pointerdown', 2, 250);
  await pointer(page, '#tlScroll', 'pointermove', 2, 310);
  await page.waitForTimeout(40);
  await pointer(page, '#tlScroll', 'pointerup', 2, 310);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].end), 3.5);
  await page.locator('#btnUndo').click();
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].end), 3);
});

test('chip corta áudio real preservando velocidade, original e desfazer', async t => {
  const page = await editor(t);
  await page.evaluate(async () => {
    const m = window.__motion, rate = 8000, n = 4 * rate;
    const bytes = new ArrayBuffer(44 + n * 2), view = new DataView(bytes);
    const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, i >= rate && i < 3 * rate ? 0 : Math.sin(i * 0.2) * 16000, true);
    const rec = await m.registerAsset(new Blob([bytes], { type: 'audio/wav' }), 'audio', 'fala.wav');
    const L = m.makeLayer('audio', { start: 1, end: 3, s: { asset: rec.id, speed: 2 } });
    m.P().layers = [L]; m.commit(); m.select(L.id);
  });
  await page.locator('[data-sheet-open="ia"]').click();
  await page.locator('#btnSilenceCut').click();
  await page.waitForFunction(() => window.__motion.P().layers.length === 2);
  const parts = await page.evaluate(() => window.__motion.P().layers.map(L => ({ start: L.start, end: L.end, trim: L.s.trimIn, speed: L.s.speed, muted: L.s.muted })));
  assert.equal(parts[0].start, 1);
  assert.equal(parts[0].end, parts[1].start);
  assert.ok(parts[1].trim >= 2.8 && parts[1].trim <= 3);
  assert.ok(parts.every(p => p.speed === 2 && !p.muted));
  await page.locator('#btnUndo').click();
  assert.equal(await page.evaluate(() => window.__motion.P().layers.length), 1);
});

test('share target entrega File ao cache e importador e limpa a entrada', async t => {
  const page = await editor(t);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const data = new FormData(); data.append('media', new File([blob], 'foto ação.png', { type: blob.type }));
    const response = await fetch('./share-target', { method: 'POST', body: data });
    if (!response.ok) throw new Error('Compartilhamento falhou');
  });
  await page.goto(origin + '/?shared-test=1#editor?shared=1');
  await page.waitForFunction(() => window.__motion.P()?.layers.some(L => L.type === 'image' && L.name === 'foto ação'));
  assert.equal(await page.evaluate(async () => (await (await caches.open('shared-media')).keys()).length), 0);
});

test('snap vibra apenas na transição e OPFS salva, lista, lê e exclui', async t => {
  const page = await editor(t);
  const result = await page.evaluate(async () => {
    const service = MobilePWAIntegration, vibrate = service.triggerHaptic;
    let vibrations = 0;
    service.triggerHaptic = () => vibrations++;
    const engine = new TimelineTouchEngine(document.createElement('div'), { getScale: () => 100 });
    const first = engine.calculateSnap(1.05, [0, 1, 3], 10);
    engine.calculateSnap(1.02, [1], 10);
    engine.calculateSnap(2, [1], 10);
    engine.calculateSnap(1.01, [1], 10);
    engine.destroy(); service.triggerHaptic = vibrate;
    const saved = await service.saveMediaToOPFS('test.wav', new Blob(['audio'], { type: 'audio/wav' }));
    const listed = await service.listMediaInOPFS();
    const url = await service.loadMediaFromOPFS('test.wav');
    const text = url ? await (await fetch(url)).text() : null;
    if (url) URL.revokeObjectURL(url);
    const invalid = await service.saveMediaToOPFS('../escape', new Blob(['x']));
    const deleted = await service.deleteMediaFromOPFS('test.wav');
    return { first, vibrations, saved, listed, text, invalid, deleted };
  });
  assert.equal(result.first.time, 1);
  assert.equal(result.vibrations, 2);
  assert.equal(result.saved, true);
  assert.ok(result.listed.includes('test.wav'));
  assert.equal(result.text, 'audio');
  assert.equal(result.invalid, false);
  assert.equal(result.deleted, true);
});

test('ripple com conversores reais preserva a integral da rampa em cada sub-clipe', async t => {
  const page = await editor(t);
  const result = await page.evaluate(() => {
    const m = window.__motion;
    const L = m.makeLayer('audio', { start: 1, end: 5, s: { speed: 0.5, trimIn: 2, rampPts: [[1, 1], [3, 2], [5, 1]] } });
    const before = JSON.stringify(L);
    const intervals = [{ start: m.srcTime(L, 1), end: m.srcTime(L, 2) }, { start: m.srcTime(L, 3), end: m.srcTime(L, 5) }];
    const parts = SmartSilenceCutter.applyRippleDelete(L, intervals, { srcTime: m.srcTime, timeAtSrc: m.timeAtSrc });
    return {
      unchanged: before === JSON.stringify(L),
      bounds: parts.map((p, i) => [m.srcTime(p, p.start) - intervals[i].start, m.srcTime(p, p.end) - intervals[i].end]),
      positions: parts.map(p => [p.start, p.end])
    };
  });
  assert.equal(result.unchanged, true);
  for (const bounds of result.bounds) assert.ok(bounds.every(n => Math.abs(n) < 1e-8));
  assert.equal(result.positions[0][1], result.positions[1][0]);
});

test('exportação em tempo real libera Wake Lock ao cancelar', async t => {
  const page = await editor(t);
  await page.evaluate(() => {
    window.wakeCalls = [];
    MobilePWAIntegration.enableWakeLock = async () => { wakeCalls.push('enable'); return false; };
    MobilePWAIntegration.releaseWakeLock = async () => { wakeCalls.push('release'); return true; };
  });
  await page.locator('#btnExport').click();
  if (await page.locator('#expFmt option[value="live"]').count()) await page.selectOption('#expFmt', 'live');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.waitForFunction(() => window.__motion.S.exporting);
  await page.locator('#modalActions').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.waitForFunction(() => wakeCalls.includes('release') && !window.__motion.S.exporting);
  assert.deepEqual(await page.evaluate(() => wakeCalls), ['enable', 'release']);
});
