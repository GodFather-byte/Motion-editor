(function (root) {
  'use strict';
  let serial = 0;

  /** Detecta pausas no canal 0 e retorna a partição da fonte em silêncio e fala. */
  function detectSilenceIntervals(audioBuffer, thresholdDb = -40, minSilenceDuration = 0.6, padding = 0.1) {
    const empty = { silenceIntervals: [], speechIntervals: [] };
    if (!audioBuffer?.getChannelData || !(audioBuffer.sampleRate > 0)) return empty;
    const samples = audioBuffer.getChannelData(0), rate = audioBuffer.sampleRate;
    const duration = samples.length / rate, windowSize = Math.max(1, Math.round(rate * 0.02));
    if (![thresholdDb, minSilenceDuration, padding].every(Number.isFinite) || minSilenceDuration < 0 || padding < 0) return empty;
    const silenceIntervals = [];
    let start = null;
    const finish = end => {
      if (start !== null && end - start >= minSilenceDuration && end - start > 2 * padding) {
        silenceIntervals.push({ start: start + padding, end: end - padding });
      }
      start = null;
    };
    for (let i = 0; i < samples.length; i += windowSize) {
      const end = Math.min(samples.length, i + windowSize);
      let sum = 0;
      for (let j = i; j < end; j++) sum += samples[j] * samples[j];
      const rms = Math.sqrt(sum / (end - i)), db = rms ? 20 * Math.log10(rms) : -100;
      if (db < thresholdDb) { if (start === null) start = i / rate; }
      else finish(i / rate);
    }
    finish(duration);
    const speechIntervals = [];
    let cursor = 0;
    for (const gap of silenceIntervals) {
      if (gap.start > cursor) speechIntervals.push({ start: cursor, end: gap.start });
      cursor = gap.end;
    }
    if (cursor < duration) speechIntervals.push({ start: cursor, end: duration });
    return { silenceIntervals, speechIntervals };
  }

  /** Cria sub-clipes contíguos; os intervalos são segundos absolutos do arquivo de origem. */
  function applyRippleDelete(clip, speechIntervals, opts = {}) {
    if (!clip || !['audio', 'video'].includes(clip.type) || !Array.isArray(speechIntervals)) return null;
    const speed = clip.s?.speed || 1, trim = clip.s?.trimIn || 0;
    if (!(speed > 0) || !Number.isFinite(speed)) return null;
    if (clip.s?.rampPts?.length && (!opts.srcTime || !opts.timeAtSrc)) return null;
    const toSource = t => opts.srcTime ? opts.srcTime(clip, t) : trim + (t - clip.start) * speed;
    const toTime = t => opts.timeAtSrc ? opts.timeAtSrc(clip, t) : clip.start + (t - trim) / speed;
    const from = toSource(clip.start), until = toSource(clip.end);
    const intervals = speechIntervals.filter(s => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start)
      .map(s => ({ start: Math.max(from, s.start), end: Math.min(until, s.end) }))
      .filter(s => s.end > s.start).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const interval of intervals) {
      const prev = merged[merged.length - 1];
      if (prev && interval.start <= prev.end) prev.end = Math.max(prev.end, interval.end);
      else merged.push({ ...interval });
    }
    let cursor = clip.start;
    return merged.map(interval => {
      const part = JSON.parse(JSON.stringify(clip));
      const originalStart = toTime(interval.start), originalEnd = toTime(interval.end), delta = cursor - originalStart;
      part.id = opts.uid ? opts.uid() : root.crypto?.randomUUID?.() || `silence-${Date.now()}-${++serial}`;
      part.start = cursor;
      part.end = cursor + originalEnd - originalStart;
      part.s.trimIn = interval.start;
      for (const keys of Object.values(part.kf || {})) for (const key of keys) key.t += delta;
      if (part.s.rampPts) part.s.rampPts = part.s.rampPts.map(([t, m]) => [t + delta, m]);
      part.s.transitionStart = (clip.s.transitionStart ?? clip.start) + delta;
      part.s.transitionEnd = (clip.s.transitionEnd ?? clip.end) + delta;
      cursor = part.end;
      return part;
    });
  }

  /** Substitui a camada em um projeto injetado e registra a alteração via opts.commit. */
  function integrateIntoProject(S, layerId, speechIntervals, opts = {}) {
    if (!Array.isArray(S?.layers)) return null;
    const index = S.layers.findIndex(layer => layer.id === layerId);
    if (index < 0) return null;
    const parts = applyRippleDelete(S.layers[index], speechIntervals, opts);
    if (!parts) return null;
    const original = S.layers[index], children = S.layers.filter(layer => layer.parent === layerId);
    const anchors = [];
    if (children.length) {
      const anchor = JSON.parse(JSON.stringify(original));
      anchor.id = opts.uid ? opts.uid() : root.crypto?.randomUUID?.() || `silence-parent-${Date.now()}-${++serial}`;
      anchor.type = 'group';
      anchor.name = `${original.name || 'Camada'} (vínculos)`;
      delete anchor.s.asset;
      for (const child of children) child.parent = anchor.id;
      anchors.push(anchor);
    }
    S.layers.splice(index, 1, ...parts, ...anchors);
    opts.commit?.();
    return parts;
  }

  const service = { detectSilenceIntervals, applyRippleDelete, integrateIntoProject };
  root.SmartSilenceCutter = service;
  if (typeof module !== 'undefined' && module.exports) module.exports = service;
})(typeof globalThis !== 'undefined' ? globalThis : this);
