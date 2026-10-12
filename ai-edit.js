/* Planejamento de edição: somente dados e tempos, sem código ou URLs vindos da IA.
   Compartilhado pelo navegador e pelos testes Node, sem dependências. */
'use strict';
(function (root) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const text = (v, n, fallback = '') => typeof v === 'string' ? v.trim().slice(0, n) : fallback;

  function normalizeTranscript(raw, duration, offset = 0, enabled = true) {
    if (!enabled || !Array.isArray(raw)) return [];
    return raw.slice(0, 160).filter(s => s && finite(s.start) && finite(s.end) && s.end > s.start && text(s.text, 120))
      .map(s => ({ start: offset + clamp(s.start, 0, duration), end: offset + clamp(s.end, 0, duration), text: text(s.text, 120) }))
      .filter(s => s.end - s.start >= 0.08).sort((a, b) => a.start - b.start);
  }

  function normalizePlan(raw, options) {
    const { sourceDuration, speed, fps, targetDuration } = options;
    if (![sourceDuration, speed, fps, targetDuration].every(finite) || sourceDuration <= 0 || sourceDuration > 600 || speed < 0.25 || speed > 4 || fps < 1 || fps > 60 || targetDuration < 0.5 || targetDuration > 120) {
      throw new Error('Escolha um trecho de até 10 minutos e uma edição de até 120 segundos.');
    }
    if (!raw || !Array.isArray(raw.segments) || !raw.segments.length || raw.segments.length > 80) {
      throw new Error('A IA não devolveu uma lista válida de cortes. Tente explicar quais momentos deseja manter.');
    }
    const segments = raw.segments.map((s, i) => {
      if (!s || !finite(s.sourceStart) || !finite(s.sourceEnd) || s.sourceStart < 0 || s.sourceEnd > sourceDuration + 0.001 || s.sourceEnd - s.sourceStart < 2 * speed / fps) {
        throw new Error(`O corte ${i + 1} está fora do trecho ou é curto demais. Tente analisar novamente.`);
      }
      return {
        sourceStart: s.sourceStart, sourceEnd: Math.min(sourceDuration, s.sourceEnd),
        label: text(s.label, 60, `Trecho ${i + 1}`),
        zoom: options.zoom ? clamp(finite(s.zoom) ? s.zoom : 1, 1, 1.2) : 1,
        focalX: clamp(finite(s.focalX) ? s.focalX : 50, 0, 100),
        focalY: clamp(finite(s.focalY) ? s.focalY : 50, 0, 100),
      };
    });
    const sorted = [...segments].sort((a, b) => a.sourceStart - b.sourceStart);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].sourceStart < sorted[i - 1].sourceEnd - 0.001) {
      throw new Error('A IA repetiu trechos do vídeo. Peça uma montagem sem sobreposição de cortes.');
    }
    return { title: text(raw.title, 60, 'Edição com IA'), summary: text(raw.summary, 500), segments };
  }

  /* Energia em janelas de 20 ms. Margens preservam o começo e o fim das palavras.
     A referência relativa também funciona em gravações com volume baixo. */
  function findSilences(channels, sampleRate, from, to, { minSilence = 0.6, padding = 0.12 } = {}) {
    if (!channels.length || !finite(sampleRate) || sampleRate <= 0 || to <= from) return [];
    const step = Math.max(1, Math.round(sampleRate * 0.02));
    const start = Math.max(0, Math.floor(from * sampleRate)), end = Math.min(channels[0].length, Math.ceil(to * sampleRate));
    const energies = [];
    for (let i = start; i < end; i += step) {
      const stop = Math.min(end, i + step); let sum = 0;
      for (const ch of channels) for (let j = i; j < stop; j++) sum += ch[j] * ch[j];
      energies.push({ start: i / sampleRate, end: stop / sampleRate, rms: Math.sqrt(sum / ((stop - i) * channels.length)) });
    }
    if (!energies.length) return [];
    const levels = energies.map(e => e.rms).sort((a, b) => a - b);
    const peak = levels[levels.length - 1];
    // Fala curta cercada de silêncio continua sendo útil. A referência usa as
    // janelas com energia, em vez de confundir 90% de silêncio com arquivo vazio.
    const active = levels.filter(v => v > Math.max(0.00001, peak * 0.01));
    if (!active.length) return [];
    const reference = active[Math.floor((active.length - 1) * 0.9)];
    const threshold = Math.max(0.00001, reference * 0.06), gaps = [];
    let gapStart = null;
    const finish = endTime => {
      if (gapStart != null && endTime - gapStart >= minSilence) {
        const a = gapStart <= from + 0.02 ? gapStart : gapStart + padding;
        const b = endTime >= to - 0.02 ? endTime : endTime - padding;
        if (b > a) gaps.push({ start: a - from, end: b - from });
      }
      gapStart = null;
    };
    for (const e of energies) {
      if (e.rms < threshold) { if (gapStart == null) gapStart = e.start; }
      else finish(e.start);
    }
    finish(energies[energies.length - 1].end);
    return gaps;
  }

  function subtractGaps(start, end, gaps) {
    const out = []; let cursor = start;
    for (const gap of gaps) {
      if (!gap || !finite(gap.start) || !finite(gap.end) || gap.end <= cursor || gap.start >= end) continue;
      if (gap.start > cursor) out.push([cursor, Math.min(gap.start, end)]);
      cursor = Math.max(cursor, gap.end);
      if (cursor >= end) break;
    }
    if (cursor < end) out.push([cursor, end]);
    return out;
  }

  function assemble(plan, transcript, gaps, options) {
    const { speed, fps, sourceFrom, targetDuration } = options;
    if (!finite(sourceFrom) || sourceFrom < 0) throw new Error('O início do trecho é inválido.');
    const cuts = options.cutPauses ? [...gaps].sort((a, b) => a.start - b.start) : [];
    const clips = []; let cursor = 0;
    const target = Math.floor(targetDuration * fps + 1e-6) / fps;
    for (const segment of plan.segments) {
      for (const [start, end] of subtractGaps(segment.sourceStart, segment.sourceEnd, cuts)) {
        const available = Math.min((end - start) / speed, target - cursor);
        const frames = Math.floor(available * fps + 1e-6);
        if (frames < 2) continue;
        const duration = frames / fps;
        clips.push({ ...segment, sourceStart: start, sourceEnd: start + duration * speed,
          trimIn: sourceFrom + start, start: cursor, end: cursor + duration });
        cursor += duration;
        if (clips.length > 180) throw new Error('A montagem tem cortes demais. Escolha um trecho menor.');
      }
      if (cursor >= target - 1 / fps) break;
    }
    if (!clips.length) throw new Error('Não sobraram trechos para editar. Desmarque o corte de pausas ou escolha outro trecho.');
    const captions = [];
    if (options.captions) {
      const speech = [...transcript].filter(s => s && finite(s.start) && finite(s.end) && s.end > s.start && text(s.text, 120)).sort((a, b) => a.start - b.start);
      let previousEnd = 0, previousSpeech = null, previousSourceEnd = -Infinity;
      for (const clip of clips) for (const s of speech) {
        const from = Math.max(clip.sourceStart, s.start), to = Math.min(clip.sourceEnd, s.end);
        if (to <= from) continue;
        const start = Math.max(previousEnd, clip.start + (from - clip.sourceStart) / speed);
        const end = Math.min(clip.end, clip.start + (to - clip.sourceStart) / speed);
        if (end - start < 0.08) continue;
        const last = captions[captions.length - 1];
        if (last && previousSpeech === s && from >= previousSourceEnd && Math.abs(last.end - start) < 0.001) last.end = end;
        else captions.push({ start, end, text: text(s.text, 120) });
        previousEnd = end; previousSpeech = s; previousSourceEnd = to;
        if (captions.length > 800) throw new Error('Há legendas demais. Escolha um trecho menor.');
      }
    }
    return { title: plan.title, summary: plan.summary, clips, captions, duration: cursor,
      trimmedDuration: Math.max(0, plan.segments.reduce((n, s) => n + (s.sourceEnd - s.sourceStart) / speed, 0) - cursor) };
  }

  const api = Object.freeze({ normalizeTranscript, normalizePlan, findSilences, assemble });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MotionAIEdit = api;
})(typeof window !== 'undefined' ? window : globalThis);
