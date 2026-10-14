'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cutter = require('../silence-cutter.js');
const buffer = samples => ({ sampleRate: 1000, getChannelData: () => samples });
const clip = () => ({
  id: 'original', type: 'audio', start: 5, end: 8, kf: { x: [{ t: 6, v: 10 }] },
  s: { trimIn: 2, speed: 2, muted: false }
});

test('RMS, silêncio contínuo e padding particionam toda a fonte sem sobreposição', () => {
  const samples = new Float32Array(4000).fill(0.2);
  samples.fill(0, 1000, 3000);
  const result = cutter.detectSilenceIntervals(buffer(samples));
  assert.deepEqual(result.silenceIntervals, [{ start: 1.1, end: 2.9 }]);
  assert.deepEqual(result.speechIntervals, [{ start: 0, end: 1.1 }, { start: 2.9, end: 4 }]);
});

test('silêncio total, fala total, janelas parciais e pausas curtas', () => {
  assert.deepEqual(cutter.detectSilenceIntervals(buffer(new Float32Array(1000)), -40, 0.6, 0).speechIntervals, []);
  assert.deepEqual(cutter.detectSilenceIntervals(buffer(new Float32Array(1011).fill(0.2))).speechIntervals, [{ start: 0, end: 1.011 }]);
  assert.deepEqual(cutter.detectSilenceIntervals(buffer(new Float32Array(500))).silenceIntervals, []);
  assert.deepEqual(cutter.detectSilenceIntervals(buffer(new Float32Array(700)), -40, 0.6, 0.4).silenceIntervals, []);
});

test('ripple usa tempo de fonte, respeita trim/speed, mescla intervalos e copia profundamente', () => {
  const original = clip(), before = JSON.stringify(original);
  const parts = cutter.applyRippleDelete(original, [{ start: 6, end: 20 }, { start: 0, end: 3 }, { start: 2.5, end: 4 }]);
  assert.deepEqual(parts.map(p => [p.start, p.end, p.s.trimIn]), [[5, 6, 2], [6, 7, 6]]);
  assert.equal(parts[1].kf.x[0].t, 5);
  assert.equal(parts[0].s.muted, false);
  assert.notEqual(parts[0].id, parts[1].id);
  parts[0].kf.x[0].v = 80;
  assert.equal(JSON.stringify(original), before);
});

test('inversas injetadas preservam rampas e animação em tempo absoluto', () => {
  const original = clip();
  original.s.rampPts = [[5, 1], [8, 2]];
  assert.equal(cutter.applyRippleDelete(original, [{ start: 2, end: 3 }]), null);
  const parts = cutter.applyRippleDelete(original, [{ start: 4, end: 6 }], {
    srcTime: (_, t) => 2 + (t - 5) * 4,
    timeAtSrc: (_, t) => 5 + (t - 2) / 4
  });
  assert.deepEqual([parts[0].start, parts[0].end, parts[0].s.trimIn], [5, 5.5, 4]);
  assert.deepEqual(parts[0].s.rampPts, [[4.5, 1], [7.5, 2]]);
  assert.equal(parts[0].kf.x[0].t, 5.5);
});

test('integração registra uma alteração e permite excluir um clipe totalmente silencioso', () => {
  const project = { layers: [clip()] };
  let commits = 0;
  assert.equal(cutter.integrateIntoProject(project, 'ausente', [], { commit: () => commits++ }), null);
  assert.deepEqual(cutter.integrateIntoProject(project, 'original', [], { commit: () => commits++ }), []);
  assert.equal(commits, 1);
  assert.deepEqual(project.layers, []);
});

test('substituição preserva o pai animado dos filhos, mesmo quando toda mídia é removida', () => {
  for (const intervals of [[], [{ start: 2, end: 4 }]]) {
    const parent = clip(), child = { id: 'child', type: 'text', parent: parent.id };
    const project = { layers: [parent, child] };
    const parts = cutter.integrateIntoProject(project, parent.id, intervals);
    const anchor = project.layers.find(L => L.id === child.parent);
    assert.equal(anchor.type, 'group');
    assert.notEqual(anchor.id, parent.id);
    assert.deepEqual(anchor.kf, parent.kf);
    assert.equal(anchor.s.asset, undefined);
    assert.equal(project.layers.includes(child), true);
    assert.ok(parts.every(L => L.type === 'audio'));
  }
});
