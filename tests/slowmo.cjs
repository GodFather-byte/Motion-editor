'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

// Câmera lenta: velocidade com rampa (integral exata), divisão, rampas prontas, prévia pausada,
// quadros suaves (mistura de quadros), projetos antigos e som com playbackRate automatizado.
let browser, server, origin, fixtures;
before(async () => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'motion-slowmo-test-'));
  const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
  // quadrado branco de 40 px que anda 100 px/s na horizontal, em um vídeo 320×180 de 4 s
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'color=c=white:s=40x40:r=30:d=4',
    '-filter_complex', "[0:v][1:v]overlay=x='20+100*t':y=60:shortest=1[v]", '-map', '[v]',
    '-c:v', 'libvpx', '-b:v', '2M', path.join(fixtures, 'moving.webm')]);
  // quadros alternados preto / branco a 10 fps (VP9 em MP4: o mp4box lê os quadros por segundo)
  ff(['-f', 'lavfi', '-i', 'nullsrc=s=64x64:r=10:d=3', '-vf', "geq=lum='if(mod(N\\,2)\\,255\\,0)':cb=128:cr=128,format=yuv420p",
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '4', '-g', '1', path.join(fixtures, 'flicker.mp4')]);
  // vídeo com um tom de 440 Hz
  ff(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libvpx', '-threads', '1', '-c:a', 'libopus', '-shortest', path.join(fixtures, 'tone.webm')]);
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
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => {
  await browser?.close(); server?.kill();
  if (fixtures) rmSync(fixtures, { recursive: true, force: true });
});

async function editor(t, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'sem erros de JavaScript'));
  // a tela inicial pode ganhar um menu: #editor abre direto na edição
  await page.goto(origin + '/#editor', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__motion);
  return page;
}

/* importa um vídeo pela interface, esconde o exemplo e devolve o id da camada */
async function addVideo(page, file) {
  await page.evaluate(() => window.__motion.setTime(0));
  await page.locator('[data-add="video"]').click();
  await page.locator('#mediaInput').setInputFiles(path.join(fixtures, file));
  await page.waitForFunction(() => window.__motion.P().layers.some(l => l.type === 'video' && window.__motion.A.get(l.s.asset)), null, { timeout: 60000 });
  return page.evaluate(() => {
    const m = window.__motion, L = m.P().layers.find(l => l.type === 'video');
    m.P().layers.forEach(l => { if (l !== L) l.visible = false; });
    m.commit();
    return L.id;
  });
}

/* espera o vídeo principal (e o segundo, se houver) parar no tempo pedido e a prévia redesenhar */
async function settle(page, id) {
  await page.waitForFunction(id => {
    const m = window.__motion, v = m.VIDS.get(id), v2 = m.VIDS2.get(id);
    return v && v.readyState >= 2 && !v.seeking && (!v2 || (v2.readyState >= 2 && !v2.seeking));
  }, id, { timeout: 20000 });
  await page.waitForTimeout(400);
}
const centerGray = page => page.evaluate(() => {
  const c = document.querySelector('#canvas'), d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
  return (d[0] + d[1] + d[2]) / 3;
});
/* a prévia redesenha sozinha quando os vídeos terminam de buscar: espera até 5 s pelo valor esperado */
async function grayWhen(page, ok) {
  let g = await centerGray(page);
  for (let i = 0; i < 50 && !ok(g); i++) { await page.waitForTimeout(100); g = await centerGray(page); }
  return g;
}

test('Rampa: srcTime e timeAtSrc são inversas exatas e a divisão não quebra a continuidade', async t => {
  const page = await editor(t);
  const r = await page.evaluate(() => {
    const m = window.__motion;
    m.setTime(0);
    const L = m.makeLayer('video', { name: 'Rampa', start: 0.5, end: 4.5, s: { trimIn: 1, speed: 1.5 } });
    L.s.rampPts = [[1, 1], [2, 0.25], [3, 0.25], [3.5, 2]];
    m.addLayer(L, true);
    const times = [0, 0.5, 0.9, 1.3, 2, 2.5, 3.2, 3.75, 4.4, 6];
    const roundTrip = Math.max(...times.map(t => Math.abs(m.timeAtSrc(L, m.srcTime(L, t)) - t)));
    // integral numérica fina da velocidade, para conferir a fórmula fechada
    let acc = 0, worst = 0;
    const h = 1e-4;
    for (let t = L.start; t < 4.5 - h / 2; t += h) {
      acc += (m.speedAt(L, t) + m.speedAt(L, t + h)) / 2 * h;
      worst = Math.max(worst, Math.abs(1 + acc - m.srcTime(L, t + h)));
    }
    const before = [2.4, 2.9, 3.3, 4.2].map(t => m.srcTime(L, t));
    m.setTime(2.4);
    m.splitLayer(L);
    const L2 = m.P().layers.find(l => l.name === 'Rampa (parte 2)');
    return {
      roundTrip, worst,
      slow: m.speedAt(L, 2.5), fast: m.speedAt(L, 4),
      leftEnd: m.srcTime(L, L.end), rightStart: L2.s.trimIn,
      after: [2.4, 2.9, 3.3, 4.2].map(t => m.srcTime(L2, t)), before,
      samePts: JSON.stringify(L.s.rampPts) === JSON.stringify(L2.s.rampPts),
      line: !!document.querySelector(`.tl-row[data-id="${L2.id}"] .clip .ramp-line polyline`),
    };
  });
  assert.ok(r.roundTrip < 1e-9, `ida e volta: erro ${r.roundTrip}`);
  assert.ok(r.worst < 1e-6, `integral fechada x numérica: erro ${r.worst}`);
  assert.equal(r.slow, 1.5 * 0.25);
  assert.equal(r.fast, 1.5 * 2);
  assert.ok(Math.abs(r.leftEnd - r.rightStart) < 1e-4, `corte contínuo: ${r.leftEnd} x ${r.rightStart}`);
  r.after.forEach((s, i) => assert.ok(Math.abs(s - r.before[i]) < 1e-4, `parte 2 segue o mesmo tempo do arquivo (${s} x ${r.before[i]})`));
  assert.ok(r.samePts, 'as duas partes guardam os mesmos pontos absolutos');
  assert.ok(r.line, 'a rampa aparece no bloco da linha do tempo');
});

test('Rampa pronta "Herói" mantém o trecho do arquivo, alonga o bloco e desfaz', async t => {
  const page = await editor(t);
  const id = await page.evaluate(() => {
    const m = window.__motion;
    m.setTime(0);
    const L = m.makeLayer('video', { name: 'Herói', start: 3, end: 6, s: { trimIn: 0.5, speed: 1 } });
    m.addLayer(L, true);
    return L.id;
  });
  const info = () => page.evaluate(id => {
    const m = window.__motion, L = m.byId(id);
    return { start: L.start, end: L.end, src: m.srcTime(L, L.end), pts: L.s.rampPts.length, ramp: L.s.ramp, dur: m.P().duration,
      svg: !!document.querySelector('#rampBox svg polyline'), boxHidden: document.querySelector('#rampBox')?.hidden };
  }, id);
  const before = await info();
  assert.equal(before.boxHidden, true, 'sem rampa, a curva fica escondida');
  await page.selectOption('#s-ramp', 'hero');
  const hero = await info();
  assert.equal(hero.ramp, 'hero');
  assert.equal(hero.pts, 6);
  assert.ok(Math.abs(hero.src - before.src) < 1e-3, `mesmo fim no arquivo: ${hero.src} x ${before.src}`);
  // média do multiplicador do Herói = 0,76: o bloco fica 1/0,76 vezes mais longo
  assert.ok(Math.abs((hero.end - hero.start) - 3 / 0.76) < 1e-3, `duração ${hero.end - hero.start}`);
  assert.ok(hero.dur >= hero.end - 1e-9 && hero.dur > 6, `projeto cresceu para caber: ${hero.dur}`);
  assert.ok(hero.svg && !hero.boxHidden, 'curva de velocidade no painel');
  // velocidade constante diferente mantém o trecho mesmo com rampa
  await page.selectOption('#s-speed', '2');
  const fast = await info();
  assert.ok(Math.abs(fast.src - before.src) < 1e-3, `trecho mantido ao trocar a velocidade: ${fast.src}`);
  assert.ok(Math.abs((fast.end - fast.start) - 3 / 0.76 / 2) < 1e-3, `duração com 2x: ${fast.end - fast.start}`);
  await page.selectOption('#s-speed', '1');
  // desfazer volta para a velocidade anterior com a rampa
  await page.locator('#btnUndo').click();
  const undone = await info();
  assert.ok(Math.abs((undone.end - undone.start) - 3 / 0.76 / 2) < 1e-3, 'desfazer volta para 2x');
  await page.locator('#btnUndo').click();
  await page.locator('#btnUndo').click();
  const plain = await info();
  assert.equal(plain.pts, 0, 'desfazer remove a rampa');
  assert.equal(plain.end, 6);
  await page.locator('#btnRedo').click();
  assert.equal((await info()).ramp, 'hero', 'refazer traz a rampa');
  // "Nenhuma" tira a rampa e mantém o mesmo trecho
  await page.selectOption('#s-ramp', '');
  const none = await info();
  assert.equal(none.pts, 0);
  assert.ok(Math.abs(none.src - before.src) < 1e-3 && Math.abs(none.end - 6) < 1e-3, `sem rampa de novo: fim ${none.end}`);
});

test('Prévia pausada mostra o quadro do arquivo dado pela rampa', async t => {
  const page = await editor(t);
  const id = await addVideo(page, 'moving.webm');
  await page.evaluate(id => { const m = window.__motion, L = m.byId(id); m.applyRamp(L, 'hero'); m.commit(); }, id);
  // dentro do trecho lento do Herói (u de 0,42 a 0,62) e num trecho normal
  for (const time of [2.8, 0.9]) {
    await page.evaluate(time => window.__motion.setTime(time), time);
    await settle(page, id);
    const r = await page.evaluate(({ id, time }) => {
      const m = window.__motion, P = m.P(), L = m.byId(id);
      const c = document.querySelector('#canvas'), ctx = c.getContext('2d');
      const k = c.width / P.width, sx = L.s.w / 320 * k, sy = L.s.h / 180 * k;
      const left = (P.width / 2 - L.s.w / 2) * k, top = (P.height / 2 - L.s.h / 2) * k;
      const y = Math.round(top + 80 * sy), d = ctx.getImageData(0, y, c.width, 1).data;
      let sum = 0, n = 0;
      for (let x = 0; x < c.width; x++) if (d[x * 4] > 128) { sum += x; n++; }
      const s = m.srcTime(L, time);
      return { s, linear: L.s.trimIn + (time - L.start), center: n ? ((sum / n) - left) / sx : null, speed: m.speedAt(L, time) };
    }, { id, time });
    assert.ok(r.center != null, 'quadrado visível');
    // o quadro mostrado é o que começa antes de s (30 fps): centro do quadrado em 40 + 100·t
    const expected = 40 + 100 * Math.floor(r.s * 30 + 1e-6) / 30;
    assert.ok(Math.abs(r.center - expected) < 4, `t=${time}: quadrado em ${r.center.toFixed(1)} px, esperado ${expected.toFixed(1)} (arquivo ${r.s.toFixed(3)} s, velocidade ${r.speed})`);
    if (time === 2.8) assert.ok(Math.abs(r.s - r.linear) > 0.5, 'a rampa muda o quadro em relação à velocidade constante');
  }
});

test('Quadros suaves: com 0,25x a prévia pausada e a exportação misturam o quadro seguinte', async t => {
  const page = await editor(t);
  const id = await addVideo(page, 'flicker.mp4');
  const fps = await page.evaluate(id => {
    const m = window.__motion, rec = m.A.get(m.byId(id).s.asset);
    // sem internet o mp4box não carrega: usa os 10 fps conhecidos do arquivo de teste
    if (!rec.info) rec.info = { codec: 'vp09', fps: 10, rotation: 0 };
    m.select(id);
    return rec.info.fps;
  }, id);
  assert.ok(Math.abs(fps - 10) < 0.5, `fps ${fps}`);
  await page.selectOption('#s-speed', '0.25');
  await page.locator('#s-smoothSlow').check();
  // t = 0,2 s → arquivo 0,05 s → quadro 0,5: metade preto (quadro 0), metade branco (quadro 1)
  await page.evaluate(() => window.__motion.setTime(0.2));
  await settle(page, id);
  const blended = await grayWhen(page, g => g > 70 && g < 190);
  assert.ok(blended > 70 && blended < 190, `cinza no meio da mistura: ${blended}`);
  const info = await page.evaluate(id => window.__motion.blendInfo(window.__motion.byId(id), 0.2), id);
  assert.ok(Math.abs(info.frac - 0.5) < 1e-6, `fração ${info.frac}`);
  // exportação: seekVideosExact espera os dois vídeos e o quadro sai misturado
  const exported = await page.evaluate(async () => {
    const m = window.__motion, P = m.P();
    await m.seekVideosExact(0.2);
    const c = document.createElement('canvas'); c.width = P.width / 4; c.height = P.height / 4;
    m.renderFrame(c.getContext('2d'), 0.2, { k: 0.25 });
    const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return (d[0] + d[1] + d[2]) / 3;
  });
  assert.ok(exported > 70 && exported < 190, `exportação misturada: ${exported}`);
  // sem quadros suaves: o quadro fica inteiro preto ou branco
  await page.locator('#s-smoothSlow').uncheck();
  await page.evaluate(() => window.__motion.setTime(0.2333));
  await settle(page, id);
  const sharp = await grayWhen(page, g => g < 40 || g > 215);
  assert.ok(sharp < 40 || sharp > 215, `sem mistura: ${sharp}`);
  assert.equal(await page.evaluate(() => window.__motion.VIDS2.size), 0, 'segundo vídeo liberado');
});

test('Projeto antigo sem rampa abre igual e srcTime é a fórmula linear de antes', async t => {
  const page = await editor(t);
  const r = await page.evaluate(() => {
    const m = window.__motion;
    m.setProject({ v: 2, name: 'Antigo', aspect: '9:16', width: 1080, height: 1920, fps: 30, duration: 6, background: '#000000', assets: {},
      layers: [{ id: 'old1', type: 'video', name: 'Vídeo antigo', start: 0.4, end: 5, visible: true, parent: null, p: { x: 540, y: 960 }, kf: {},
        s: { asset: 'sumiu', trimIn: 0.7, speed: 1.5, volume: 100, fadeIn: 0, fadeOut: 0 } },
      { id: 'old2', type: 'audio', name: 'Som antigo', start: 1, end: 6, visible: true, parent: null, p: {}, kf: {}, s: { asset: 'sumiu2', speed: 0.5 } }] });
    const L = m.byId('old1'), A2 = m.byId('old2');
    const times = [0.4, 1, 2.345, 3.3333, 4.99];
    return {
      fields: [L.s.rampPts, L.s.ramp, L.s.smoothSlow, A2.s.rampPts, A2.s.ramp, A2.s.smoothSlow],
      exact: times.every(t => m.srcTime(L, t) === (t - 0.4) * 1.5 + 0.7 && m.srcTime(A2, t) === (t - 1) * 0.5 + 0),
      speed: times.every(t => m.speedAt(L, t) === 1.5),
      inverse: Math.max(...times.map(t => Math.abs(m.timeAtSrc(L, m.srcTime(L, t)) - t))),
      timeline: !document.querySelector('.ramp-line'),
    };
  });
  assert.deepEqual(r.fields, [[], '', false, [], '', false]);
  assert.ok(r.exact, 'mesma conta de antes, bit a bit');
  assert.ok(r.speed, 'velocidade constante');
  assert.ok(r.inverse < 1e-12, `inversa ${r.inverse}`);
  assert.ok(r.timeline, 'sem linha de rampa na linha do tempo');
});

test('Som com rampa: a mixagem offline segue a curva de velocidade', async t => {
  const page = await editor(t);
  const id = await addVideo(page, 'tone.webm');
  await page.waitForFunction(id => !!window.__motion.A.get(window.__motion.byId(id).s.asset).buffer, id, { timeout: 30000 });
  const r = await page.evaluate(async id => {
    const m = window.__motion, L = m.byId(id);
    L.start = 0; L.s.trimIn = 0;
    const span = L.end - L.start;   // 1x: o bloco mostra o arquivo inteiro
    m.applyRamp(L, 'hero'); m.commit();
    const buf = await m.renderAudioMix(m.P().duration);
    const ch = buf.getChannelData(0), rate = buf.sampleRate;
    const freq = (a, b) => {
      let n = 0;
      for (let i = Math.round(a * rate) + 1; i < Math.round(b * rate); i++) if ((ch[i - 1] < 0) !== (ch[i] < 0)) n++;
      return n / 2 / (b - a);
    };
    const rms = (a, b) => { let s = 0, n = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) { s += ch[i] * ch[i]; n++; } return Math.sqrt(s / n); };
    return { span, end: L.end, dur: buf.duration, fast: freq(0.2, 1.0), slow: freq(1.8, 2.3), tail: freq(3.1, 3.8), loud: rms(1.8, 2.3), after: rms(L.end + 0.02, buf.duration) };
  }, id);
  assert.ok(Math.abs(r.end - r.span / 0.76) < 1e-3, `bloco de ${r.end}`);
  assert.ok(r.fast > 400 && r.fast < 480, `1x: ${r.fast} Hz`);
  assert.ok(r.slow > 95 && r.slow < 125, `0,25x: ${r.slow} Hz`);
  assert.ok(r.tail > 400 && r.tail < 480, `fim em 1x: ${r.tail} Hz`);
  assert.ok(r.loud > 0.05, `som no trecho lento: ${r.loud}`);
  assert.ok(!(r.after > 0.01), `silêncio depois do bloco: ${r.after}`);
});

test('Celular (360 px): o painel com câmera lenta não cria rolagem lateral', async t => {
  const page = await editor(t, { width: 360, height: 740 });
  await page.evaluate(() => {
    const m = window.__motion;
    m.setTime(0);
    const L = m.makeLayer('video', { name: 'Celular', start: 0, end: 3, s: { trimIn: 0, speed: 1 } });
    m.addLayer(L, true);
    m.applyRamp(L, 'montage'); m.commit(); m.select(L.id);
  });
  await page.locator('[data-sheet-open="props"]').click();
  await page.locator('#s-ramp').scrollIntoViewIfNeeded();
  const d = await page.evaluate(() => {
    const panel = document.querySelector('#panel'), box = document.querySelector('#rampBox').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, psw: panel.scrollWidth, pcw: panel.clientWidth, right: box.right };
  });
  assert.equal(d.sw, d.cw, 'sem rolagem horizontal na página');
  assert.ok(d.psw <= d.pcw + 1, `painel sem rolagem lateral: ${d.psw} x ${d.pcw}`);
  assert.ok(d.right <= 360, `curva dentro da tela: ${d.right}`);
});
