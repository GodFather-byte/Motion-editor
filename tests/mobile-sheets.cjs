'use strict';
/* Celular como app (até 860 px): tela fixa, abas, folhas, seleção pelo toque e fechamento. Não precisa de internet nem de FFmpeg.
   Rode com: node --test tests/mobile-sheets.cjs */
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

async function editor(t, width = 360, height = 740) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Teste', aspect: '9:16', width: 360, height: 640, fps: 30, duration: 2,
      background: '#102030', assets: {}, layers: [{ id: 'a', type: 'rect', name: 'Caixa', start: 0, end: 2, visible: true, parent: null,
        p: { x: 180, y: 320, scale: 100, rotation: 0, opacity: 100 }, kf: {}, s: { w: 120, h: 120, fill: '#ff0000' } }] }));
    sessionStorage.setItem('seeded', '1');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__motion);
  return page;
}
const sheetOf = page => page.evaluate(() => document.getElementById('app').dataset.sheet || null);
const selected = page => page.evaluate(() => window.__motion.S.sel);

test('celular: tela fixa, sem rolagem e com alvos de toque grandes (360 e 390 px)', async t => {
  for (const [width, height] of [[360, 740], [390, 844]]) {
    const page = await editor(t, width, height);
    const d = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
    assert.equal(d.sw, d.cw, `${width}: sem rolagem horizontal`);
    assert.equal(d.sh, d.ch, `${width}: sem rolagem vertical da página`);
    const tabs = await page.locator('.tabbar').boundingBox(), tl = await page.locator('#timeline').boundingBox();
    assert.ok(Math.abs(tl.y + tl.height - tabs.y) < 1, 'linha do tempo termina onde começam as abas');
    for (const b of await page.locator('.tabbar button').all()) assert.ok((await b.boundingBox()).height >= 52, 'aba com 52 px');
    for (const sel of ['#btnUndo', '#btnRedo', '#btnExport']) {
      const b = await page.locator(sel).boundingBox();
      assert.ok(b.width >= 40 && b.height >= 40, `${sel} com 40 px`);
    }
  }
});

test('abas abrem folhas sobre a tela sem mudar a prévia, a linha do tempo nem o painel', async t => {
  const page = await editor(t);
  const box = sel => page.locator(sel).boundingBox();
  const stage0 = await box('#stage'), tl0 = await box('#timeline');
  const canvas0 = await page.evaluate(() => [document.getElementById('canvas').width, document.getElementById('canvas').height]);
  await page.evaluate(() => { window.__panel = document.getElementById('panel'); });
  for (const name of ['add', 'ia', 'props', 'project']) {
    await page.locator(`[data-sheet-open="${name}"]`).click();
    assert.equal(await sheetOf(page), name);
    assert.equal(await page.locator(`[data-sheet-open="${name}"]`).getAttribute('aria-pressed'), 'true');
    const stage = await box('#stage');
    assert.deepEqual([stage.x, stage.y, stage.width, stage.height], [stage0.x, stage0.y, stage0.width, stage0.height], `prévia parada com a folha ${name}`);
    assert.deepEqual(await page.evaluate(() => [document.getElementById('canvas').width, document.getElementById('canvas').height]), canvas0);
    assert.deepEqual(await box('#timeline'), tl0, `linha do tempo parada com a folha ${name}`);
    await page.locator(`[data-sheet-open="${name}"]`).click();
    assert.equal(await sheetOf(page), null, `tocar a aba ${name} fecha a folha`);
  }
  await page.locator('[data-sheet-open="props"]').click();
  assert.ok(await page.evaluate(() => window.__panel === document.getElementById('panel')), '#panel é o mesmo nó');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'panel', 'foco vai para a folha');
  await page.locator('#panel .sheet-close').click();
  assert.equal(await page.evaluate(() => document.activeElement.dataset.sheetOpen), 'props', 'foco volta para a aba');
});

test('folhas fecham pelo X, pelo fundo, por Esc e trocando de aba', async t => {
  const page = await editor(t);
  await page.locator('[data-sheet-open="add"]').click();
  await page.locator('.add-bar .sheet-close').click();
  assert.equal(await sheetOf(page), null, 'X');
  await page.locator('[data-sheet-open="project"]').click();
  await page.mouse.click(20, 150);
  assert.equal(await sheetOf(page), null, 'toque no fundo');
  await page.locator('[data-sheet-open="ia"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await sheetOf(page), null, 'Esc');
  await page.locator('[data-sheet-open="add"]').click();
  await page.locator('[data-sheet-open="props"]').click();
  assert.equal(await sheetOf(page), 'props', 'trocar de aba não precisa fechar antes');
  await page.locator('[data-sheet-open="props"]').click();
  assert.equal(await sheetOf(page), null, 'tocar a aba aberta fecha');
});

test('adicionar não abre Propriedades; toque na prévia e no nome abrem; arrastar, olho e clipe não', async t => {
  const page = await editor(t);
  await page.locator('[data-sheet-open="add"]').click();
  await page.locator('.add-bar [data-add="rect"]').click();
  assert.equal(await sheetOf(page), null, 'chip fecha a folha');
  assert.equal(await page.evaluate(() => window.__motion.P().layers.length), 2, 'chip cria a camada');
  const ov = await page.locator('#overlay').boundingBox();
  const cx = ov.x + ov.width / 2, cy = ov.y + ov.height / 2;
  await page.mouse.click(cx, cy);
  assert.equal(await sheetOf(page), 'props', 'toque sem arraste no preview abre Propriedades');
  await page.locator('#panel .sheet-close').click();
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 30, cy, { steps: 4 }); await page.mouse.up();
  assert.equal(await sheetOf(page), null, 'arrastar mais de 8 px não abre');
  await page.locator('.tl-row .tl-label .name').first().click();
  assert.equal(await sheetOf(page), 'props', 'toque no nome da camada abre');
  await page.locator('#panel .sheet-close').click();
  await page.locator('.tl-row [data-eye]').first().click();
  assert.equal(await sheetOf(page), null, 'olho não abre');
  await page.locator('.tl-row [data-eye]').first().click();
  await page.locator('.clip').first().click();
  assert.equal(await sheetOf(page), null, 'clipe não abre');
  await page.locator('[data-sheet-open="add"]').click();
  await page.locator('.add-bar [data-add="path"]').click();
  await page.mouse.click(cx, cy);
  assert.equal(await sheetOf(page), null, 'modo caneta não abre');
});

test('Projeto e encaminhamentos: Ajuda abre o modal, Play mantém a folha, Esc não desseleciona', async t => {
  const page = await editor(t);
  await page.locator('[data-sheet-open="project"]').click();
  const groups = await page.evaluate(() => [...document.querySelectorAll('#menu .menu-group-title')].map(h => h.textContent));
  assert.deepEqual(groups, ['Arquivo', 'Exportar', 'Ferramentas', 'Ajuda']);
  await page.locator('#menu [data-menu="help"]').click();
  assert.equal(await sheetOf(page), null, 'Ajuda fecha a folha');
  assert.equal(await page.locator('#modal').isVisible(), true, 'Ajuda abre o modal');
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  await page.locator('[data-sheet-open="props"]').click();
  await page.locator('#panel .fwd-play').click();
  assert.equal(await sheetOf(page), 'props', 'Play mantém a folha');
  assert.equal(await page.evaluate(() => window.__motion.S.playing), true);
  await page.locator('#panel .fwd-play').click();
  assert.equal(await page.evaluate(() => window.__motion.S.playing), false);
  await page.evaluate(() => window.__motion.select(window.__motion.P().layers[0].id));
  await page.keyboard.press('Escape');
  assert.equal(await sheetOf(page), null, 'Esc fecha a folha');
  assert.notEqual(await selected(page), null, 'Esc com folha não desseleciona');
  await page.keyboard.press('Escape');
  assert.equal(await selected(page), null, 'Esc sem folha desseleciona');
});

test('sair da largura de celular fecha a folha e esconde as peças do celular', async t => {
  const page = await editor(t);
  await page.locator('[data-sheet-open="project"]').click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(100);
  assert.equal(await sheetOf(page), null);
  assert.equal(await page.locator('.tabbar').isVisible(), false);
  assert.equal(await page.locator('#menu').isVisible(), false);
});
