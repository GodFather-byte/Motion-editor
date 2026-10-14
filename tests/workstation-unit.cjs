'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { encodeWav, voiceChain, wordsOf, alignWords } = require('../workstation.js');

test('WAV PCM estéreo mantém taxa, interleaving e clipping', async () => {
  const blob = encodeWav({
    numberOfChannels: 2, length: 3, sampleRate: 48000,
    getChannelData: channel => channel ? new Float32Array([1, 0, -2]) : new Float32Array([-1, .5, 2])
  });
  const data = Buffer.from(await blob.arrayBuffer());
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.readUInt16LE(22), 2);
  assert.equal(data.readUInt32LE(24), 48000);
  assert.equal(data.readUInt32LE(40), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => data.readInt16LE(44 + i * 2)), [-32768, 32767, 16384, 0, 32767, -32768]);
});
test('preset de voz conecta passa-altas, presença e compressor, ou bypass', () => {
  const nodes = [], node = fields => {
    const result = { connect(other) { this.next = other; } };
    for (const field of fields) result[field] = { value: 0 };
    nodes.push(result); return result;
  };
  const context = { createBiquadFilter: () => node(['frequency', 'Q', 'gain']),
    createDynamicsCompressor: () => node(['threshold', 'knee', 'ratio', 'attack', 'release']) };
  const source = node([]), destination = node([]);
  const chain = voiceChain(context, source, destination);
  assert.equal(chain[0].type, 'highpass'); assert.equal(chain[0].frequency.value, 80);
  assert.equal(chain[1].frequency.value, 3000); assert.equal(chain[1].gain.value, 4);
  assert.equal(chain[2].ratio.value, 12);
  assert.equal(source.next, chain[0]); assert.equal(chain[2].next, destination);
  const direct = node([]); assert.deepEqual(voiceChain(context, direct, destination, false), []); assert.equal(direct.next, destination);
});
test('alinhamento acompanha palavras reais, não avança por contagem fictícia', () => {
  const words = wordsOf('Olá, criação! Vamos gravar agora.');
  assert.equal(alignWords(words, 'olá criação'), 2);
  assert.equal(alignWords(words, 'palavras ausentes', 2), 2);
  assert.equal(alignWords(words, 'gravar agora', 2), 5);
});
test('roteiro usa LanguageModel estruturado, destrói sessão e rejeita respostas falsas', async () => {
  let destroyed = 0, response = '{"scenes":[{"audio":"Olá","video":"Plano aberto"}]}', prompt;
  const context = {
    AbortController, Blob, module: { exports: {} },
    LanguageModel: { availability: async () => 'available', create: async () => ({
      prompt: async (text, options) => { prompt = { text, options }; return response; },
      destroy: () => destroyed++
    }) }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../chrome-ai.js'), 'utf8'), context);
  const ai = context.module.exports;
  assert.equal((await ai.generateScript('Vídeo de café')).scenes[0].audio, 'Olá');
  assert.ok(prompt.options.responseConstraint); assert.match(prompt.text, /Vídeo de café/);
  response = '{"scenes":[{"audio":"","video":"v"}]}';
  assert.equal(await ai.generateScript('Pedido'), null); assert.match(ai.reason, /válido/);
  assert.equal(destroyed, 2);
  delete context.LanguageModel;
  assert.equal(await ai.generateScript('Pedido'), null); assert.match(ai.reason, /indisponível/);
});
