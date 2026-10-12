'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.81.0/dist/';
let browser, server, origin, dir, libraries;
function animation(color = [1, 0, 0, 1], duration = 2, ip = 0) {
  const op = ip + duration * 20;
  return { v: '5.7.4', fr: 20, ip, op, w: 100, h: 100, nm: 'Quadrado animado', ddd: 0, assets: [], layers: [{
    ddd: 0, ind: 1, ty: 4, nm: 'Quadrado', sr: 1, ip, op, st: 0, bm: 0,
    ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] },
      p: { a: 1, k: [{ t: ip, s: [25, 50, 0], e: [75, 50, 0], o: { x: 0.33, y: 0.33 }, i: { x: 0.67, y: 0.67 } }, { t: op, s: [75, 50, 0] }] } },
    shapes: [{ ty: 'rc', d: 1, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [20, 20] }, r: { a: 0, k: 0 } },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1 }] }] };
}
before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motion-lottie-test-'));
  writeFileSync(path.join(dir, 'red.json'), JSON.stringify(animation()));
  writeFileSync(path.join(dir, 'offset.json'), JSON.stringify(animation([1, 0, 0, 1], 2, 10)));
  writeFileSync(path.join(dir, 'green.json'), JSON.stringify(animation([0, 1, 0, 1], 1)));
  // Pacotes reais v1/v2; o player e seu WASM são reais, sem mocks de render.
  execFileSync('python3', ['-c', `import base64, json, pathlib, struct, sys, zipfile, zlib
p=pathlib.Path(sys.argv[1])
for version, folder, output in [('1.0','animations','v1.lottie'),('2','a','multi.lottie')]:
  with zipfile.ZipFile(p/output, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps({'version':version,'animations':[{'id':'red','name':'Vermelho'},{'id':'green','name':'Verde'}]}))
    z.writestr(folder+'/red.json',(p/'red.json').read_bytes())
    z.writestr(folder+'/green.json',(p/'green.json').read_bytes())
with zipfile.ZipFile(p/'not-lottie.lottie','w') as z: z.writestr('other.txt','invalid')
def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=bytes.fromhex('89504e470d0a1a0a')+chunk(b'IHDR',struct.pack('>IIBBBBB',16,16,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((bytes([0])+bytes([255,0,0,255])*16)*16))+chunk(b'IEND',b'')
image=json.loads((p/'red.json').read_text())
layer=image['layers'][0]; layer.pop('shapes'); layer['ty']=2; layer['refId']='image_0'
layer['ks']['p']={'a':0,'k':[50,50,0]}; layer['ks']['a']={'a':0,'k':[8,8,0]}
image['assets']=[{'id':'image_0','w':16,'h':16,'p':'data:image/png;base64,'+base64.b64encode(png).decode(),'u':'','e':1}]
(p/'embedded.json').write_text(json.dumps(image))
for version, anim_folder, image_folder, output in [('1.0','animations','images','image-v1.lottie'),('2','a','i','image-v2.lottie')]:
  image['assets'][0].update({'p':'image_0.png','u':'/'+image_folder+'/','e':0})
  with zipfile.ZipFile(p/output,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json',json.dumps({'version':version,'animations':[{'id':'image'}]}))
    z.writestr(anim_folder+'/image.json',json.dumps(image)); z.writestr(image_folder+'/image_0.png',png)
`, dir]);
  const urls = [BASE + 'index.js', BASE + 'dotlottie-player.wasm',
    'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js',
    'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js'];
  libraries = new Map(urls.map(url => [url, execFileSync('curl', ['-fLsS', '--max-time', '30', url], { maxBuffer: 8 * 1024 * 1024 })]));
  server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
  origin = await new Promise((resolve, reject) => {
    server.on('error', reject); server.stdout.on('data', d => { const m = String(d).match(/port (\d+)/); if (m) resolve(`http://localhost:${m[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); server?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

async function editor(t, width = 1280) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
  t.after(() => context.close());
  await context.addInitScript(() => {
    if (window.top !== window || sessionStorage.getItem('seeded')) return;
    localStorage.setItem('motion-editor:v1', JSON.stringify({ v: 2, name: 'Lottie', aspect: '1:1', width: 200, height: 200,
      fps: 30, duration: 4, background: '#000000', assets: {}, layers: [] })); sessionStorage.setItem('seeded', '1');
  });
  const requests = [], page = await context.newPage(), errors = [];
  page.on('pageerror', err => errors.push(err.message)); t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  await page.route('https://cdn.jsdelivr.net/**', route => {
    const url = route.request().url().split('?')[0], data = libraries.get(url);
    if (!data) return route.abort();
    requests.push(url); return route.fulfill({ body: data, contentType: url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
  });
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.__motion);
  return { page, requests };
}
async function importFile(page, file = 'red.json') {
  const count = await page.evaluate(() => window.__motion.P().layers.length);
  await page.locator('[data-add="lottie"]').click(); await page.locator('#mediaInput').setInputFiles(path.join(dir, file));
  await page.waitForFunction(count => window.__motion.P().layers.length > count, count, { timeout: 15000 });
}
async function input(page, key, value) {
  const field = page.locator('#s-' + key), type = await field.evaluate(el => el.type);
  if (type === 'checkbox') await field.setChecked(value);
  else if (type === 'select-one') await field.selectOption(String(value));
  else { await field.fill(String(value)); await field.dispatchEvent('input'); await field.dispatchEvent('change'); }
}
const time = (page, t) => page.evaluate(t => window.__motion.setTime(t), t);
const pixel = (page, x, y = 100) => page.evaluate(({ x, y }) => [...document.querySelector('#canvas').getContext('2d').getImageData(x, y, 1, 1).data], { x, y });
const state = page => page.evaluate(() => JSON.stringify(window.__motion.P()));

test('Lottie JSON anima na timeline em 360 px, com alpha, loop, reverso e quadro congelado', async t => {
  const { page, requests } = await editor(t, 360); assert.equal(requests.length, 0, 'player só baixa ao importar');
  await importFile(page);
  const info = await page.evaluate(() => { const m = window.__motion, l = m.P().layers[0], a = m.A.get(l.s.asset);
    return { type: l.type, duration: a.duration, frames: a.frames, id: a.id, asset: l.s.asset,
      alpha: a.canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] }; });
  assert.equal(info.type, 'lottie'); assert.equal(info.duration, 2); assert.equal(info.frames, 40); assert.equal(info.id, info.asset); assert.equal(info.alpha, 0);
  assert.equal(requests.filter(u => u.startsWith(BASE)).length, 2); assert.equal(await page.locator('#s-volume').count(), 0);
  assert.equal(await page.locator('[data-mute]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal((await pixel(page, 75))[0], 255); await time(page, 1); assert.equal((await pixel(page, 100))[0], 255);
  await page.evaluate(() => { window.__motion.P().layers[0].end = 4; window.__motion.commit(); });
  await time(page, 3); assert.equal((await pixel(page, 100))[0], 255, 'repetição usa tempo de fonte');
  await input(page, 'reverse', true); await time(page, 0); assert.equal((await pixel(page, 123))[0], 255);
  await page.locator('[data-act="freeze-frame"]').click();
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'image'));
  const image = await page.evaluate(() => { const m = window.__motion, l = m.P().layers.find(l => l.type === 'image'); return { w: l.s.w, h: l.s.h, asset: !!m.A.get(l.s.asset)?.el }; });
  assert.deepEqual(image, { w: 100, h: 100, asset: true });
  await page.locator('#btnUndo').click(); assert.equal(await page.evaluate(() => window.__motion.P().layers.length), 1);
});

test('fonte com ip diferente de zero mantém frame ao acelerar, cortar e arrastar a borda', async t => {
  const { page } = await editor(t); await importFile(page, 'offset.json');
  await input(page, 'loop', false); await input(page, 'speed', 2); await input(page, 'trimIn', 0.5);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].end), 0.75);
  await time(page, 0.3); const before = await pixel(page, 100); assert.equal(before[0], 255);
  await page.locator('#btnSplit').click(); assert.deepEqual(await pixel(page, 100), before);
  const parts = await page.evaluate(() => window.__motion.P().layers.map(l => [l.start, l.end, l.s.trimIn]));
  assert.deepEqual(parts, [[0.3, 0.75, 1.1], [0, 0.3, 0.5]]);
  await time(page, 0.5); assert.equal((await pixel(page, 113))[0], 255);
  const handle = page.locator('.tl-row.sel .h.l'), box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2); await page.mouse.up();
  const moved = await page.evaluate(() => { const l = window.__motion.P().layers[0]; return [l.start, l.s.trimIn]; });
  assert.deepEqual(moved, [0.5, 1.5]); assert.equal((await pixel(page, 113))[0], 255);
});

test('duas camadas do mesmo arquivo recebem quadros e tempos independentes', async t => {
  const { page } = await editor(t); await importFile(page);
  await page.evaluate(() => { const m = window.__motion, a = m.P().layers[0]; a.p.x = 50; a.end = 4;
    const b = m.makeLayer('lottie', { name: 'Segundo tempo', start: 0, end: 4, p: { x: 150, y: 100 }, s: { ...a.s, trimIn: 1, speed: 0.5 } });
    m.addLayer(b, true); m.setTime(0); });
  assert.equal((await pixel(page, 25))[0], 255); assert.equal((await pixel(page, 150))[0], 255);
  await time(page, 1); assert.equal((await pixel(page, 50))[0], 255); assert.equal((await pixel(page, 163))[0], 255);
});

test('imagens embutidas em JSON e nos pacotes dotLottie v1/v2 aparecem com transparência', async t => {
  for (const file of ['embedded.json', 'image-v1.lottie', 'image-v2.lottie']) {
    const { page } = await editor(t); await importFile(page, file);
    assert.deepEqual(await pixel(page, 100), [255, 0, 0, 255], file);
    const alpha = await page.evaluate(() => { const m = window.__motion, rec = m.A.get(m.P().layers[0].s.asset);
      return rec.canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3]; });
    assert.equal(alpha, 0, file);
  }
});

test('dotLottie v1/v2 permite escolher animação e persiste ao recarregar e abrir projeto portátil', async t => {
  const { page } = await editor(t); await importFile(page, 'v1.lottie');
  assert.equal(await page.locator('#s-animationId option').count(), 2);
  await page.evaluate(() => { const l = window.__motion.P().layers[0]; l.end = 4; l.s.transitionEnd = 4; window.__motion.commit(); });
  await input(page, 'loop', false);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].s.transitionEnd), undefined);
  await page.evaluate(() => { window.__motion.P().layers[0].s.transitionEnd = 2; });
  await input(page, 'animationId', 'green'); assert.equal((await pixel(page, 75))[1], 255);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].s.transitionEnd), undefined);
  await page.locator('[data-act="replace-media"]').click(); await page.locator('#mediaInput').setInputFiles(path.join(dir, 'multi.lottie'));
  await page.waitForFunction(() => window.__motion.P().layers[0].s.animationId === 'red');
  await input(page, 'animationId', 'green'); await input(page, 'loop', false);
  assert.equal(await page.evaluate(() => window.__motion.P().layers[0].end), 1);
  await page.waitForTimeout(750); await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => { const m = window.__motion; return m?.A.get(m.P().layers[0]?.s.asset)?.player?.isLoaded; });
  await page.evaluate(() => { const m = window.__motion; m.select(m.P().layers[0].id); m.setTime(0); }); assert.equal((await pixel(page, 75))[1], 255);
  await page.locator('#btnMenu').click(); const downloaded = page.waitForEvent('download'); await page.locator('[data-menu="save"]').click();
  const file = path.join(dir, 'portable.motion.json'); await (await downloaded).saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8')); assert.equal(saved.layers[0].s.animationId, 'green');
  assert.ok(Object.values(saved.assets).every(a => a.data?.startsWith('data:')));
  const fresh = await editor(t); await fresh.page.locator('#btnMenu').click(); await fresh.page.locator('[data-menu="open"]').click();
  await fresh.page.locator('#projectInput').setInputFiles(file);
  await fresh.page.waitForFunction(() => { const m = window.__motion; return m?.P().layers[0]?.s.animationId === 'green' && m.A.get(m.P().layers[0].s.asset)?.player?.isLoaded; });
  await time(fresh.page, 0); assert.equal((await pixel(fresh.page, 75))[1], 255);
});

test('exportação real MP4/GIF inclui quadros animados e preserva alpha no GIF', async t => {
  const { page } = await editor(t); await importFile(page, 'multi.lottie');
  await page.evaluate(() => { window.__motion.P().duration = 2; window.__motion.commit(); });
  await page.locator('#btnExport').click(); await page.locator('#expRes').selectOption('720');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#modalTitle').textContent === 'Vídeo pronto', null, { timeout: 60000 });
  async function result(selector, name) {
    const b64 = await page.evaluate(async selector => {
      const blob = await (await fetch(document.querySelector(selector).src)).blob();
      return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(blob); });
    }, selector); const file = path.join(dir, name); writeFileSync(file, Buffer.from(b64, 'base64')); return file;
  }
  const mp4 = await result('#modal video', 'out.mp4');
  const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', mp4])).streams;
  const video = streams.find(s => s.codec_type === 'video'); assert.equal(video.width, 720); assert.equal(video.height, 720); assert.equal(video.nb_read_frames, '60');
  const frames = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', mp4, '-vf', 'select=eq(n\\,0)+eq(n\\,30)', '-fps_mode', 'vfr', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 });
  const pixels = 720 * 720, centers = [];
  for (let frame = 0; frame < 2; frame++) { let sum = 0, count = 0;
    for (let i = 0; i < pixels; i++) { const at = (frame * pixels + i) * 3; if (frames[at] > 180 && frames[at + 1] < 80 && frames[at + 2] < 80) { sum += i % 720; count++; } }
    assert.ok(count > 100); centers.push(sum / count);
  }
  assert.ok(centers[1] - centers[0] > 70, 'animação mudou de posição no arquivo exportado');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click(); await page.locator('#btnExport').click();
  await page.locator('#expFmt').selectOption('gif'); await page.locator('#expAlpha').check(); await page.locator('#expGif').selectOption('320');
  await page.locator('#modalActions').getByRole('button', { name: 'Exportar', exact: true }).click(); await page.waitForSelector('#modal img.export-preview');
  const gif = await result('#modal img.export-preview', 'out.gif');
  const rgba = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', gif, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  assert.equal(rgba[3], 0, 'fundo transparente'); assert.ok(rgba.some((v, i) => i % 4 === 3 && v === 255), 'animação visível');
});

test('arquivos inválidos e falha do CDN não alteram o projeto; uma nova tentativa funciona', async t => {
  const { page } = await editor(t); const base = await state(page);
  for (const file of [{ name: 'invalid.json', buffer: Buffer.from('{}') }, { name: 'project.motion.json', buffer: Buffer.from('{}') },
    { name: 'external.json', buffer: Buffer.from(JSON.stringify({ ...animation(), assets: [{ id: 'image', p: 'outside.png', u: 'https://example.test/' }] })) }]) {
    await page.locator('[data-add="lottie"]').click(); await page.locator('#mediaInput').setInputFiles({ ...file, mimeType: 'application/json' });
    await page.waitForFunction(() => !document.querySelector('#toast').hidden); assert.equal(await state(page), base);
  }
  await page.locator('[data-add="lottie"]').click(); await page.locator('#mediaInput').setInputFiles(path.join(dir, 'not-lottie.lottie'));
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('falta o manifesto')); assert.equal(await state(page), base);
  assert.equal(await page.evaluate(() => window.__motion.A.size), 0);
  await page.route(BASE + 'index.js', route => route.abort());
  await page.locator('[data-add="lottie"]').click(); await page.locator('#mediaInput').setInputFiles(path.join(dir, 'red.json'));
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Confira a conexão')); assert.equal(await state(page), base);
  await page.unroute(BASE + 'index.js'); await importFile(page); assert.equal((await pixel(page, 75))[0], 255);
});

test('trocar de projeto durante o carregamento descarta o player e ignora a importação antiga', async t => {
  const { page } = await editor(t);
  let release, seen;
  const gate = new Promise(resolve => release = resolve), requested = new Promise(resolve => seen = resolve);
  await page.route(BASE + 'index.js', async route => { seen(); await gate; await route.fulfill({ body: libraries.get(BASE + 'index.js'), contentType: 'text/javascript' }); });
  await page.evaluate(() => {
    const original = window.MotionLottie.load;
    window.MotionLottie.load = async blob => {
      const rec = await original(blob), destroy = rec.player.destroy.bind(rec.player);
      rec.player.destroy = () => { window.testPlayerDestroyed = true; return destroy(); };
      return rec;
    };
  });
  await page.locator('[data-add="lottie"]').click(); await page.locator('#mediaInput').setInputFiles(path.join(dir, 'red.json'));
  await requested;
  await page.locator('#btnMenu').click(); await page.locator('[data-menu="new"]').click();
  await page.getByRole('button', { name: 'Novo 1:1', exact: true }).click();
  await page.waitForFunction(() => window.__motion.A.size === 0);
  const base = await state(page); release();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('projeto mudou'));
  assert.equal(await state(page), base); assert.equal(await page.evaluate(() => window.__motion.A.size), 0);
  assert.equal(await page.evaluate(() => window.testPlayerDestroyed), true);
});
