'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin, fixtures;
before(async () => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'motion-ai-edit-'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-filter:a', "volume=0:enable='between(t,2,4)'",
    '-c:v', 'libvpx', '-threads', '1', '-c:a', 'libopus', '-shortest', path.join(fixtures, 'video.webm')]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=blue:size=320x180:rate=30:duration=3',
    '-c:v', 'libvpx', '-threads', '1', '-an', path.join(fixtures, 'silent.webm')]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=green:size=160x90:rate=5:duration=66',
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=66', '-c:v', 'libvpx', '-threads', '1', '-c:a', 'libopus', '-shortest', path.join(fixtures, 'long.webm')]);
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.stdout.on('data', data => { const port = String(data).match(/port (\d+)/); if (port) resolve(`http://localhost:${port[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); if (fixtures) rmSync(fixtures, { recursive: true, force: true }); });

async function sheet(page, name) { if ((await page.locator('#app').getAttribute('data-sheet')) !== name && await page.locator(`[data-sheet-open="${name}"]`).isVisible()) await page.locator(`[data-sheet-open="${name}"]`).click(); }
async function closeSheet(page) { if (await page.locator('#app[data-sheet]').count()) await page.keyboard.press('Escape'); }
async function editor(t, { width = 1280, key = true, file = 'video.webm' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  t.after(() => context.close());
  await context.addInitScript(({ key }) => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Original', aspect: '9:16', width: 180, height: 320,
      fps: 30, duration: 6, background: '#102030', assets: {}, layers: [{ id: 'original', type: 'rect', name: 'Camada original',
        start: 0, end: 6, visible: true, parent: null, p: { x: 90, y: 160, scale: 100, opacity: 100 }, s: { w: 80, h: 80, fill: '#ff0000' }, kf: {} }] }));
    // Credencial fictícia só deste teste. Todas as requisições Gemini são interceptadas.
    if (key) localStorage.setItem('motion-editor:ai', JSON.stringify({ key: 'test-only', model: 'gemini-3.8-flash' }));
    sessionStorage.setItem('seeded', '1');
  }, { key });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.route('https://generativelanguage.googleapis.com/**', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Requisição sem mock' } }) });
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await sheet(page, 'add');
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, file));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'video'));
  return { page, requests };
}
const original = page => page.evaluate(() => JSON.stringify(window.__motion.P()));
const normalAnalysis = { description: 'Pessoa explica dois pontos com uma pausa.', highlights: [{ start: 0, end: 2, label: 'Abertura' }, { start: 4, end: 6, label: 'Fechamento' }],
  speech: [{ start: 0.5, end: 1.5, text: 'Primeiro destaque' }, { start: 4.2, end: 5.6, text: 'Segundo destaque' }] };
const normalPlan = { title: 'Resumo editado', summary: 'Dois destaques, sem a pausa.', segments: [
  { sourceStart: 0, sourceEnd: 2, label: 'Abertura', zoom: 1.1, focalX: 40 },
  { sourceStart: 4, sourceEnd: 6, label: 'Fechamento', zoom: 1.15, focalX: 60 }] };
async function mockAI(page, requests, { analysis = normalAnalysis, plan = normalPlan, first } = {}) {
  await page.unroute('https://generativelanguage.googleapis.com/**');
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const data = route.request().postDataJSON(); requests.push(data);
    const analyzing = data.contents[0].parts[0].text.startsWith('ANALISAR_TRECHO');
    if (analyzing && first) await first(route);
    else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(analyzing ? analysis : plan) }] } }] }) });
  });
}
async function form(page) {
  await sheet(page, 'ia');
  await page.locator('#btnAIEdit').click();
  await page.locator('#editAspect').selectOption('keep');
  await page.locator('#editTarget').fill('4');
}
async function analyze(page) {
  await page.getByRole('button', { name: 'Analisar com IA', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Revisar edição', null, { timeout: 20000 });
}

test('vídeo real vira montagem editável em 360 px, com revisão, undo e restauração após reload', async t => {
  const { page, requests } = await editor(t, { width: 360 });
  const base = await original(page); await mockAI(page, requests); await form(page); await analyze(page);
  assert.equal(await original(page), base, 'revisar não altera o original');
  assert.equal(requests.length, 2);
  const parts = requests[0].contents[0].parts;
  assert.equal(parts.filter(p => p.inline_data?.mime_type === 'audio/wav').length, 1);
  assert.equal(parts.filter(p => p.inline_data?.mime_type === 'image/jpeg').length, 3);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  const result = await page.evaluate(() => window.__motion.P());
  assert.equal(result.name, 'Resumo editado'); assert.equal(result.duration, 4);
  assert.equal(result.layers.filter(l => l.type === 'video').length, 2);
  assert.equal(result.layers.filter(l => l.type === 'text').length, 2);
  assert.ok(result.layers.filter(l => l.type === 'video').every(l => l.parent === null && l.kf.scale.length === 4));
  assert.deepEqual(result.assets, JSON.parse(base).assets);
  assert.deepEqual(result.aiEdit.original, JSON.parse(base));
  await page.locator('#btnUndo').click(); assert.equal(await original(page), base);
  assert.equal(await page.evaluate(() => window.__motion.S.playing), false);
  await page.locator('#btnRedo').click(); assert.equal(await page.evaluate(() => window.__motion.P().layers.filter(l => l.type === 'video').length), 2);
  await page.locator('#btnExport').click();
  if (await page.locator('#expFmt option[value="live"]').count()) await page.locator('#expFmt').selectOption('live');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Vídeo pronto', null, { timeout: 15000 });
  const encoded = await page.evaluate(async () => {
    const blob = await (await fetch(document.querySelector('#modal video').src)).blob();
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
  });
  const exported = path.join(fixtures, 'ai-edited.bin'); writeFileSync(exported, Buffer.from(encoded, 'base64'));
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', exported]).toString());
  assert.ok(info.streams.some(s => s.codec_type === 'audio'), 'montagem exporta som');
  assert.ok(info.streams.some(s => s.codec_type === 'video' && s.width === 180 && s.height === 320), 'montagem exporta imagem na resolução correta');
  await page.waitForTimeout(750); await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__motion?.A.size > 0);
  await page.evaluate(() => window.__motion.A.clear()); // O backup também deve ser acessível sem mídia carregada.
  await sheet(page, 'ia'); await page.locator('#btnAIEdit').click(); await page.getByRole('button', { name: 'Voltar ao original', exact: true }).click();
  assert.equal(await original(page), base, 'backup persiste fora do histórico de undo');
});

test('trim, velocidade e escolhas desmarcadas são respeitados', async t => {
  const { page, requests } = await editor(t);
  await page.evaluate(() => { const m = window.__motion, l = m.P().layers.find(l => l.type === 'video'); l.s.trimIn = 1; l.s.speed = 2;
    l.start = 0; l.end = 2; l.parent = 'original'; l.kf.x = [{ t: 0, v: 20 }, { t: 2, v: 100 }]; m.commit(); });
  await mockAI(page, requests, { analysis: { description: 'Dois pontos.', highlights: [], speech: [{ start: 0.75, end: 1.25, text: 'Fala' }] },
    plan: { title: 'Rápido', segments: [{ sourceStart: 0.5, sourceEnd: 1.5, label: 'Um', zoom: 1.2 }, { sourceStart: 2.5, sourceEnd: 3.5, label: 'Dois', zoom: 1.2 }] } });
  await form(page); await page.locator('#editPauses').uncheck(); await page.locator('#editZoom').uncheck(); await analyze(page);
  await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  const layers = await page.evaluate(() => window.__motion.P().layers);
  assert.deepEqual(layers.filter(l => l.type === 'video').map(l => [l.s.trimIn, l.s.speed, l.start, l.end, l.parent, l.kf]), [[1.5, 2, 0, 0.5, null, {}], [3.5, 2, 0.5, 1, null, {}]]);
  const caption = layers.find(l => l.type === 'text');
  assert.equal(caption.start, 0.125); assert.equal(caption.end, 0.375);
});

test('desmarcar um corte remapeia as legendas e a duração', async t => {
  const { page, requests } = await editor(t); await mockAI(page, requests); await form(page); await analyze(page);
  await page.locator('[data-edit-clip="0"]').uncheck();
  await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  const project = await page.evaluate(() => window.__motion.P());
  assert.equal(project.duration, 2); assert.equal(project.layers.filter(l => l.type === 'video')[0].s.trimIn, 4);
  assert.equal(project.layers.filter(l => l.type === 'text').length, 1);
  assert.ok(Math.abs(project.layers.find(l => l.type === 'text').start - 0.2) < 1e-6);
});

test('análise em partes mantém tempos da segunda parte e respeita legendas desmarcadas', async t => {
  const { page, requests } = await editor(t, { file: 'long.webm' });
  let chunk = 0;
  await page.unroute('https://generativelanguage.googleapis.com/**');
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const data = route.request().postDataJSON(); requests.push(data);
    const analyzing = data.contents[0].parts[0].text.startsWith('ANALISAR_TRECHO');
    const body = analyzing ? { description: 'Cena.', highlights: [], speech: ++chunk === 2 ? [{ start: 1, end: 2, text: 'Parte dois' }] : [] }
      : { title: 'Parte final', segments: [{ sourceStart: 60.5, sourceEnd: 63.5, zoom: 1 }] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }) });
  });
  await form(page); await page.locator('#editFrom').fill('2'); await page.locator('#editTo').fill('66');
  await page.locator('#editPauses').uncheck(); await page.locator('#editCaptions').uncheck();
  await analyze(page); await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  assert.equal(requests.length, 3);
  assert.match(requests[1].contents[0].parts[0].text, /4\.000 segundos/);
  assert.match(requests[2].contents[0].parts[0].text, /"start":61,"end":62/);
  const p = await page.evaluate(() => window.__motion.P());
  assert.equal(p.layers.find(l => l.type === 'video').s.trimIn, 62.5);
  assert.equal(p.duration, 3); assert.equal(p.layers.some(l => l.type === 'text'), false);
});

test('uma alteração do projeto durante a análise invalida o resultado', async t => {
  const { page, requests } = await editor(t);
  let release, seen; const gate = new Promise(r => release = r), requested = new Promise(r => seen = r);
  await mockAI(page, requests, { first: async route => { seen(); await gate; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(normalAnalysis) }] } }] }) }); } });
  await form(page); await page.getByRole('button', { name: 'Analisar com IA', exact: true }).click(); await requested;
  await page.evaluate(() => { window.__motion.P().name = 'Alterado'; window.__motion.commit(); }); release();
  await page.waitForFunction(() => document.querySelector('#editError')?.textContent.includes('projeto mudou'));
  assert.equal(await page.evaluate(() => window.__motion.P().name), 'Alterado');
  assert.equal(await page.evaluate(() => !!window.__motion.P().aiEdit), false);
  assert.equal(requests.length, 1);
});

test('cancelar análise aborta a requisição e ignora resposta tardia', async t => {
  const { page, requests } = await editor(t); const base = await original(page);
  let release, seen; const gate = new Promise(r => release = r), requested = new Promise(r => seen = r);
  await mockAI(page, requests, { first: async route => { seen(); await gate; try { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(normalAnalysis) }] } }] }) }); } catch {} } });
  await form(page); await page.getByRole('button', { name: 'Analisar com IA', exact: true }).click(); await requested;
  await page.getByRole('button', { name: 'Cancelar análise', exact: true }).click(); release(); await page.waitForTimeout(250);
  assert.equal(await page.locator('#modalTitle').textContent(), 'Editar com IA');
  assert.equal(await original(page), base); assert.equal(requests.length, 1);
});

test('sem chave e falhas da API mantêm o original e o pedido', async t => {
  const missing = await editor(t, { key: false }); const baseMissing = await original(missing.page);
  await form(missing.page); await missing.page.getByRole('button', { name: 'Analisar com IA', exact: true }).click();
  assert.equal(await missing.page.locator('#modalTitle').textContent(), 'Configurar IA');
  assert.equal(missing.requests.length, 0); assert.equal(await original(missing.page), baseMissing);
  for (const failure of ['quota', 'json', 'range']) {
    const { page, requests } = await editor(t); const base = await original(page);
    if (failure === 'range') await mockAI(page, requests, { plan: { segments: [{ sourceStart: 0, sourceEnd: 1000 }] } });
    else await mockAI(page, requests, { first: route => route.fulfill({ status: failure === 'quota' ? 429 : 200, contentType: 'application/json', body: JSON.stringify(failure === 'quota'
      ? { error: { message: 'Quota' } } : { candidates: [{ content: { parts: [{ text: 'JSON quebrado' }] } }] }) }) });
    await form(page); await page.locator('#editRequest').fill('Quero meus destaques');
    await page.getByRole('button', { name: 'Analisar com IA', exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('#editError')?.textContent, null, { timeout: 20000 });
    assert.equal(await original(page), base); assert.equal(await page.locator('#editRequest').inputValue(), 'Quero meus destaques');
  }
});

test('corte local remove silêncio do áudio real sem Gemini', async t => {
  const { page, requests } = await editor(t, { key: false }); await form(page);
  await page.locator('#editTarget').fill('6'); await page.getByRole('button', { name: 'Cortar pausas sem IA', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Revisar edição');
  await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  const p = await page.evaluate(() => window.__motion.P());
  assert.equal(requests.length, 0); assert.ok(p.duration > 4 && p.duration < 4.5);
  assert.equal(p.layers.filter(l => l.type === 'video').length, 2); assert.equal(p.layers.filter(l => l.type === 'text').length, 0);
});

test('vídeo sem áudio usa quadros e não inventa legendas', async t => {
  const { page, requests } = await editor(t, { file: 'silent.webm' });
  await mockAI(page, requests, { analysis: { description: 'Tela azul.', highlights: [], speech: [{ start: 0, end: 1, text: 'Fala inventada' }] }, plan: { title: 'Visual', segments: [{ sourceStart: 0, sourceEnd: 2 }] } });
  await form(page); await analyze(page); await page.getByRole('button', { name: 'Aplicar e ver prévia', exact: true }).click();
  assert.equal(requests[0].contents[0].parts.filter(p => p.inline_data?.mime_type === 'audio/wav').length, 0);
  assert.equal(await page.evaluate(() => window.__motion.P().layers.some(l => l.type === 'text')), false);
});
