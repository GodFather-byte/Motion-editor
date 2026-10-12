'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const edit = require('../ai-edit.js');
const options = extra => ({ sourceDuration: 6, sourceFrom: 2, speed: 1, fps: 30, targetDuration: 6, zoom: true, captions: true, cutPauses: true, ...extra });
const plan = (segments, opts) => edit.normalizePlan({ title: 'Montagem', segments }, opts);

test('recusa cortes inválidos, sobrepostos e resposta sem cortes', () => {
  for (const segments of [[], [{ sourceStart: -1, sourceEnd: 2 }], [{ sourceStart: 0, sourceEnd: 8 }],
    [{ sourceStart: NaN, sourceEnd: 3 }], [{ sourceStart: 2, sourceEnd: 1 }],
    [{ sourceStart: 0, sourceEnd: 3 }, { sourceStart: 2, sourceEnd: 4 }]]) {
    assert.throws(() => plan(segments, options()));
  }
  assert.throws(() => plan([{ sourceStart: 0, sourceEnd: 3 }], options({ sourceDuration: 601 })));
});

test('reordenação preserva trim da fonte, velocidade e sincronismo das legendas', () => {
  const opts = options({ speed: 2, targetDuration: 2, cutPauses: false });
  const p = plan([{ sourceStart: 4, sourceEnd: 6, label: 'Final primeiro' }, { sourceStart: 0, sourceEnd: 2 }], opts);
  const result = edit.assemble(p, [{ start: 0, end: 1, text: 'Abertura' }, { start: 4.5, end: 5.5, text: 'Final' }], [], opts);
  assert.deepEqual(result.clips.map(c => [c.trimIn, c.start, c.end]), [[6, 0, 1], [2, 1, 2]]);
  assert.deepEqual(result.captions, [{ start: 0.25, end: 0.75, text: 'Final' }, { start: 1, end: 1.5, text: 'Abertura' }]);
});

test('cortar pausa fecha a timeline e remapeia legenda que atravessa o corte', () => {
  const opts = options({ sourceDuration: 4, targetDuration: 4 });
  const result = edit.assemble(plan([{ sourceStart: 0, sourceEnd: 4 }], opts), [{ start: 0.5, end: 3.5, text: 'Fala' }], [{ start: 1, end: 3 }], opts);
  assert.deepEqual(result.clips.map(c => [c.trimIn, c.start, c.end]), [[2, 0, 1], [5, 1, 2]]);
  assert.deepEqual(result.captions, [{ start: 0.5, end: 1.5, text: 'Fala' }]);
  assert.equal(result.duration, 2);
});

test('duração alvo limita o vídeo sem exceder a fonte nem aceitar opções desmarcadas', () => {
  const opts = options({ speed: 2, targetDuration: 1.5, zoom: false, captions: false, cutPauses: false });
  const p = plan([{ sourceStart: 0, sourceEnd: 6, zoom: 10, focalX: -10, asset: 'outro', code: 'alert(1)' }], opts);
  const result = edit.assemble(p, [{ start: 0, end: 1, text: 'Não mostrar' }], [{ start: 0, end: 5 }], opts);
  assert.equal(result.duration, 1.5); assert.equal(result.clips[0].sourceEnd, 3);
  assert.equal(result.clips[0].zoom, 1); assert.equal(result.clips[0].focalX, 0);
  assert.equal(result.clips[0].asset, undefined); assert.equal(result.clips[0].code, undefined);
  assert.deepEqual(result.captions, []);
});

test('detecção de som baixo respeita o trecho e mantém margens para as palavras', () => {
  const data = new Float32Array(6000).fill(0.2); data.fill(0, 2000, 4000);
  const gaps = edit.findSilences([data], 1000, 1, 5);
  assert.equal(gaps.length, 1);
  assert.ok(Math.abs(gaps[0].start - 1.12) < 0.021);
  assert.ok(Math.abs(gaps[0].end - 2.88) < 0.021);
  assert.deepEqual(edit.findSilences([new Float32Array(6000)], 1000, 0, 6), []);
});

test('legendas ignoram dados inválidos e usam tempos relativos de cada parte', () => {
  const raw = [{ start: 1, end: 2, text: 'Olá' }, { start: '3', end: 4, text: 'Inválido' }, { start: 5, end: 4, text: 'Inválido' }, { start: 0, end: 1, text: '' }];
  assert.deepEqual(edit.normalizeTranscript(raw, 60, 60), [{ start: 61, end: 62, text: 'Olá' }]);
  assert.deepEqual(edit.normalizeTranscript(raw, 60, 0, false), []);
});

test('fala curta entre longas pausas mantém palavras e remove silêncio das bordas', () => {
  const samples = new Float32Array(10000); samples.fill(0.2, 4500, 5000);
  const gaps = edit.findSilences([samples], 1000, 0, 10);
  assert.equal(gaps.length, 2);
  assert.equal(gaps[0].start, 0); assert.equal(gaps[1].end, 10);
  assert.ok(gaps[0].end < 4.5 && gaps[1].start > 5);
  const opts = options({ sourceDuration: 10, sourceFrom: 0, targetDuration: 10 });
  const assembly = edit.assemble(plan([{ sourceStart: 0, sourceEnd: 10 }], opts), [], gaps, opts);
  assert.equal(assembly.clips.length, 1); assert.ok(assembly.duration > 0.5 && assembly.duration < 1);
});
