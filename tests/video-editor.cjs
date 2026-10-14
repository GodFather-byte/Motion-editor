'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin, fixtures;
before(async () => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'motion-video-test-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=red:s=100x100:r=30',
    '-f', 'lavfi', '-i', 'color=green:s=100x100:r=30',
    '-f', 'lavfi', '-i', 'color=blue:s=100x100:r=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-filter_complex', '[0:v][1:v][2:v]hstack=inputs=3[v]', '-map', '[v]', '-map', '3:a',
    '-t', '6', '-c:v', 'libvpx', '-threads', '1', '-c:a', 'libopus', path.join(fixtures, 'bands.webm')]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'sine=frequency=440:duration=10', path.join(fixtures, 'tone.wav')]);
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', data => {
      const port = String(data).match(/port (\d+)/);
      if (port) resolve(`http://localhost:${port[1]}`);
    });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close(); server?.kill();
  if (fixtures) rmSync(fixtures, { recursive: true, force: true });
});

async function sheet(page, name) { if ((await page.locator('#app').getAttribute('data-sheet')) !== name && await page.locator(`[data-sheet-open="${name}"]`).isVisible()) await page.locator(`[data-sheet-open="${name}"]`).click(); }
async function closeSheet(page) { if (await page.locator('#app[data-sheet]').count()) await page.keyboard.press('Escape'); }
async function editor(t, width = 1280, offlineAudio = false) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  t.after(() => context.close());
  await context.addInitScript(({ offlineAudio }) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Teste', aspect: '9:16',
        width: 180, height: 320, fps: 30, duration: 4, background: '#000000', layers: [], assets: {} }));
      sessionStorage.setItem('seeded', '1');
    }
    if (offlineAudio) {
      window.AudioContext = function () {
        const ac = new OfflineAudioContext(1, 48000 * 6, 48000);
        ac.resume = async () => {};
        window.testAC = ac;
        return ac;
      };
    }
  }, { offlineAudio });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin + '/#editor', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}
async function input(page, key, value) {
  await sheet(page, 'props');
  const field = page.locator(`#s-${key}`);
  if (await field.evaluate(el => el.tagName === 'SELECT')) await field.selectOption(String(value));
  else { await field.fill(String(value)); await field.dispatchEvent('input'); await field.dispatchEvent('change'); }
}
async function time(page, t) { await page.evaluate(t => window.__motion.setTime(t), t); }
async function pixel(page, x = 90, y = 160) {
  return page.evaluate(({ x, y }) => [...document.querySelector('#canvas').getContext('2d').getImageData(x, y, 1, 1).data], { x, y });
}
async function importVideo(page) {
  await sheet(page, 'add');
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'bands.webm'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'video'));
  await page.waitForFunction(() => {
    const c = document.querySelector('#canvas');
    return c.getContext('2d').getImageData(90, 160, 1, 1).data[1] > 50;
  });
}
async function importImage(page) {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 100;
    const ctx = c.getContext('2d');
    ['#ff0000', '#00ff00', '#0000ff'].forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i * 100, 0, 100, 100); });
    return c.toDataURL('image/png').split(',')[1];
  });
  await sheet(page, 'add');
  await page.locator('[data-add="image"]').click();
  await page.locator('#mediaInput').setInputFiles({ name: 'faixas.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await page.waitForFunction(() => window.__motion.P().layers.length === 1);
  await sheet(page, 'props'); await page.locator('[data-act="media-frame"]').click();
  await input(page, 'focalX', 0);
}

test('enquadramento, looks, desfazer e persistência em desktop e 360 px', async t => {
  for (const width of [1280, 360]) {
    const page = await editor(t, width);
    await importImage(page);
    for (const [focus, channel] of [[0, 0], [50, 1], [100, 2]]) {
      await input(page, 'focalX', focus);
      const rgb = await pixel(page);
      assert.equal(rgb[channel], 255);
      assert.equal(rgb[(channel + 1) % 3], 0);
    }
    await input(page, 'mediaFit', 'contain');
    assert.deepEqual((await pixel(page, 90, 10)).slice(0, 3), [0, 0, 0]);
    assert.deepEqual((await pixel(page)).slice(0, 3), [0, 255, 0]);
    await input(page, 'mediaFit', 'cover'); await input(page, 'focalX', 0);
    const before = await page.evaluate(() => JSON.stringify(window.__motion.P().layers[0].kf));
    await input(page, 'colorLook', 'mono');
    const mono = await pixel(page);
    assert.ok(Math.max(...mono.slice(0, 3)) - Math.min(...mono.slice(0, 3)) <= 1);
    await input(page, 'lookIntensity', 0);
    assert.deepEqual((await pixel(page)).slice(0, 3), [255, 0, 0]);
    await page.locator('#btnUndo').click(); assert.equal(await page.locator('#s-lookIntensity').inputValue(), '100');
    await page.locator('#btnRedo').click(); assert.equal(await page.locator('#s-lookIntensity').inputValue(), '0');
    assert.equal(await page.evaluate(() => JSON.stringify(window.__motion.P().layers[0].kf)), before);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.waitForTimeout(700); await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__motion.A.size === 1);
    assert.equal(await page.evaluate(() => window.__motion.P().layers[0].s.colorLook), 'mono');
    assert.equal(await page.evaluate(() => window.__motion.P().layers[0].s.lookIntensity), 0);
  }
});

test('transições preservam keyframes e não se repetem no corte', async t => {
  const page = await editor(t); await importImage(page);
  await input(page, 'transitionIn', 'fade'); await input(page, 'transitionInDuration', 1);
  await input(page, 'transitionOut', 'fade'); await input(page, 'transitionOutDuration', 1);
  await time(page, 0); assert.equal((await pixel(page))[0], 0);
  await time(page, 0.5); const halfway = await pixel(page); assert.ok(halfway[0] >= 126 && halfway[0] <= 129);
  await closeSheet(page); await page.locator('#btnSplit').click();
  assert.deepEqual(await pixel(page), halfway, 'sem dupla composição no quadro do corte');
  await time(page, 1); assert.equal((await pixel(page))[0], 255);
  await time(page, 3.5); assert.ok((await pixel(page))[0] >= 126 && (await pixel(page))[0] <= 129);
  await page.locator('#btnUndo').click(); assert.equal(await page.evaluate(() => window.__motion.P().layers.length), 1);
  await page.evaluate(() => window.__motion.select(window.__motion.P().layers[0].id));
  await input(page, 'transitionIn', 'wipe'); await input(page, 'transitionOut', 'none');
  await time(page, 0.5);
  assert.equal((await pixel(page, 40))[0], 255); assert.equal((await pixel(page, 140))[0], 0);
  await input(page, 'transitionIn', 'zoom'); await time(page, 0.5);
  assert.equal((await pixel(page, 2))[0], 0); assert.ok((await pixel(page))[0] >= 126);
  await input(page, 'transitionInDuration', 10); await input(page, 'transitionOut', 'fade');
  await input(page, 'transitionOutDuration', 10); await time(page, 2);
  assert.equal((await pixel(page))[0], 255, 'fades longos cabem no clipe');
  assert.deepEqual(await page.evaluate(() => window.__motion.P().layers[0].kf), {});
});

test('zoom mantém posição ao seguir camada e saída acompanha o fim do projeto', async t => {
  const page = await editor(t); await importImage(page);
  await input(page, 'transitionIn', 'zoom'); await input(page, 'transitionInDuration', 1);
  await time(page, 0.5);
  const before = await pixel(page, 10);
  await page.evaluate(() => {
    const m = window.__motion, layer = m.P().layers[0];
    const group = m.makeLayer('group', { p: { scale: 200, x: 90, y: 160 } });
    m.P().layers.push(group); m.setParent(layer, group.id); m.setTime(0.5); m.commit(); m.select(layer.id);
  });
  assert.deepEqual(await pixel(page, 10), before, 'zoom não é aplicado duas vezes ao mudar o pai');
  await input(page, 'transitionIn', 'none'); await input(page, 'transitionOut', 'fade');
  await input(page, 'transitionOutDuration', 1); await time(page, 2);
  await closeSheet(page); await page.locator('#btnSplit').click();
  await page.evaluate(() => window.__motion.select(null));
  await page.locator('#pj-duration').fill('3'); await page.locator('#pj-duration').dispatchEvent('change');
  await time(page, 2.5);
  assert.ok((await pixel(page))[0] >= 126 && (await pixel(page))[0] <= 129, 'saída termina no novo limite');
});

test('vídeo real congela e exporta com enquadramento e look', async t => {
  const page = await editor(t, 360); await importVideo(page);
  await sheet(page, 'props'); await page.locator('[data-act="media-frame"]').click(); await input(page, 'focalX', 0);
  await input(page, 'colorLook', 'mono'); await time(page, 1);
  await page.waitForFunction(() => {
    const p = document.querySelector('#canvas').getContext('2d').getImageData(90, 160, 1, 1).data;
    return p[0] > 30 && p[0] < 80 && p[0] === p[1] && p[1] === p[2];
  });
  const preview = await pixel(page);
  assert.ok(Math.max(...preview.slice(0, 3)) - Math.min(...preview.slice(0, 3)) <= 1);
  await sheet(page, 'props'); await page.locator('[data-act="freeze-frame"]').click();
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'image'));
  assert.deepEqual(await pixel(page), preview);
  // Projeto curto e pequeno mantém o teste de MediaRecorder rápido.
  await page.evaluate(() => { const m = window.__motion; m.P().duration = 1.5; m.P().layers.forEach(l => { l.start = 0; l.end = 1.5; }); m.setTime(0); m.commit(); });
  await page.locator('#btnExport').click(); await page.locator('#modalActions').getByRole('button', { name: 'Exportar' }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Vídeo pronto', null, { timeout: 15000 });
  const result = await page.evaluate(async () => {
    const v = document.querySelector('#modal video');
    await new Promise((resolve, reject) => { if (v.readyState >= 2) resolve(); else { v.onloadeddata = resolve; v.onerror = reject; } });
    v.currentTime = 0.7; await new Promise(resolve => v.onseeked = resolve);
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return { size: (await (await fetch(v.src)).blob()).size, width: v.videoWidth, height: v.videoHeight,
      pixel: [...c.getContext('2d').getImageData(90, 160, 1, 1).data] };
  });
  assert.ok(result.size > 1024); assert.equal(result.width, 180); assert.equal(result.height, 320);
  assert.ok(Math.max(...result.pixel.slice(0, 3)) - Math.min(...result.pixel.slice(0, 3)) < 5);
  assert.ok(Math.abs(result.pixel[0] - preview[0]) < 8);
});

for (const speed of [0.5, 2]) test(`áudio real respeita corte a ${speed}x e fades longos`, async t => {
  const page = await editor(t, 1280, true);
  await page.locator('[data-add="audio"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, 'tone.wav'));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'audio'));
  await input(page, 'speed', speed); await input(page, 'trimIn', 6);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].s.trimIn), 6, 'trim em segundos da fonte');
  await input(page, 'trimIn', 1); await input(page, 'fadeIn', 3); await input(page, 'fadeOut', 3);
  await page.evaluate(() => { window.__motion.P().layers[0].end = 4; window.__motion.commit(); });
  await page.locator('#btnPlay').click();
  const rms = await page.evaluate(async () => {
    const b = await window.testAC.startRendering(), d = b.getChannelData(0);
    return [0.3, 2, 3.7, 4.3].map(t => {
      const samples = d.slice(Math.floor(t * b.sampleRate), Math.floor((t + 0.1) * b.sampleRate));
      return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    });
  });
  await page.locator('#btnPlay').click();
  assert.ok(rms[0] > 0 && rms[2] > 0, 'áudio toca até perto do corte');
  assert.ok(rms[1] > rms[0] * 2 && rms[1] > rms[2] * 2, 'envelope de entrada e saída');
  assert.equal(rms[3], 0, 'áudio para após o corte');
});
