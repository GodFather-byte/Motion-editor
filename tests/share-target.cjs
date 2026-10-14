'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');

test('Share Target mantém escopo do GitHub Pages, POST e nomes originais', async () => {
  const handlers = {}, stored = new Map();
  const scope = 'https://example.com/Motion-editor/';
  const context = {
    self: { registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    location: { origin: 'https://example.com' }, URL, Response, File, crypto,
    caches: { open: async name => {
      assert.equal(name, 'shared-media');
      return { put: async (key, response) => stored.set(key, response) };
    } }
  };
  vm.runInNewContext(code, context);
  const data = new FormData();
  data.append('media', new File(['video'], 'cena ação.mp4', { type: 'video/mp4' }));
  data.append('media', new File(['audio'], 'fala.wav', { type: 'audio/wav' }));
  data.append('media', new File(['html'], 'pagina.html', { type: 'text/html' }));
  let pending;
  handlers.fetch({ request: new Request(scope + 'share-target', { method: 'POST', body: data }),
    respondWith: promise => { pending = promise; } });
  const response = await pending;
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), scope + '#editor?shared=1');
  assert.equal(stored.size, 2);
  const [[key, first]] = stored;
  assert.ok(key.startsWith(scope + 'shared-'));
  assert.equal(decodeURIComponent(first.headers.get('X-Filename')), 'cena ação.mp4');
  assert.equal(await first.text(), 'video');
});

test('ativação preserva compartilhamentos ainda não consumidos', async () => {
  const handlers = {}, removed = [];
  vm.runInNewContext(code, {
    self: { addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } },
    caches: { keys: async () => ['motion-v29', 'motion-v30', code.match(/const VERSION = '([^']+)'/)[1], 'shared-media'],
      delete: async name => removed.push(name) }
  });
  let pending;
  handlers.activate({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(removed, ['motion-v29', 'motion-v30']);
});
