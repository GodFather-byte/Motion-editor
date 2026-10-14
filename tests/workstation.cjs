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
    server.stdout.on('data', data => { const match = String(data).match(/port (\d+)/); if (match) resolve(`http://localhost:${match[1]}`); });
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await browser?.close(); server?.kill(); });
async function editor(t, init) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  t.after(() => context.close());
  if (init) await context.addInitScript(init);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route(/fonts\.google|cdn\.jsdelivr/, route => route.abort());
  await page.goto(origin + '/#editor');
  await page.waitForFunction(() => window.CreatorWorkstation && window.__motion?.P()?.id);
  await page.evaluate(() => {
    const m = window.__motion;
    m.P().layers = []; m.P().assets = {}; m.P().width = 320; m.P().height = 180;
    m.P().duration = 2; m.setProject(m.P()); m.commit();
  });
  return page;
}
const open = (page, module) => page.locator(`.ws-dock [data-workspace="${module}"]`).click();
async function assertNoInjectedMarkup(page) {
  assert.deepEqual(await page.evaluate(() => ({
    executed: window.workstationXSS || 0,
    markup: document.querySelectorAll('.ws-module img, .ws-module svg, .ws-module script').length,
    handlers: [...document.querySelectorAll('.ws-module *')].flatMap(el =>
      [...el.attributes].filter(attr => /^on/i.test(attr.name)).map(attr => attr.name))
  })), { executed: 0, markup: 0, handlers: [] });
}
test('segurança: faixas importadas e estado mutado escapam atributos, inclusive início e volume', async t => {
  const page = await editor(t);
  const payloads = [
    '"><img src=x onerror="window.workstationXSS=1"><input onfocus="window.workstationXSS=2',
    "' autofocus onfocus='window.workstationXSS=3'><svg onload='window.workstationXSS=4'>"
  ];
  for (const payload of payloads) {
    await page.evaluate(async payload => {
      const workstation = { active: 'audio', audio: { tracks: [
        { id: payload, name: payload, start: payload, gain: payload, muted: false }
      ], preset: true, monitor: false } };
      await __motion.startProject({ ...JSON.parse(JSON.stringify(__motion.P())), workstation });
    }, payload);
    for (const mode of ['imported', 'mutated']) {
      if (mode === 'mutated') await page.evaluate(payload => {
        Object.assign(__motion.P().workstation.audio.tracks[0], { id: payload, name: payload, start: payload, gain: payload });
        WorkstationShell.activate('audio');
      }, payload + '&mutated');
      const expected = payload + (mode === 'mutated' ? '&mutated' : '');
      for (const field of ['name', 'start', 'gain']) {
        assert.equal(await page.locator(`[data-track-field="${field}"]`).getAttribute('value'), expected);
      }
      assert.equal(await page.locator('[data-track]').getAttribute('data-track'), expected);
      await assertNoInjectedMarkup(page);
    }
  }
  await page.evaluate(() => {
    Object.assign(__motion.P().workstation.audio.tracks[0], { id: 'normal', name: 'Voz & música', start: 1.5, gain: .75 });
    WorkstationShell.activate('audio');
  });
  assert.equal(await page.locator('[data-track-field="name"]').inputValue(), 'Voz & música');
  assert.equal(await page.locator('[data-track-field="start"]').inputValue(), '1.5');
  assert.equal(await page.locator('[data-track-field="gain"]').inputValue(), '0.75');
});
test('segurança: Pixel importado e mutado escapa números, cores e saídas de ranges sem perder edição normal', async t => {
  const page = await editor(t);
  const fields = ['x', 'y', 'w', 'h', 'size', 'color', 'color2', 'text', 'style',
    'opacity', 'brightness', 'contrast', 'saturation', 'hue', 'stroke', 'glow'];
  const ranges = ['opacity', 'brightness', 'contrast', 'saturation', 'hue', 'stroke', 'glow'];
  const payloads = [
    '"><img src=x onerror="window.workstationXSS=1"><input onfocus="window.workstationXSS=2',
    '<img src=x onerror=window.workstationXSS=3>&"\''
  ];
  for (const payload of payloads) {
    await page.evaluate(async ({ payload, fields }) => {
      const layer = { id: payload, name: payload, type: 'text', ...Object.fromEntries(fields.map(field => [field, payload])) };
      const workstation = { active: 'pixel', pixel: { width: payload, height: payload, selected: payload, layers: [layer] } };
      await __motion.startProject({ ...JSON.parse(JSON.stringify(__motion.P())), workstation });
    }, { payload, fields });
    for (const mode of ['imported', 'mutated']) {
      const expected = payload + (mode === 'mutated' ? '&mutated' : '');
      if (mode === 'mutated') await page.evaluate(({ payload, fields }) => {
        const pixel = __motion.P().workstation.pixel;
        Object.assign(pixel.layers[0], Object.fromEntries(fields.map(field => [field, payload])));
        pixel.layers[0].id = pixel.layers[0].name = pixel.selected = pixel.width = pixel.height = payload;
        WorkstationShell.activate('pixel');
      }, { payload: expected, fields });
      for (const field of fields.filter(field => field !== 'style')) {
        assert.equal(await page.locator(`[data-pixel-field="${field}"]`).getAttribute('value'), expected, field);
      }
      for (const field of ranges) {
        assert.equal(await page.locator(`[data-pixel-field="${field}"] + output`).textContent(), expected, field);
      }
      assert.equal(await page.locator('[data-pixel-select]').textContent(), expected);
      assert.equal(await page.locator('[data-pixel-select]').getAttribute('data-pixel-select'), expected);
      assert.deepEqual(await page.locator('[data-pixel-field="style"] option').allTextContents(), ['Sólido', 'Contorno', 'Neon', 'Degradê']);
      await assertNoInjectedMarkup(page);
    }
  }
  await page.evaluate(() => {
    const pixel = __motion.P().workstation.pixel;
    pixel.width = 320; pixel.height = 180;
    Object.assign(pixel.layers[0], { x: 12, y: 20, w: 200, h: 80, size: 32, color: '#123456', color2: '#abcdef',
      text: 'Olá & <Pixel>', style: 'gradient', opacity: .75, brightness: 110, contrast: 120, saturation: 90, hue: 15, stroke: 2, glow: 4 });
    WorkstationShell.activate('pixel');
  });
  for (const [field, value] of Object.entries({ x: '12', y: '20', w: '200', h: '80', size: '32',
    color: '#123456', color2: '#abcdef', text: 'Olá & <Pixel>', style: 'gradient', opacity: '0.75' })) {
    assert.equal(await page.locator(`[data-pixel-field="${field}"]`).inputValue(), value);
  }
  assert.equal(await page.evaluate(() => [...document.querySelector('#wsPixelCanvas').getContext('2d').getImageData(13, 21, 198, 78).data]
    .some((value, index) => index % 4 === 3 && value > 0)), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
  await assertNoInjectedMarkup(page);
});
async function savePNG(page, key, color, send = false) {
  return page.evaluate(async ({ key, color, send }) => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, 320, 180);
    const blob = await new Promise(resolve => c.toBlob(resolve));
    return CreatorWorkstation.saveAsset(blob, 'image', 'Arte.png', key || undefined, undefined, { send });
  }, { key, color, send });
}
test('360 px: shell preserva DOM, folhas e vídeo; projetos, roteiro e undo compartilham estado', async t => {
  const page = await editor(t);
  await page.evaluate(() => { window.originalCanvas = document.querySelector('#canvas'); window.originalTimeline = document.querySelector('#timeline'); });
  for (const module of ['audio', 'pixel', 'script', 'assets', 'video']) {
    await open(page, module);
    assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]), [360, 740]);
  }
  assert.equal(await page.evaluate(() => originalCanvas === document.querySelector('#canvas') && originalTimeline === document.querySelector('#timeline')), true);
  await page.locator('[data-sheet-open="add"]').click();
  assert.equal(await page.locator('#app').getAttribute('data-sheet'), 'add');
  await page.locator('[data-sheet-open="add"]').click();
  await open(page, 'script');
  await page.locator('[data-scene-field="audio"]').fill('Olá, roteiro persistente.');
  await page.locator('[data-scene-field="video"]').fill('Plano da janela');
  await page.locator('[data-action="script-add"]').click();
  assert.equal(await page.locator('#wsScenes tr').count(), 2);
  await page.evaluate(() => document.querySelector('#btnUndo').click());
  assert.equal(await page.locator('#wsScenes tr').count(), 1);
  const first = await page.evaluate(async () => { await __motion.flushSave(); return __motion.P().id; });
  await page.evaluate(() => __motion.startProject({ v: 2, name: 'Outro projeto', aspect: '9:16', width: 320, height: 180, fps: 30, duration: 2, background: '#000000', layers: [], assets: {} }));
  await open(page, 'script');
  assert.equal(await page.locator('[data-scene-field="audio"]').inputValue(), '');
  await page.evaluate(id => __motion.openProjectById(id), first);
  assert.equal(await page.locator('[data-scene-field="audio"]').inputValue(), 'Olá, roteiro persistente.');
  await page.reload(); await page.waitForFunction(() => window.CreatorWorkstation);
  assert.equal(await page.locator('[data-scene-field="video"]').inputValue(), 'Plano da janela');
  await open(page, 'home'); assert.equal(await page.locator('.ws-dock').isVisible(), false);
});
test('OPFS real: substituição atualiza todas as camadas sem duplicar; Link opcional e evento entre abas', async t => {
  const page = await editor(t);
  const key = await savePNG(page, null, 'red', true);
  const before = await page.evaluate(() => __motion.P().layers[0].s.asset);
  let events = 0;
  await page.exposeFunction('savedEvent', () => events++);
  await page.evaluate(() => window.addEventListener('workstation:asset-saved', savedEvent));
  await savePNG(page, key, 'blue');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  const after = await page.evaluate(() => __motion.P().layers[0].s.asset);
  assert.notEqual(after, before); assert.equal(events, 1);
  await page.locator('#wsDynamic').uncheck();
  await savePNG(page, key, 'green');
  assert.equal(await page.evaluate(() => __motion.P().layers[0].s.asset), after);
  await page.evaluate(key => CreatorWorkstation.sendAsset(key), key);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  assert.notEqual(await page.evaluate(() => __motion.P().layers[0].s.asset), after);
  await page.locator('#wsDynamic').check();
  await page.evaluate(() => {
    const original = __motion.P().layers[0];
    __motion.P().layers.push(__motion.makeLayer('image', { s: { ...original.s } }));
    __motion.commit();
  });
  await savePNG(page, key, 'purple');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 2);
  assert.equal(await page.evaluate(() => new Set(__motion.P().layers.map(layer => layer.s.asset)).size), 1);
  // Reproduz o protocolo de uma segunda aba com um arquivo realmente escrito no OPFS.
  await page.evaluate(async key => {
    const old = CreatorWorkstation.state().assets[key], replacement = { ...old, revision: crypto.randomUUID(), updated: Date.now() + 1 };
    const previousPath = old.path.split('/'), oldName = previousPath.pop();
    let dir = await navigator.storage.getDirectory();
    for (const part of previousPath) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(oldName)).getFile();
    const filename = `${key}-${replacement.revision}.png`;
    const writable = await (await dir.getFileHandle(filename, { create: true })).createWritable();
    await writable.write(file); await writable.close();
    replacement.path = [...previousPath, filename].join('/');
    window.received = false; window.busReceived = false;
    window.addEventListener('workstation:asset-received', () => { window.received = true; }, { once: true });
    ProjectAssetBus.subscribe(event => { if (event.type === 'received') window.busReceived = event.asset.key; }, { replay: false });
    const channel = new BroadcastChannel('motion-workstation-assets-v1');
    channel.postMessage({ sender: 'test-tab', projectId: __motion.P().id, asset: replacement, previousRevision: old.revision });
    setTimeout(() => channel.close(), 100);
  }, key);
  await page.waitForFunction(() => window.received);
  assert.equal(await page.evaluate(() => window.busReceived), key);
  await page.evaluate(async () => { await __motion.flushSave(); });
  await page.reload(); await page.waitForFunction(() => window.CreatorWorkstation);
  assert.ok(await page.evaluate(async key => (await CreatorWorkstation.readAsset(CreatorWorkstation.state().assets[key])).size, key));
});
test('APIs modulares compartilham projeto; bus reutilizável entrega snapshots, replay e cancelamento', async t => {
  const page = await editor(t);
  const key = await savePNG(page, null, 'red');
  const result = await page.evaluate(async key => {
    const names = ['WorkstationShell', 'ProjectAssetBus', 'AudioLabModule', 'PixelStudioModule', 'AIScriptCamModule'];
    const sameProject = names.every(name => window[name].getProject().id === __motion.P().id);
    const events = [], listener = event => { events.push(event.type); event.asset.name = 'Mutação externa'; };
    const unsubscribe = ProjectAssetBus.subscribe(listener);
    const asset = ProjectAssetBus.get(key), copy = ProjectAssetBus.list();
    asset.name = 'Mutação'; copy[0].path = 'fora';
    const shell = WorkstationShell.getState(); shell.dynamicLink = false;
    const audio = AudioLabModule.getState(); audio.tracks.push({ id: 'fora' });
    await WorkstationShell.refreshStorage();
    const blob = await ProjectAssetBus.read(key);
    await ProjectAssetBus.save(blob, 'image', 'Atualizada.png', { key });
    unsubscribe();
    await ProjectAssetBus.save(blob, 'image', 'Depois.png', { key });
    const listener2 = event => events.push(event.type);
    ProjectAssetBus.subscribe(listener2, { replay: false }); ProjectAssetBus.unsubscribe(listener2);
    await ProjectAssetBus.save(blob, 'image', 'Depois.png', { key });
    await ProjectAssetBus.send(key);
    WorkstationShell.activate('pixel'); PixelStudioModule.addText();
    const pixel = PixelStudioModule.getState(); pixel.layers[0].text = 'Mutação';
    const script = AIScriptCamModule.getState(); script.scenes[0].audio = 'Mutação';
    return { sameProject, events, name: ProjectAssetBus.get(key).name, layers: __motion.P().layers.length,
      dynamic: WorkstationShell.getState().dynamicLink, tracks: AudioLabModule.getState().tracks.length,
      text: PixelStudioModule.getState().layers[0].text, audio: AIScriptCamModule.getState().scenes[0].audio };
  }, key);
  assert.deepEqual(result, { sameProject: true, events: ['existing', 'saved'], name: 'Depois.png',
    layers: 1, dynamic: true, tracks: 0, text: 'Seu texto', audio: '' });
  assert.equal(await page.evaluate(() => {
    const p = __motion.P(), id = crypto.randomUUID();
    __motion.setProject({ ...p, id, layers: [], assets: {}, workstation: undefined });
    return WorkstationShell.getProject().id === id && ProjectAssetBus.list().length === 0 &&
      AudioLabModule.getState().tracks.length === 0 && PixelStudioModule.getState().layers.length === 0;
  }), true);
});
test('Link envia mídias novas uma vez; desligado exige envio explícito e fontes ficam no módulo', async t => {
  const page = await editor(t);
  const first = await savePNG(page, null, 'red');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await savePNG(page, first, 'blue', true);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await page.locator('#wsDynamic').uncheck();
  const second = await savePNG(page, null, 'green');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await open(page, 'assets'); await page.locator(`[data-send="${second}"]`).click();
  await page.waitForFunction(() => __motion.P().layers.length === 2);
  const third = await savePNG(page, null, 'orange', true);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 3);
  await savePNG(page, third, 'purple', true);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 3);
  await page.locator('#wsDynamic').check();
  const source = await page.evaluate(async first => {
    WorkstationShell.activate('pixel');
    const file = await ProjectAssetBus.read(first);
    await PixelStudioModule.importImage(file, 'Fonte.png');
    return PixelStudioModule.getState().layers[0].asset;
  }, first);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 3);
  await page.evaluate(() => WorkstationShell.setDynamicLink(false));
  await page.locator('[data-action="pixel-save"]').click();
  await page.waitForFunction(() => __motion.P().layers.length === 4 && !document.querySelector('[data-action="pixel-save"]').disabled);
  await page.evaluate(key => ProjectAssetBus.send(key), source);
  const old = await page.evaluate(key => __motion.P().layers.find(l => l.s.workstationAsset === key).s.asset, source);
  await page.evaluate(() => WorkstationShell.setDynamicLink(true));
  await savePNG(page, source, 'cyan');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 5);
  assert.notEqual(await page.evaluate(key => __motion.P().layers.find(l => l.s.workstationAsset === key).s.asset, source), old);
});
test('armazenamento mostra uso, quota e livre; polling, saves, visibility e pagehide respeitam lifecycle', async t => {
  const page = await editor(t, () => {
    window.storageEstimate = { usage: 1048576, quota: 2147483648 }; window.estimateCalls = 0;
    navigator.storage.estimate = async () => { window.estimateCalls++; return window.storageEstimate; };
    window.storageIntervals = new Set();
    const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      const id = set(callback, delay, ...args);
      if (delay === 10000) { window.storageTick = callback; window.storageIntervals.add(id); }
      return id;
    };
    window.clearInterval = id => { window.storageIntervals.delete(id); clear(id); };
  });
  await page.waitForFunction(() => document.querySelector('#wsStorage').textContent.includes('1.0 MB / 2.0 GB'));
  assert.match(await page.locator('#wsStorage').textContent(), /livres 2\.0 GB/);
  assert.equal(await page.evaluate(() => storageIntervals.size), 1);
  await page.evaluate(() => { storageEstimate = { usage: 1073741824, quota: 2147483648 }; storageTick(); });
  await page.waitForFunction(() => document.querySelector('#wsStorage').textContent.includes('1.0 GB / 2.0 GB · livres 1.0 GB'));
  const before = await page.evaluate(() => estimateCalls);
  await savePNG(page, null, 'red');
  assert.ok(await page.evaluate(() => estimateCalls) > before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => storageIntervals.size), 0);
  await page.evaluate(() => {
    storageEstimate = { usage: 2097152, quota: 4194304 };
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('#wsStorage').textContent.includes('2.0 MB / 4.0 MB · livres 2.0 MB'));
  assert.equal(await page.evaluate(() => storageIntervals.size), 1);
  assert.equal(await page.evaluate(async () => {
    storageEstimate = undefined; await WorkstationShell.refreshStorage();
    return document.querySelector('#wsStorage').textContent;
  }), 'OPFS: — / — · livres —');
  assert.equal(await page.evaluate(async () => {
    storageEstimate = { usage: NaN, quota: Infinity }; await WorkstationShell.refreshStorage();
    return document.querySelector('#wsStorage').textContent;
  }), 'OPFS: — / — · livres —');
  assert.equal(await page.evaluate(async () => {
    navigator.storage.estimate = undefined; await WorkstationShell.refreshStorage();
    return document.querySelector('#wsStorage').textContent;
  }), 'OPFS: local · espaço indisponível');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  assert.equal(await page.evaluate(() => storageIntervals.size), 0);
  await page.evaluate(() => {
    navigator.storage.estimate = async () => ({ usage: 0, quota: 1048576 });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.waitForFunction(() => document.querySelector('#wsStorage').textContent.includes('0.0 MB / 1.0 MB · livres 1.0 MB'));
  assert.equal(await page.evaluate(() => storageIntervals.size), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 360);
});
test('bus entre abas envia nova mídia uma vez e preserva Link desligado e confirmação de câmera', async t => {
  const page = await editor(t);
  const source = await savePNG(page, null, 'red');
  await page.evaluate(() => {
    window.remoteEvents = [];
    ProjectAssetBus.subscribe(event => { if (event.type === 'received') remoteEvents.push(event.asset.key); }, { replay: false });
    window.timelineSends = 0;
    const send = MotionWorkstationBridge.send;
    MotionWorkstationBridge.send = (...args) => { timelineSends++; return send(...args); };
    window.remoteChannel = new BroadcastChannel('motion-workstation-assets-v1');
  });
  const broadcast = (key, suppressed = false) => page.evaluate(({ source, key, suppressed }) => {
    const asset = { ...ProjectAssetBus.get(source), key, revision: `revision-${key}` };
    remoteChannel.postMessage({ sender: 'remote-tab', projectId: __motion.P().id,
      asset, previousRevision: null, suppressAutoSend: suppressed });
  }, { source, key, suppressed });
  await broadcast('new-media');
  await page.waitForFunction(() => __motion.P().layers.length === 2);
  assert.equal(await page.evaluate(() => timelineSends), 1);
  await broadcast('new-media');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => timelineSends), 1);
  await broadcast('camera-awaiting-confirmation', true);
  await page.waitForFunction(() => remoteEvents.includes('camera-awaiting-confirmation'));
  assert.equal(await page.evaluate(() => timelineSends), 1);
  await page.evaluate(() => WorkstationShell.setDynamicLink(false));
  await broadcast('link-disabled');
  await page.waitForFunction(() => remoteEvents.includes('link-disabled'));
  assert.equal(await page.evaluate(() => timelineSends), 1);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 2);
  await page.evaluate(() => remoteChannel.close());
});
test('bus revalida revisões após leitura OPFS: edição local, arquivo novo concorrente e duplicata', async t => {
  const page = await editor(t);
  const source = await savePNG(page, null, 'red');
  await page.evaluate(() => WorkstationShell.setDynamicLink(false));
  for (const scenario of ['existing', 'new', 'duplicate']) {
    await page.evaluate(({ source, scenario }) => {
      const original = ProjectAssetBus.get(source), key = scenario === 'existing' ? source : `race-${scenario}`;
      const asset = { ...original, key, revision: `remote-${scenario}` };
      window.race = { key, asset, received: 0, blocked: false };
      ProjectAssetBus.subscribe(event => { if (event.type === 'received' && event.asset.key === key) race.received++; }, { replay: false });
      const getFile = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = async function () {
        const file = await getFile.call(this);
        if (!race.blocked && this.name === original.path.split('/').pop()) {
          race.blocked = true;
          await new Promise(resolve => { race.release = resolve; });
        }
        return file;
      };
      race.restore = () => { FileSystemFileHandle.prototype.getFile = getFile; };
      race.channel = new BroadcastChannel('motion-workstation-assets-v1');
      race.detail = { sender: 'racing-tab', projectId: __motion.P().id, asset,
        previousRevision: scenario === 'existing' ? original.revision : null };
      race.channel.postMessage(race.detail);
    }, { source, scenario });
    await page.waitForFunction(() => !!window.race?.release);
    let expectedRevision;
    if (scenario === 'duplicate') {
      await page.evaluate(() => race.channel.postMessage(race.detail));
      await page.waitForFunction(() => race.received === 1);
      expectedRevision = `remote-${scenario}`;
    } else {
      const key = await page.evaluate(() => race.key);
      await savePNG(page, key, 'blue');
      expectedRevision = await page.evaluate(key => ProjectAssetBus.get(key).revision, key);
    }
    const result = await page.evaluate(async () => {
      race.release();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      race.restore(); race.channel.close();
      return { revision: ProjectAssetBus.get(race.key).revision, received: race.received,
        message: document.querySelector('#wsStatus').textContent };
    });
    assert.equal(result.revision, expectedRevision, scenario);
    assert.equal(result.received, scenario === 'duplicate' ? 1 : 0, scenario);
    if (scenario !== 'duplicate') assert.match(result.message, /Outro estúdio alterou/);
  }
});
test('Pixel: texto, estilos, posição, PNG transparente e substituição do overlay', async t => {
  const page = await editor(t); await open(page, 'pixel');
  await page.locator('[data-action="pixel-text"]').click();
  await page.locator('[data-pixel-field="text"]').fill('PIXEL');
  await page.locator('[data-pixel-field="style"]').selectOption('neon');
  await page.locator('[data-pixel-field="x"]').fill('20'); await page.locator('[data-pixel-field="x"]').dispatchEvent('change');
  await page.locator('[data-action="pixel-save"]').click();
  await page.waitForFunction(() => __motion.P().layers.some(l => l.name === 'Overlay'));
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  assert.equal(await page.evaluate(async () => {
    const asset = CreatorWorkstation.state().assets[CreatorWorkstation.state().pixel.outputKey];
    const img = await createImageBitmap(await CreatorWorkstation.readAsset(asset));
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0); img.close();
    return canvas.getContext('2d').getImageData(319, 179, 1, 1).data[3];
  }), 0);
  await page.locator('[data-pixel-field="style"]').selectOption('gradient');
  await page.locator('[data-action="pixel-save"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-action="pixel-save"]').disabled);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await open(page, 'video');
  const blobSize = await page.evaluate(async () => (await MotionWorkstationBridge.frame()).size);
  assert.ok(blobSize > 0);
  await open(page, 'pixel'); await page.locator('[data-action="pixel-frame"]').click();
  await page.waitForFunction(() => CreatorWorkstation.state().pixel.layers.length === 2);
  assert.equal(await page.evaluate(() => CreatorWorkstation.state().pixel.layers[0].type), 'image');
});
test('mix real OfflineAudioContext: multifaixa, offset, filtro 80 Hz e WAV exportado', async t => {
  const page = await editor(t); await open(page, 'audio');
  const result = await page.evaluate(async () => {
    const w = CreatorWorkstation, s = w.state(), rate = 48000;
    const data = new Float32Array(rate / 5);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(2 * Math.PI * 20 * i / rate) * .1;
    const wav = w.encodeWav({ numberOfChannels: 1, length: data.length, sampleRate: rate, getChannelData: () => data });
    const key = await w.saveAsset(wav, 'audio', 'Grave.wav', undefined, undefined, { role: 'source' });
    s.audio.tracks.push({ id: 'one', asset: key, name: 'Grave', start: .1, gain: 1, muted: false });
    s.audio.preset = false;
    const dry = await w.renderAudioMix();
    s.audio.preset = true;
    const wet = await w.renderAudioMix();
    const rms = buffer => { const samples = buffer.getChannelData(0); return Math.sqrt(samples.slice(7000).reduce((sum, v) => sum + v * v, 0) / (samples.length - 7000)); };
    return { dry: rms(dry), wet: rms(wet), duration: wet.duration, leading: Array.from(wet.getChannelData(0).slice(0, 4000)).every(v => v === 0) };
  });
  assert.ok(result.wet < result.dry * .2); assert.ok(result.duration >= .3); assert.equal(result.leading, true);
  await page.locator('[data-action="audio-wav"]').click();
  await page.waitForFunction(() => __motion.P().layers.some(l => l.type === 'audio'));
  const bytes = await page.evaluate(async () => {
    const w = CreatorWorkstation, key = w.state().audio.mixKey;
    const file = await w.readAsset(w.state().assets[key]);
    return Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 12));
  });
  assert.equal(Buffer.from(bytes).toString('ascii', 0, 4), 'RIFF');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await page.locator('[data-action="audio-webm"]').click();
  await page.waitForFunction(() => {
    const w = CreatorWorkstation; return w.state().assets[w.state().audio.mixKey]?.name === 'Mix.webm';
  });
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  assert.ok(await page.evaluate(() => __motion.A.get(__motion.P().layers[0].s.asset).buffer.length > 0));
});
test('reexportar mix alonga/encurta só caudas completas e preserva trims, cortes, rampas e keyframes', async t => {
  const page = await editor(t); await open(page, 'audio');
  const result = await page.evaluate(async () => {
    const m = __motion, p = m.P(), s = CreatorWorkstation.state();
    const data = new Float32Array(48000);
    const wav = AudioLabModule.encodeWav({ numberOfChannels: 1, length: data.length, sampleRate: 48000, getChannelData: () => data });
    const key = await ProjectAssetBus.save(wav, 'audio', 'Fonte.wav', { role: 'source' });
    s.audio.tracks = [{ id: 'source', asset: key, name: 'Fonte', start: 0, gain: 1 }];
    await AudioLabModule.exportMix('wav');
    const full = p.layers[0], oldAsset = full.s.asset, mixKey = s.audio.mixKey;
    full.start = 1; full.end = 2;
    full.kf.volume = [{ t: 1, v: .5, ease: 'linear' }, { t: 2, v: 1, ease: 'linear' }];
    const clone = () => { const l = JSON.parse(JSON.stringify(full)); l.id = crypto.randomUUID(); p.layers.push(l); return l; };
    const trimmed = clone(); trimmed.end = 1.5;
    const ramped = clone();
    Object.assign(ramped.s, { trimIn: .2, speed: .5, ramp: 'custom', rampPts: [[1, .5], [3, 1.5]] });
    ramped.end = m.timeAtSrc(ramped, 1);
    const rampTrimmed = JSON.parse(JSON.stringify(ramped)); rampTrimmed.id = crypto.randomUUID();
    rampTrimmed.end = m.timeAtSrc(rampTrimmed, .7); p.layers.push(rampTrimmed);
    const split = clone(); m.splitLayer(split, 1.5);
    const splitTail = p.layers.find(l => l !== split && l.s.trimIn === .5);
    p.duration = Math.ceil(ramped.end * 10) / 10;
    const background = m.makeLayer('rect', { start: 0, end: p.duration }); p.layers.push(background);
    const layers = [full, trimmed, ramped, rampTrimmed, split, splitTail];
    const unchanged = l => JSON.stringify({ start: l.start, s: { ...l.s, asset: null }, kf: l.kf });
    const before = layers.map(unchanged), trimmedEnds = [trimmed.end, rampTrimmed.end, split.end];
    m.setTime(.3);
    s.audio.tracks[0].start = 3;
    await AudioLabModule.exportMix('wav');
    const longerDuration = m.A.get(full.s.asset).duration;
    const longer = {
      key: s.audio.mixKey, layers: p.layers.length,
      full: full.end, ramp: ramped.end, expectedRamp: m.timeAtSrc(ramped, longerDuration), split: splitTail.end,
      sourceDuration: longerDuration,
      trims: [trimmed.end, rampTrimmed.end, split.end], unchanged: layers.map(unchanged),
      duration: p.duration, background: background.end,
      sameAsset: new Set(layers.map(l => l.s.asset)).size,
      oldAvailable: m.A.has(oldAsset) && !!p.assets[oldAsset]
    };
    s.audio.tracks[0].start = 0;
    await AudioLabModule.exportMix('wav');
    const shorterDuration = m.A.get(full.s.asset).duration;
    const shorter = { full: full.end, ramp: ramped.end, expectedRamp: m.timeAtSrc(ramped, shorterDuration), sourceDuration: shorterDuration,
      split: splitTail.end, trims: [trimmed.end, rampTrimmed.end, split.end], unchanged: layers.map(unchanged) };
    return { mixKey, before, trimmedEnds, longer, shorter };
  });
  assert.equal(result.longer.key, result.mixKey);
  assert.equal(result.longer.layers, 7); assert.equal(result.longer.sameAsset, 1);
  assert.equal(result.longer.full, 1 + result.longer.sourceDuration);
  assert.equal(result.longer.split, result.longer.full);
  assert.ok(Math.abs(result.longer.ramp - result.longer.expectedRamp) < 1e-6);
  assert.ok(result.longer.duration >= result.longer.ramp);
  assert.equal(result.longer.background, result.longer.duration);
  assert.equal(result.longer.oldAvailable, true);
  assert.equal(result.shorter.full, 1 + result.shorter.sourceDuration);
  assert.equal(result.shorter.split, result.shorter.full);
  assert.ok(Math.abs(result.shorter.ramp - result.shorter.expectedRamp) < 1e-6);
  for (const phase of [result.longer, result.shorter]) {
    assert.deepEqual(phase.trims, result.trimmedEnds);
    assert.deepEqual(phase.unchanged, result.before);
  }
});
test('substituição vinculada respeita 600 s, mínimo de clipe e frame sem mover o início', async t => {
  const page = await editor(t);
  const result = await page.evaluate(async () => {
    const m = __motion, p = m.P();
    const send = async duration => {
      const data = new Float32Array(48000 * duration);
      const wav = AudioLabModule.encodeWav({ numberOfChannels: 1, length: data.length, sampleRate: 48000, getChannelData: () => data });
      await MotionWorkstationBridge.send(new File([wav], 'Mix.wav', { type: 'audio/wav' }), 'limits');
    };
    await send(1);
    const l = p.layers[0]; p.duration = 600; l.start = 599; l.end = 600;
    await send(2);
    const capped = { start: l.start, end: l.end, duration: p.duration };
    p.fps = 5; l.start = 1; l.s.trimIn = 1.99; l.end = 1.01;
    await send(.1);
    return { capped, min: l.end - l.start, start: l.start, trim: l.s.trimIn };
  });
  assert.deepEqual(result.capped, { start: 599, end: 600, duration: 600 });
  assert.ok(Math.abs(result.min - .2) < 1e-6);
  assert.equal(result.start, 1); assert.equal(result.trim, 1.99);
});
test('substituir mix durante playback pausa só após decodificar e para fontes antigas antes da troca', async t => {
  const page = await editor(t, () => {
    window.scheduledSources = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const node = create.call(this), start = node.start.bind(node), stop = node.stop.bind(node);
      const record = { started: false, stopped: false };
      scheduledSources.push(record);
      node.start = (...args) => { record.started = true; return start(...args); };
      node.stop = (...args) => {
        if (!args.length || args[0] <= this.currentTime) {
          record.stopped = true; record.assetAtStop = __motion.P().layers[0].s.asset;
        }
        return stop(...args);
      };
      return node;
    };
  });
  await page.evaluate(async () => {
    const data = new Float32Array(48000 * 2);
    window.playbackWav = AudioLabModule.encodeWav({ numberOfChannels: 1, length: data.length, sampleRate: 48000, getChannelData: () => data });
    await ProjectAssetBus.save(playbackWav, 'audio', 'Mix.wav', { key: 'playing-mix' });
    window.oldPlayingAsset = __motion.P().layers[0].s.asset;
    document.querySelector('#btnPlay').click();
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args);
      await new Promise(resolve => { window.releaseDecode = resolve; });
      return buffer;
    };
    window.replacingMix = ProjectAssetBus.save(playbackWav, 'audio', 'Mix.wav', { key: 'playing-mix' });
    window.restoreDecode = () => { AudioContext.prototype.decodeAudioData = decode; };
  });
  await page.waitForFunction(() => !!window.releaseDecode);
  assert.equal(await page.evaluate(() => __motion.S.playing), true);
  assert.ok(await page.evaluate(() => scheduledSources.some(s => s.started && !s.stopped)));
  const result = await page.evaluate(async () => {
    releaseDecode(); await replacingMix; restoreDecode();
    return { playing: __motion.S.playing, changed: __motion.P().layers[0].s.asset !== oldPlayingAsset,
      stopped: scheduledSources.filter(s => s.started).every(s => s.stopped && s.assetAtStop === oldPlayingAsset) };
  });
  assert.deepEqual(result, { playing: false, changed: true, stopped: true });
});
test('IA local real via adaptador, roteiro editável e mensagem honesta sem OPFS', async t => {
  const page = await editor(t, () => {
    window.modelClosed = 0;
    window.LanguageModel = { availability: async () => 'available', create: async () => ({
      prompt: async () => '{"scenes":[{"audio":"Fala local","video":"Cena local"}]}',
      destroy: () => window.modelClosed++
    }) };
  });
  await open(page, 'script');
  await page.locator('#wsRequest').fill('Vídeo de teste'); await page.locator('#wsGenerate').click();
  await page.waitForFunction(() => CreatorWorkstation.state().script.scenes[0].audio === 'Fala local');
  assert.equal(await page.locator('[data-scene-field="video"]').inputValue(), 'Cena local');
  assert.equal(await page.evaluate(() => window.modelClosed), 1);
  const unsupported = await editor(t, () => Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined }));
  await open(unsupported, 'audio');
  assert.equal(await unsupported.locator('[data-action="audio-wav"]').isDisabled(), true);
  assert.equal(await unsupported.locator('[data-action="audio-record"]').isDisabled(), true);
  await assert.rejects(() => unsupported.evaluate(() => CreatorWorkstation.saveAsset(new Blob(['x']), 'audio', 'x.wav')), /OPFS indisponível/);
  assert.equal(await unsupported.evaluate(() => Object.keys(CreatorWorkstation.state().assets).length), 0);
});
test('captura composta de tela + webcam, MediaRecorder real, áudio mixado e pistas desligadas', async t => {
  const page = await editor(t, () => {
    window.deviceRequests = 0; window.deviceTracks = [];
    function source(color) {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 320, 180);
      const stream = canvas.captureStream(15), ac = new AudioContext(), oscillator = ac.createOscillator(), dest = ac.createMediaStreamDestination();
      oscillator.connect(dest); oscillator.start(); ac.resume();
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
      window.deviceTracks.push(...stream.getTracks());
      window.deviceRequests++; return stream;
    }
    navigator.mediaDevices.getDisplayMedia = async () => source('red');
    navigator.mediaDevices.getUserMedia = async () => source('lime');
  });
  assert.equal(await page.evaluate(() => deviceRequests), 0);
  await open(page, 'script'); await page.locator('#wsScreen').check();
  await page.locator('[data-scene-field="audio"]').fill('Uma fala para o teleprompter');
  await page.locator('#wsCaptureStart').click();
  await page.waitForFunction(() => !document.querySelector('#wsCaptureStop').disabled);
  await page.waitForTimeout(600);
  const preview = await page.evaluate(() => {
    const c = document.querySelector('#wsCaptureCanvas').getContext('2d');
    return [Array.from(c.getImageData(5, 5, 1, 1).data), Array.from(c.getImageData(250, 140, 1, 1).data)];
  });
  assert.deepEqual(preview[0], [255, 0, 0, 255]); assert.deepEqual(preview[1], [0, 255, 0, 255]);
  await page.locator('#wsCaptureStop').click();
  await page.waitForFunction(() => CreatorWorkstation.state().script.captureKey);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 0);
  assert.match(await page.locator('#wsCaptureResult').textContent(), /Deseja abrir na timeline e aplicar o corte automático de silêncios agora\?/);
  assert.equal(await page.evaluate(() => deviceTracks.every(track => track.readyState === 'ended')), true);
  assert.ok(await page.evaluate(async () => {
    const w = CreatorWorkstation; return (await w.readAsset(w.state().assets[w.state().script.captureKey])).size;
  }));
  await page.locator('[data-action="capture-send"]').click();
  await page.waitForFunction(() => __motion.P().layers.some(l => l.type === 'video'));
  await page.waitForFunction(() => document.documentElement.dataset.workspace === 'video');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  assert.ok(await page.evaluate(() => __motion.A.get(__motion.P().layers[0].s.asset).buffer.length > 0));
  assert.ok(await page.evaluate(() => __motion.A.get(__motion.P().layers[0].s.asset).duration > .4));
  await open(page, 'script');
  await page.evaluate(() => { window.silenceOpened = 0; MotionWorkstationBridge.silence = () => window.silenceOpened++; });
  await page.locator('[data-action="capture-silence"]').click();
  await page.waitForFunction(() => window.silenceOpened === 1 && document.documentElement.dataset.workspace === 'video');
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 1);
  await open(page, 'script');
  await page.locator('#wsCaptureStart').click(); await page.waitForTimeout(300);
  await open(page, 'video');
  assert.equal(await page.evaluate(() => deviceTracks.every(track => track.readyState === 'ended')), true);
});
test('importação multifaixa e microfone real com monitor opcional; falha de permissão limpa recursos', async t => {
  const page = await editor(t, () => {
    window.micTracks = []; window.denyMic = false;
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.denyMic) throw new DOMException('Permissão negada', 'NotAllowedError');
      const context = new AudioContext(), source = context.createOscillator(), output = context.createMediaStreamDestination();
      source.connect(output); source.start(); await context.resume();
      window.micTracks.push(...output.stream.getTracks()); return output.stream;
    };
  });
  await open(page, 'audio');
  const buffer = Buffer.from(await page.evaluate(async () => {
    const data = new Float32Array(2400);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 12) * .1;
    return Array.from(new Uint8Array(await CreatorWorkstation.encodeWav({
      numberOfChannels: 1, length: data.length, sampleRate: 48000, getChannelData: () => data
    }).arrayBuffer()));
  }));
  await page.locator('#wsAudioInput').setInputFiles([{ name: 'Um.wav', mimeType: 'audio/wav', buffer }, { name: 'Dois.wav', mimeType: 'audio/wav', buffer }]);
  await page.waitForFunction(() => CreatorWorkstation.state().audio.tracks.length === 2);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 0);
  await page.locator('#wsAudioRecord').click();
  await page.waitForFunction(() => !document.querySelector('#wsAudioStop').disabled);
  assert.equal(await page.locator('#wsMonitor').isChecked(), false);
  await page.waitForTimeout(300); await page.locator('#wsAudioStop').click();
  await page.waitForFunction(() => CreatorWorkstation.state().audio.tracks.length === 3);
  assert.equal(await page.evaluate(() => __motion.P().layers.length), 0);
  assert.equal(await page.evaluate(() => micTracks.every(track => track.readyState === 'ended')), true);
  await page.evaluate(() => { window.denyMic = true; });
  await page.locator('#wsAudioRecord').click();
  await page.waitForFunction(() => document.querySelector('#wsStatus').textContent.includes('Permissão negada'));
  assert.equal(await page.locator('#wsAudioRecord').isEnabled(), true);
  assert.equal(await page.evaluate(() => CreatorWorkstation.state().audio.tracks.length), 3);
});
test('microfone cancelado em segundo plano libera dispositivos e volta a gravar ao retornar', async t => {
  const page = await editor(t, () => {
    window.micTracks = []; window.micContexts = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), source = context.createOscillator(), output = context.createMediaStreamDestination();
      source.connect(output); source.start(); await context.resume();
      micContexts.push(context); micTracks.push(...output.stream.getTracks());
      return output.stream;
    };
  });
  await open(page, 'audio');
  const visibility = hidden => page.evaluate(hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await page.locator('#wsAudioRecord').click();
  await page.waitForFunction(() => !document.querySelector('#wsAudioStop').disabled);
  assert.equal(await page.locator('#wsAudioRecord').isDisabled(), true);
  await visibility(true);
  assert.equal(await page.locator('#wsAudioRecord').isEnabled(), true);
  assert.equal(await page.locator('#wsAudioStop').isDisabled(), true);
  assert.equal(await page.evaluate(() => micTracks.every(track => track.readyState === 'ended')), true);
  await visibility(false);
  assert.equal(await page.locator('#wsAudioRecord').isEnabled(), true);
  assert.equal(await page.locator('#wsAudioRecord').textContent(), 'Gravar microfone');
  assert.equal(await page.evaluate(() => CreatorWorkstation.state().audio.tracks.length), 0);
  await page.locator('#wsAudioRecord').click();
  await page.waitForFunction(() => micTracks.length === 2 && !document.querySelector('#wsAudioStop').disabled);
  await page.waitForTimeout(300);
  await page.locator('#wsAudioStop').click();
  await page.waitForFunction(() => CreatorWorkstation.state().audio.tracks.length === 1);
  assert.equal(await page.locator('#wsAudioRecord').isEnabled(), true);
  assert.equal(await page.evaluate(() => micTracks.every(track => track.readyState === 'ended')), true);
  await page.evaluate(() => Promise.all(micContexts.map(context => context.close())));
});
test('teleprompter acompanha palavras reconhecidas sem destacar palavras ausentes', async t => {
  const page = await editor(t, () => {
    window.SpeechRecognition = class {
      start() { window.speechEngine = this; }
      abort() { window.speechAborted = true; }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      canvas.getContext('2d').fillRect(0, 0, 320, 180);
      return canvas.captureStream(15);
    };
  });
  await open(page, 'script');
  await page.locator('[data-scene-field="audio"]').fill('Olá criação vamos gravar agora');
  await page.locator('#wsSpeech').check(); await page.locator('#wsCaptureMic').uncheck();
  await page.locator('#wsCaptureStart').click();
  await page.waitForFunction(() => window.speechEngine);
  await page.evaluate(() => {
    const result = [{ transcript: 'olá criação' }]; result.isFinal = true;
    speechEngine.onresult({ resultIndex: 0, results: [result] });
  });
  assert.equal(await page.locator('#wsPrompter mark').textContent(), 'criação');
  await page.evaluate(() => {
    const result = [{ transcript: 'palavras totalmente diferentes' }]; result.isFinal = false;
    speechEngine.onresult({ resultIndex: 0, results: [result] });
  });
  assert.equal(await page.locator('#wsPrompter mark').textContent(), 'criação');
  await page.waitForTimeout(250); await page.locator('#wsCaptureStop').click();
  await page.waitForFunction(() => CreatorWorkstation.state().script.captureKey);
  assert.equal(await page.evaluate(() => speechAborted), true);
  await page.locator('[data-action="capture-send"]').click();
  await page.waitForFunction(() => __motion.P().layers.some(layer => layer.type === 'video'));
  assert.ok(await page.evaluate(() => __motion.A.get(__motion.P().layers[0].s.asset).duration > 0));
});
test('escrita OPFS interrompida pela troca de projeto não contamina o novo', async t => {
  const page = await editor(t);
  const result = await page.evaluate(async () => {
    const w = CreatorWorkstation, old = __motion.P(), blob = new Blob(['not-media'], { type: 'audio/wav' });
    // La création du répertoire et l'écriture OPFS sont asynchrones.
    const pending = w.saveAsset(blob, 'audio', 'Interrupted.wav').then(() => false, () => true);
    __motion.setProject({ ...old, id: crypto.randomUUID(), assets: {}, layers: [], workstation: undefined });
    const cancelled = await pending;
    return { cancelled, assets: Object.keys(w.state().assets).length, layers: __motion.P().layers.length };
  });
  assert.deepEqual(result, { cancelled: true, assets: 0, layers: 0 });
});
test('seletor de arquivo aberto no projeto anterior não importa no projeto novo', async t => {
  const page = await editor(t); await open(page, 'audio');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-action="audio-import"]').click(); await chooser;
  await page.evaluate(() => {
    const p = __motion.P();
    __motion.setProject({ ...p, id: crypto.randomUUID(), layers: [], assets: {}, workstation: undefined });
  });
  await page.locator('#wsAudioInput').setInputFiles({ name: 'Antigo.wav', mimeType: 'audio/wav', buffer: Buffer.from('não deve ser importado') });
  await page.waitForFunction(() => document.querySelector('#wsStatus').textContent.includes('cancelada'));
  assert.equal(await page.evaluate(() => CreatorWorkstation.state().audio.tracks.length), 0);
  assert.equal(await page.evaluate(() => Object.keys(CreatorWorkstation.state().assets).length), 0);
});
