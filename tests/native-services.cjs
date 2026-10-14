const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(filename, globals = {}) {
  const context = vm.createContext({
    Blob, File, AbortController, URL, ...globals, module: { exports: {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), context);
  return { service: context.module.exports, context };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => JSON.parse(JSON.stringify(value));
const metadata = {
  titles: ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'],
  description: 'Descrição em português.',
  tags: ['vídeo', 'edição'],
  chapters: [{ time: '00:00', title: 'Início' }, { time: '00:12', title: 'Fim' }]
};

function aiMock(prompt) {
  const created = [];
  const api = {
    availability: async () => 'available',
    create: async (options) => {
      const session = {
        options, destroyed: 0,
        prompt: async (...args) => typeof prompt === 'function' ? prompt(...args) : prompt,
        destroy() { this.destroyed++; }
      };
      created.push(session);
      return session;
    }
  };
  return { api, created };
}

test('Chrome: globals, adaptação moderna/legada e estados normalizados', async () => {
  const modern = aiMock('');
  const legacy = { capabilities: async () => ({ available: 'readily' }) };
  const { service, context } = load('chrome-ai.js', {
    self: { LanguageModel: modern.api, ai: { languageModel: legacy, summarizer: legacy } }
  });
  assert.equal(context.ChromeAIService, service);
  assert.equal(service.checkAvailability, service.availability);
  assert.equal(service.generateVideoMetadata, service.generateMetadata);
  assert.equal(typeof service.onDownloadProgress, 'function');
  for (const name of ['LanguageModel', 'summarizer']) {
    const adapter = service.getAPI(name);
    assert.equal(typeof adapter.availability, 'function');
    assert.equal(typeof adapter.create, 'function');
    assert.equal(await adapter.availability(), 'available');
  }
  assert.equal(service.getAPI('unknown'), null);
  assert.equal(await service.availability('Summarizer'), 'available');
  for (const [raw, normalized] of [
    ['available', 'available'], ['readily', 'available'],
    ['downloadable', 'after-download'], ['after-download', 'after-download'],
    ['downloading', 'downloading'], ['unavailable', 'unavailable'], ['no', 'unavailable']
  ]) {
    modern.api.availability = async () => raw;
    assert.equal(await service.checkAvailability(), normalized);
    assert.equal(await service.getAPI().availability(), normalized);
    legacy.capabilities = async () => ({ available: raw });
    assert.equal(await service.getAPI('summarizer').availability(), normalized);
  }
  const missing = load('chrome-ai.js').service;
  assert.equal(await missing.checkAvailability(), 'unavailable');
  assert.equal(await missing.analyzeVideoFrame({}), null);
  assert.match(missing.reason, /indisponível/);
  assert.equal(await missing.generateVideoMetadata('texto'), null);
  assert.equal(await missing.suggestSmartCuts([{ start: 1, end: 3 }]), null);
  assert.equal(await missing.translateSubtitles([{ text: 'Olá' }], 'en'), null);
});

test('Chrome: adaptador preserva contexto, opções e sessão moderna/legada', async () => {
  for (const modern of [true, false]) {
    const options = { sourceLanguage: 'pt', targetLanguage: 'en' };
    const session = {};
    const api = {
      [modern ? 'availability' : 'capabilities'](received) {
        assert.equal(this, api);
        assert.equal(received, options);
        return modern ? 'downloadable' : { available: 'after-download' };
      },
      create(received) {
        assert.equal(this, api);
        assert.equal(received, options);
        return Promise.resolve(session);
      }
    };
    const { service } = load('chrome-ai.js', modern
      ? { Translator: api } : { ai: { translator: api } });
    const adapter = service.getAPI('Translator');
    assert.equal(await adapter.availability(options), 'after-download');
    assert.equal(await adapter.create(options), session);
    assert.equal(await service.checkAvailability('translator', options), 'after-download');
    api[modern ? 'availability' : 'capabilities'] = () => { throw new Error('blocked'); };
    assert.equal(await service.checkAvailability('Translator'), 'unavailable');
  }
});

test('Chrome: callback público de progresso funciona sem options e pode mudar durante download', async () => {
  let emit;
  const globalProgress = [];
  const updatedProgress = [];
  const localProgress = [];
  const model = aiMock(JSON.stringify(metadata));
  const originalCreate = model.api.create;
  model.api.create = async (options) => {
    options.monitor({ addEventListener(name, callback) {
      assert.equal(name, 'downloadprogress');
      emit = callback;
    } });
    emit({ loaded: 1, total: 4 });
    return originalCreate(options);
  };
  const { service } = load('chrome-ai.js', { LanguageModel: model.api });
  service.onDownloadProgress = (pct) => { globalProgress.push(pct); };
  assert.deepEqual(plain(await service.generateVideoMetadata('texto')), metadata);
  assert.deepEqual(globalProgress, [0.25]);
  service.onDownloadProgress = (pct) => { updatedProgress.push(pct); };
  emit({ loaded: 3, total: 4 });
  emit({ loaded: 8, total: 4 });
  emit({ loaded: -1, total: 4 });
  for (const event of [
    { loaded: 1, total: 0 }, { loaded: NaN, total: 4 }, { loaded: 1, total: Infinity }
  ]) emit(event);
  assert.deepEqual(globalProgress, [0.25]);
  assert.deepEqual(updatedProgress, [0.75, 1, 0]);
  service.onDownloadProgress = () => { throw new Error('callback'); };
  assert.ok(await service.generateVideoMetadata('texto', {
    onDownloadProgress: (pct) => { localProgress.push(pct); }
  }));
  assert.deepEqual(localProgress, [0.25]);
  service.onDownloadProgress = null;
  assert.ok(await service.generateVideoMetadata('texto'));
});

test('Chrome: captura JPEG .8, multimodal, progresso e destruição', async () => {
  const model = aiMock('Um quadro com pessoas.');
  let image;
  let progress;
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
  const canvas = {
    getContext: () => ({ drawImage: (...args) => { image = args; } }),
    toBlob(callback, mime, quality) {
      assert.equal(mime, 'image/jpeg');
      assert.equal(quality, 0.8);
      callback(blob);
    }
  };
  const originalCreate = model.api.create;
  model.api.create = async (options) => {
    options.monitor({ addEventListener(name, callback) {
      assert.equal(name, 'downloadprogress');
      callback({ loaded: 30, total: 60 });
      callback({ loaded: 1, total: 0 });
    } });
    return originalCreate(options);
  };
  let content;
  model.api.create = ((create) => async (options) => {
    const session = await create(options);
    session.prompt = async (messages) => { content = messages[0].content; return 'Descrição'; };
    return session;
  })(model.api.create);
  const { service } = load('chrome-ai.js', {
    LanguageModel: model.api, document: { createElement: () => canvas }
  });
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const promptText = '  Descreva só as cores.\nNão altere este pedido.  ';
  assert.equal(await service.analyzeVideoFrame(video, promptText, {
    prompt: 'Não usar', onDownloadProgress: (n) => { progress = n; }
  }), 'Descrição');
  assert.equal(progress, 0.5);
  assert.equal(canvas.width, 1920);
  assert.equal(canvas.height, 1080);
  assert.equal(image[0], video);
  assert.deepEqual(plain(model.created[0].options.expectedInputs), [{ type: 'image' }, { type: 'text' }]);
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].value, blob);
  assert.equal(content[1].type, 'text');
  assert.equal(content[1].value, promptText);
  assert.equal(model.created[0].destroyed, 1);
  for (const prompt of ['', 'Outro pedido']) {
    assert.equal(await service.analyzeVideoFrame(video, prompt), 'Descrição');
    assert.equal(content[1].value, prompt);
  }
  const sourceCanvas = { width: 640, height: 360 };
  assert.equal(await service.analyzeVideoFrame(sourceCanvas, {
    prompt: 'Pedido legado', onDownloadProgress: (n) => { progress = n; }
  }), 'Descrição');
  assert.equal(content[1].value, 'Pedido legado');
  assert.equal(image[0], sourceCanvas);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 360);
  assert.equal(progress, 0.5);
  assert.equal(await service.analyzeVideoFrame(video), 'Descrição');
  assert.equal(content[1].value, 'Descreva este quadro em português do Brasil.');
  model.created.length = 0;
  model.api.create = async () => {
    const session = { destroyed: 0, prompt: async () => { throw new Error('fail'); },
      destroy() { this.destroyed++; } };
    model.created.push(session);
    return session;
  };
  assert.equal(await service.analyzeVideoFrame(video), null);
  assert.match(service.reason, /Não foi possível/);
  assert.equal(model.created[0].destroyed, 1);
  canvas.toBlob = (callback) => callback(null);
  assert.equal(await service.analyzeVideoFrame(video), null);
  assert.equal(model.created.length, 1);
});

test('Chrome: metadados balanceados toleram fences, aspas e schema não suportado', async () => {
  const data = { ...metadata, description: 'Vídeo com "aspas", {chaves} e \\ barras.' };
  const calls = [];
  const model = aiMock(async (prompt, options) => {
    assert.match(prompt, /MM:SS.*HH:MM:SS/);
    calls.push(options);
    if (options.responseConstraint) {
      const error = new Error('responseConstraint not supported');
      error.name = 'NotSupportedError';
      throw error;
    }
    return '```json\n' + JSON.stringify(data) + '\n```';
  });
  const { service } = load('chrome-ai.js', { LanguageModel: model.api });
  assert.deepEqual(plain(await service.generateVideoMetadata('texto')), data);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].responseConstraint.properties.titles.maxItems, 5);
  const timeSchema = calls[0].responseConstraint.properties.chapters.items.properties.time;
  assert.equal(timeSchema.type, 'string');
  assert.ok(new RegExp(timeSchema.pattern).test('00:00'));
  assert.ok(new RegExp(timeSchema.pattern).test('01:02:03'));
  assert.ok(!new RegExp(timeSchema.pattern).test('00:60'));
  assert.ok(!new RegExp(timeSchema.pattern).test('60:00'));
  assert.equal(calls[1].responseConstraint, undefined);
  assert.equal(model.created[0].destroyed, 1);
  const network = aiMock(async () => { throw new Error('network'); });
  const failed = load('chrome-ai.js', { LanguageModel: network.api }).service;
  assert.equal(await failed.generateMetadata('texto'), null);
  assert.equal(network.created[0].destroyed, 1);
});

test('Chrome: rejeita metadados malformados e capítulos sem tempos válidos', async () => {
  for (const data of [
    { ...metadata, titles: ['Só um'] },
    { ...metadata, titles: ['1', '2', '3', '4', ''] },
    { ...metadata, description: 3 },
    { ...metadata, tags: ['ok', 3] },
    { ...metadata, chapters: [{ title: 'Sem tempo' }] },
    { ...metadata, chapters: [{ time: -1, title: 'Negativo' }] },
    { ...metadata, chapters: [{ time: '00:99', title: 'Inválido' }] },
    ...['60:00', '01:60:00', '1:02', '01:2', '1:02:03', '00:00:99', '12', '', ' 00:00',
      '99999999999999999999:00:00', null, true, 1e309, Number.MAX_VALUE].map((time) =>
      ({ ...metadata, chapters: [{ time, title: 'Inválido' }] })),
    { ...metadata, chapters: [{ time: '01:00:00', title: 'Depois' }, { time: '59:59', title: 'Antes' }] },
    { ...metadata, chapters: [{ time: 10, title: 'Depois' }, { time: 2, title: 'Antes' }] }
  ]) {
    const model = aiMock(JSON.stringify(data));
    const { service } = load('chrome-ai.js', { LanguageModel: model.api });
    assert.equal(await service.generateMetadata('texto'), null);
    assert.equal(model.created[0].destroyed, 1);
  }
  const chapters = [
    { time: 0, title: 'Início' }, { time: 62.9, title: 'Minuto' },
    { time: '59:59', title: 'Fim da hora' }, { time: 3600, title: 'Hora' },
    { time: '01:02:03', title: 'Capítulo' }
  ];
  const model = aiMock(JSON.stringify({ ...metadata, chapters }));
  const result = await load('chrome-ai.js', { LanguageModel: model.api }).service.generateMetadata('texto');
  assert.deepEqual(plain(result.chapters), chapters.map((chapter, i) => ({
    ...chapter, time: ['00:00', '01:02', '59:59', '01:00:00', '01:02:03'][i]
  })));
});

test('Chrome: cortes ordenados, limitados, números não convertidos e intervalos inválidos descartados', async () => {
  const response = '```json\n' + JSON.stringify([
    { start: 7, end: 20, reason: 'Final', extra: 'Não vazar' },
    { start: 0, end: 3, reason: 'Início', text: 'Não vazar' },
    { start: 5, end: 6, reason: '' },
    { start: 3, end: 4 }, { start: 3, end: 4, reason: 42 },
    { start: 3, end: 4, reason: null }, { start: 3, end: 4, reason: {} },
    { start: '3', end: 4, reason: 'Trecho' }, { start: -1, end: 3, reason: 'Trecho' },
    { start: 4, end: 4, reason: 'Trecho' }, { start: 30, end: 40, reason: 'Trecho' },
    { start: 2, end: null, reason: 'Trecho' }, { start: 1e309, end: 1e309, reason: 'Trecho' }
  ]) + '\n```';
  const model = aiMock((prompt, options) => {
    assert.match(prompt, /start, end, reason/);
    assert.deepEqual(plain(options.responseConstraint.items.required), ['start', 'end', 'reason']);
    assert.equal(options.responseConstraint.items.properties.reason.type, 'string');
    assert.equal(options.responseConstraint.items.additionalProperties, false);
    return response;
  });
  const { service } = load('chrome-ai.js', { LanguageModel: model.api });
  const cuts = await service.suggestSmartCuts([{ start: 2, end: 10, text: 'Vídeo' }]);
  assert.deepEqual(plain(cuts), [
    { start: 2, end: 3, reason: 'Início' }, { start: 5, end: 6, reason: '' },
    { start: 7, end: 10, reason: 'Final' }
  ]);
  assert.equal(model.created[0].destroyed, 1);
  assert.equal(await service.suggestSmartCuts([{ start: NaN, end: 1 }]), null);
  assert.equal(model.created.length, 1);
});

test('Chrome: tradução detecta idioma, mantém tempos e não altera array original', async () => {
  let createOptions;
  let detectorDestroyed = 0;
  let translatorDestroyed = 0;
  const { service } = load('chrome-ai.js', {
    LanguageDetector: { create: async () => ({
      detect: async () => [{ detectedLanguage: 'es', confidence: 0.9 }],
      destroy: () => { detectorDestroyed++; }
    }) },
    Translator: { create: async (options) => {
      createOptions = options;
      return { translate: async (text) => 'traduzido:' + text, destroy: () => { translatorDestroyed++; } };
    } }
  });
  const subtitles = [
    { start: 0, end: 1.234, text: 'Hola', extra: 'preservar' },
    { start: 2, end: 3, text: '' }
  ];
  const before = JSON.stringify(subtitles);
  const result = await service.translateSubtitles(subtitles, 'en');
  assert.equal(createOptions.sourceLanguage, 'es');
  assert.equal(createOptions.targetLanguage, 'en');
  assert.deepEqual(plain(result), [
    { start: 0, end: 1.234, text: 'traduzido:Hola', extra: 'preservar' },
    { start: 2, end: 3, text: '' }
  ]);
  assert.notEqual(result, subtitles);
  assert.equal(JSON.stringify(subtitles), before);
  assert.equal(detectorDestroyed, 1);
  assert.equal(translatorDestroyed, 1);
});

test('Chrome: tradução usa pt padrão e fallback LanguageModel em falhas do Translator', async () => {
  let source;
  let disposed = 0;
  const prompts = [];
  const model = aiMock((prompt) => { prompts.push(prompt); return 'Hello'; });
  const { service } = load('chrome-ai.js', {
    LanguageModel: model.api,
    Translator: { create: async (options) => {
      source = options.sourceLanguage;
      return { translate: async () => { throw new Error('unsupported'); }, destroy: () => { disposed++; } };
    } },
    LanguageDetector: { create: async () => { throw new Error('unavailable'); } }
  });
  assert.deepEqual(plain(await service.translateSubtitles([{ start: 3, end: 4, text: 'Olá' }], 'en')),
    [{ start: 3, end: 4, text: 'Hello' }]);
  assert.equal(source, 'pt');
  assert.match(prompts[0], /de pt para en/);
  assert.equal(disposed, 1);
  assert.equal(model.created[0].destroyed, 1);
  const missingTranslator = load('chrome-ai.js', { LanguageModel: model.api }).service;
  assert.ok(await missingTranslator.translateSubtitles([{ text: 'Olá' }], 'en'));
});

test('Chrome: destroy cancela criações pendentes, prompts e permite novas operações', async () => {
  const creation = deferred();
  let options;
  let disposed = 0;
  let prompts = 0;
  const { service } = load('chrome-ai.js', {
    LanguageModel: { create: (opts) => { options = opts; return creation.promise; } }
  });
  const result = service.generateMetadata('texto');
  service.destroy();
  assert.equal(options.signal.aborted, true);
  creation.resolve({ destroy: () => { disposed++; }, prompt: async () => { prompts++; } });
  assert.equal(await result, null);
  assert.equal(disposed, 1);
  assert.equal(prompts, 0);

  const response = deferred();
  const model = aiMock(() => response.promise);
  const loaded = load('chrome-ai.js', { LanguageModel: model.api });
  const running = loaded.service.generateMetadata('texto');
  await tick();
  loaded.service.destroy();
  assert.equal(model.created[0].destroyed, 1);
  response.resolve(JSON.stringify(metadata));
  assert.equal(await running, null);
  assert.equal(model.created[0].destroyed, 1);
  loaded.context.LanguageModel = aiMock(JSON.stringify(metadata)).api;
  assert.ok(await loaded.service.generateMetadata('novo'));
});

test('Chrome: destroy também invalida criação pendente do Translator e LanguageDetector', async () => {
  for (const name of ['Translator', 'LanguageDetector']) {
    const creation = deferred();
    let options;
    let destroyed = 0;
    let executed = 0;
    const globals = {
      [name]: { create: (opts) => { options = opts; return creation.promise; } }
    };
    const { service } = load('chrome-ai.js', globals);
    const translation = service.translateSubtitles([{ start: 1, end: 2, text: 'Olá' }], 'en');
    service.destroy();
    assert.equal(options.signal.aborted, true);
    creation.resolve({
      detect: async () => { executed++; return [{ detectedLanguage: 'pt' }]; },
      translate: async () => { executed++; return 'Hello'; },
      destroy: () => { destroyed++; }
    });
    assert.equal(await translation, null);
    assert.equal(destroyed, 1);
    assert.equal(executed, 0);
  }
});

function wakeMock() {
  const listeners = {};
  const sentinels = [];
  let calls = 0;
  const document = {
    visibilityState: 'visible',
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  const navigator = { wakeLock: { request: async (type) => {
    assert.equal(type, 'screen');
    calls++;
    const sentinel = {
      released: false, releaseCount: 0, callback: null,
      addEventListener: (_, callback) => { sentinel.callback = callback; },
      release: async () => {
        sentinel.releaseCount++;
        sentinel.released = true;
        sentinel.callback?.();
      }
    };
    sentinels.push(sentinel);
    return sentinel;
  } } };
  const loaded = load('mobile-pwa.js', { navigator, document });
  return { ...loaded, navigator, document, sentinels, listeners, calls: () => calls };
}

test('Mobile: sem inicialização automática, ausência de APIs e haptic seguro', async () => {
  const { service, context } = load('mobile-pwa.js');
  assert.equal(context.MobilePWAIntegration, service);
  for (const [name, previous] of [
    ['saveMediaToOPFS', service.opfs.save], ['loadMediaFromOPFS', service.opfs.load],
    ['deleteMediaFromOPFS', service.opfs.delete], ['listMediaInOPFS', service.opfs.list],
    ['isSupported', service.opfs.isSupported], ['triggerHaptic', service.haptic],
    ['enableWakeLock', service.wakeLock.enable], ['releaseWakeLock', service.wakeLock.release]
  ]) {
    assert.equal(typeof service[name], 'function');
    assert.equal(service[name], previous);
  }
  assert.equal(await service.wakeLock.enable(), false);
  await service.wakeLock.release();
  assert.equal(service.opfs.isSupported(), false);
  assert.equal(await service.opfs.save('id', new Blob(['a'])), false);
  assert.equal(await service.opfs.load('id'), null);
  assert.equal(await service.opfs.delete('id'), false);
  assert.deepEqual(plain(await service.opfs.list()), []);
  assert.equal(service.haptic('snap'), false);
  assert.equal(await service.consumeSharedMedia(() => {}), 0);
  const patterns = [];
  const loaded = load('mobile-pwa.js', { navigator: {
    vibrate: (pattern) => { patterns.push(plain(pattern)); return true; }
  } });
  assert.equal(loaded.service.triggerHaptic(), true);
  for (const type of ['snap', 'success', 'longpress']) assert.equal(loaded.service.triggerHaptic(type), true);
  assert.deepEqual(patterns, [10, 10, [15, 30, 15], 5]);
  assert.equal(loaded.service.haptic('unknown'), false);
  assert.equal(loaded.service.haptic('toString'), false);
  loaded.context.navigator.vibrate = () => { throw new Error('blocked'); };
  assert.equal(loaded.service.haptic('snap'), false);
});

test('Mobile: wake lock deduplica requests, solta ao ocultar e reativa apenas com wantsLock', async () => {
  const mock = wakeMock();
  assert.equal(mock.calls(), 0);
  assert.deepEqual(await Promise.all([mock.service.wakeLock.enable(), mock.service.wakeLock.enable()]), [true, true]);
  assert.equal(mock.calls(), 1);
  mock.document.visibilityState = 'hidden';
  mock.listeners.visibilitychange();
  await tick();
  assert.equal(mock.sentinels[0].releaseCount, 1);
  mock.document.visibilityState = 'visible';
  mock.listeners.visibilitychange();
  await tick();
  assert.equal(mock.calls(), 2);
  await mock.service.wakeLock.release();
  assert.equal(mock.sentinels[1].releaseCount, 1);
  mock.document.visibilityState = 'hidden';
  mock.listeners.visibilitychange();
  mock.document.visibilityState = 'visible';
  mock.listeners.visibilitychange();
  await tick();
  assert.equal(mock.calls(), 2);
});

test('Mobile: liberação durante request pendente não deixa lock órfão', async () => {
  const request = deferred();
  let released = 0;
  const { service } = load('mobile-pwa.js', {
    navigator: { wakeLock: { request: () => request.promise } }
  });
  const enabling = service.enableWakeLock();
  const releasing = service.releaseWakeLock();
  request.resolve({ release: async () => { released++; } });
  assert.equal(await enabling, false);
  await releasing;
  assert.equal(released, 1);
});

test('Mobile: request pendente invalidado por visibilidade é liberado e substituído', async () => {
  const mock = wakeMock();
  const first = deferred();
  let requests = 0;
  const original = mock.navigator.wakeLock.request;
  mock.navigator.wakeLock.request = () => ++requests === 1 ? first.promise : original('screen');
  const enabling = mock.service.enableWakeLock();
  mock.document.visibilityState = 'hidden';
  mock.listeners.visibilitychange();
  mock.document.visibilityState = 'visible';
  mock.listeners.visibilitychange();
  let released = 0;
  first.resolve({ release: async () => { released++; } });
  await enabling;
  await tick();
  assert.equal(released, 1);
  assert.equal(requests, 2);
  await mock.service.releaseWakeLock();
  assert.equal(mock.sentinels[0].releaseCount, 1);
});

test('Mobile: reativação durante liberação pendente aguarda um novo lock válido', async () => {
  const first = deferred();
  const mock = wakeMock();
  let calls = 0;
  const original = mock.navigator.wakeLock.request;
  mock.navigator.wakeLock.request = () => ++calls === 1 ? first.promise : original('screen');
  const oldEnabling = mock.service.enableWakeLock();
  const releasing = mock.service.releaseWakeLock();
  const newEnabling = mock.service.enableWakeLock();
  let released = 0;
  first.resolve({ release: async () => { released++; } });
  assert.equal(await oldEnabling, false);
  await releasing;
  assert.equal(await newEnabling, true);
  assert.equal(released, 1);
  assert.equal(calls, 2);
  await mock.service.releaseWakeLock();
});

function opfsMock() {
  const files = new Map();
  const writes = [];
  let failWrite = false;
  let aborts = 0;
  const directory = {
    async getFileHandle(id, options) {
      if (!files.has(id) && !options?.create) throw new Error('Not found');
      return {
        kind: 'file',
        createWritable: async () => ({
          write: async (blob) => {
            writes.push(blob);
            if (failWrite) throw new Error('full');
            files.set(id, blob);
          },
          close: async () => {},
          abort: async () => { aborts++; }
        }),
        getFile: async () => files.get(id)
      };
    },
    removeEntry: async (id) => {
      if (!files.delete(id)) throw new Error('Not found');
    },
    async *entries() {
      for (const id of files.keys()) yield [id, { kind: 'file' }];
      yield ['nested', { kind: 'directory' }];
    }
  };
  let opened = 0;
  const navigator = { storage: { getDirectory: async () => ({
    getDirectoryHandle: async (name, options) => {
      assert.equal(name, 'media');
      assert.equal(typeof options.create, 'boolean');
      opened++;
      return directory;
    }
  }) } };
  const urls = [];
  const loaded = load('mobile-pwa.js', {
    navigator, URL: { createObjectURL: (blob) => { urls.push(blob); return 'blob:media'; } }
  });
  return { ...loaded, navigator, directory, files, writes, urls, opened: () => opened,
    fail: () => { failWrite = true; }, aborts: () => aborts };
}

test('Mobile: OPFS assíncrono salva Blob, carrega URL, lista e exclui ids', async () => {
  const mock = opfsMock();
  const media = new Blob(['video'], { type: 'video/mp4' });
  assert.equal(mock.opened(), 0);
  assert.equal(mock.service.isSupported(), true);
  assert.equal(await mock.service.saveMediaToOPFS('video-1', media), true);
  assert.equal(mock.writes[0], media);
  assert.equal(await mock.service.loadMediaFromOPFS('video-1'), 'blob:media');
  assert.equal(mock.urls[0], media);
  assert.deepEqual(plain(await mock.service.listMediaInOPFS()), ['video-1']);
  assert.equal(await mock.service.deleteMediaFromOPFS('video-1'), true);
  assert.equal(await mock.service.deleteMediaFromOPFS('video-1'), false);
  assert.equal(await mock.service.loadMediaFromOPFS('video-1'), null);
});

test('Mobile: OPFS rejeita caminhos, não usa sync handle e aborta gravações com falha', async () => {
  const mock = opfsMock();
  const blob = new Blob(['media']);
  for (const id of ['.', '..', '', ' ', '../evil', '/evil', 'folder/file', 'folder\\file', 'a\0b', null]) {
    assert.equal(await mock.service.opfs.save(id, blob), false);
    assert.equal(await mock.service.opfs.load(id), null);
    assert.equal(await mock.service.opfs.delete(id), false);
  }
  assert.equal(await mock.service.opfs.save('id', 'not a blob'), false);
  assert.equal(mock.opened(), 0);
  mock.fail();
  assert.equal(await mock.service.opfs.save('ok', blob), false);
  assert.equal(mock.aborts(), 1);
  let syncCalls = 0;
  mock.directory.getFileHandle = async () => ({
    createSyncAccessHandle: () => { syncCalls++; }
  });
  assert.equal(await mock.service.opfs.save('ok', blob), false);
  assert.equal(syncCalls, 0);
});

test('Mobile: compartilhamento preserva filename e MIME, aguarda callback e deleta só sucesso', async () => {
  const keys = ['broken', 'rejected', 'accepted', 'declined', 'badname', 'last'];
  const deleted = [];
  const delivered = [];
  const accepted = deferred();
  const cache = {
    keys: async () => keys,
    match: async (key) => {
      if (key === 'broken') throw new Error('failed');
      return new Response(new Blob([key], { type: 'video/mp4' }), {
        headers: { filename: key === 'badname' ? '%' : encodeURIComponent(`Vídeo ${key}.mp4`) }
      });
    },
    delete: async (key) => { deleted.push(key); return true; }
  };
  let opened = 0;
  const { service } = load('mobile-pwa.js', {
    caches: { open: async (name) => {
      assert.equal(name, 'shared-media');
      opened++;
      return cache;
    } }
  });
  assert.equal(opened, 0);
  const consuming = service.consumeSharedMedia(async (file) => {
    delivered.push(file);
    assert.equal(file.type, 'video/mp4');
    if (file.name.includes('rejected')) throw new Error('import failed');
    if (file.name.includes('accepted')) await accepted.promise;
    if (file.name.includes('declined')) return false;
  });
  await tick();
  assert.deepEqual(deleted, []);
  accepted.resolve();
  assert.equal(await consuming, 2);
  assert.deepEqual(deleted, ['accepted', 'last']);
  assert.deepEqual(delivered.map((file) => file.name),
    ['Vídeo rejected.mp4', 'Vídeo accepted.mp4', 'Vídeo declined.mp4', 'Vídeo last.mp4']);
});

test('Mobile: consumidores concorrentes não importam o mesmo compartilhamento duas vezes', async () => {
  const importing = deferred();
  const started = deferred();
  let callbacks = 0;
  let deletions = 0;
  const { service } = load('mobile-pwa.js', {
    caches: { open: async () => ({
      keys: async () => ['id'],
      match: async () => new Response(new Blob(['x'], { type: 'image/png' }), {
        headers: { 'X-Filename': encodeURIComponent('Foto.png') }
      }),
      delete: async () => { deletions++; return true; }
    }) }
  });
  const callback = async () => { callbacks++; started.resolve(); await importing.promise; };
  const first = service.consumeSharedMedia(callback);
  const second = service.consumeSharedMedia(callback);
  await started.promise;
  assert.equal(callbacks, 1);
  importing.resolve();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  assert.equal(deletions, 1);
});
