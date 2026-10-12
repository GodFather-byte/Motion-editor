/* Motion Editor — editor de motion graphics no navegador.
   Sem dependências: canvas 2D para render, Web Audio para som, MediaRecorder para exportar. */
'use strict';
(() => {

/* ======================= utilidades ======================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const wait = ms => new Promise(r => setTimeout(r, ms));
const isTyping = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const hexA = (hex, a) => {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0;
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
};
const blobToDataURL = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

const FONTS = ['Montserrat', 'Bebas Neue', 'Anton', 'Unbounded', 'Playfair Display', 'Pacifico', 'Permanent Marker', 'Figtree', 'JetBrains Mono'];
const ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };

const EASES = {
  linear: t => t,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: t => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  bounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  hold: () => 0,
};
const EASE_LABELS = {
  linear: 'Linear', easeIn: 'Acelerar', easeOut: 'Desacelerar', easeInOut: 'Suave',
  back: 'Ultrapassar e voltar', elastic: 'Elástico', bounce: 'Quicar', hold: 'Segurar (corte seco)',
  custom: 'Personalizada (curva)',
};
/* curvas de Bézier: as eases nomeadas viram pontos de partida para o editor de curva */
const BEZ_OF = { linear: [0, 0, 1, 1], easeIn: [0.55, 0.055, 0.675, 0.19], easeOut: [0.215, 0.61, 0.355, 1], easeInOut: [0.645, 0.045, 0.355, 1], back: [0.34, 1.56, 0.64, 1] };
const bezCache = new Map();
function bezier(bz) {
  const key = bz.join(',');
  if (bezCache.has(key)) return bezCache.get(key);
  const [x1, y1, x2, y2] = bz;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dsx = t => (3 * ax * t + 2 * bx) * t + cx;
  const fn = x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-5) return sy(t); const d = dsx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
  bezCache.set(key, fn);
  return fn;
}
const easeFn = k => (k.e === 'custom' && k.bz ? bezier(k.bz) : EASES[k.e] || EASES.linear);
const rand = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const PROPS = {
  x: { label: 'Posição X', step: 1, def: 0 },
  y: { label: 'Posição Y', step: 1, def: 0 },
  scale: { label: 'Escala %', min: 0, max: 400, step: 1, def: 100 },
  rotation: { label: 'Rotação °', min: -720, max: 720, step: 1, def: 0 },
  opacity: { label: 'Opacidade %', min: 0, max: 100, step: 1, def: 100 },
  blur: { label: 'Desfoque', min: 0, max: 80, step: 0.5, def: 0 },
  glow: { label: 'Brilho externo', min: 0, max: 150, step: 1, def: 0 },
  brightness: { label: 'Luminosidade %', min: 0, max: 300, step: 1, def: 100 },
  contrast: { label: 'Contraste %', min: 0, max: 300, step: 1, def: 100 },
  saturate: { label: 'Saturação %', min: 0, max: 300, step: 1, def: 100 },
  hue: { label: 'Matiz °', min: -180, max: 180, step: 1, def: 0 },
  trim: { label: 'Desenhado %', min: 0, max: 100, step: 1, def: 100 },
};
const TRANSFORM = ['x', 'y', 'scale', 'rotation', 'opacity'];
const COLOR_PROPS = ['brightness', 'contrast', 'saturate', 'hue'];
const COLOR_LOOKS = {
  none: { label: 'Original' },
  cinema: { label: 'Cinema', contrast: 118, saturate: 85, sepia: 12 },
  vivid: { label: 'Vibrante', contrast: 110, saturate: 140 },
  warm: { label: 'Quente', sepia: 35, saturate: 115 },
  cool: { label: 'Frio', sepia: 25, hue: 170, saturate: 85 },
  vintage: { label: 'Vintage', brightness: 110, contrast: 88, saturate: 75, sepia: 45 },
  mono: { label: 'Preto e branco', saturate: 0, contrast: 115 },
};
const TRANSITIONS = { none: 'Nenhuma', fade: 'Dissolver', zoom: 'Zoom suave', wipe: 'Cortina lateral' };
const MEDIA_FITS = { stretch: 'Livre (esticar)', contain: 'Mostrar inteiro', cover: 'Preencher e recortar' };
const TEXT_ANIMS = {
  none: 'Nenhuma', typewriter: 'Máquina de escrever', rise: 'Subir letra por letra',
  pop: 'Estourar letras', fade: 'Aparecer letra por letra', words: 'Palavra por palavra',
  scramble: 'Embaralhar e revelar', wave: 'Onda (contínua)', bounce: 'Letras pulando (contínuo)',
  glitch: 'Glitch (contínuo)', neon: 'Neon piscando',
};
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=?';
const BLENDS = {
  'source-over': 'Normal', screen: 'Tela (clarear)', multiply: 'Multiplicar', overlay: 'Sobrepor',
  lighter: 'Somar luz', 'soft-light': 'Luz suave', difference: 'Diferença', 'color-dodge': 'Subexposição de cor',
};
const TYPE_NAMES = { text: 'Texto', rect: 'Retângulo', ellipse: 'Círculo', star: 'Estrela', path: 'Traço', image: 'Imagem', video: 'Vídeo', audio: 'Áudio', group: 'Grupo' };
const VISUAL = t => t !== 'audio';
const MEDIA = t => t === 'video' || t === 'audio';
const STORE_KEY = 'motion-editor:v1';
const TL_PAD = 12;
const PEAKS_PER_SEC = 40;

/* ======================= estado ======================= */
const S = {
  project: null,
  time: 0,
  playing: false,
  sel: null,
  selKf: null,
  pps: 120,
  undo: [], redo: [],
  exporting: false,
  bounds: new Map(),   // id da camada -> {w,h}
  view: 1,
};
const A = new Map();    // arquivos carregados: id -> {kind, blob, url, el, buffer, peaks, duration, w, h}
const VIDS = new Map(); // id da camada -> <video> próprio

const app = $('#app');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
const P = () => S.project;
const byId = id => P().layers.find(l => l.id === id) || null;
const selLayer = () => (S.sel ? byId(S.sel) : null);
const snap = t => Math.round(t * P().fps) / P().fps;

/* ======================= arquivos (IndexedDB) ======================= */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('motion-editor', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('assets');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('assets', mode);
      const req = fn(t.objectStore('assets'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (id, v) => run('readwrite', s => s.put(v, id)),
    get: id => run('readonly', s => s.get(id)),
    del: id => run('readwrite', s => s.delete(id)),
    keys: () => run('readonly', s => s.getAllKeys()),
  };
})();

let AC = null;
const audioCtx = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());

function computePeaks(buffer) {
  const data = buffer.getChannelData(0);
  const n = Math.max(1, Math.ceil(buffer.duration * PEAKS_PER_SEC));
  const per = Math.floor(data.length / n) || 1;
  const step = Math.max(1, Math.floor(per / 64));
  const peaks = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * per, e = Math.min(data.length, j + per); j < e; j += step) { const v = Math.abs(data[j]); if (v > m) m = v; }
    peaks[i] = m;
  }
  return peaks;
}

async function decodeAudio(blob) {
  try {
    const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
    return buf;
  } catch { return null; }
}

async function loadAsset(id, blob, kind) {
  if (A.has(id)) return A.get(id);
  const rec = { id, kind, blob, url: URL.createObjectURL(blob) };
  A.set(id, rec);
  if (kind === 'image') {
    const img = new Image();
    img.src = rec.url;
    await img.decode().catch(() => new Promise(r => { img.onload = img.onerror = r; }));
    rec.el = img; rec.w = img.naturalWidth; rec.h = img.naturalHeight;
  } else if (kind === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = rec.url;
    await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; });
    rec.w = v.videoWidth || 1280; rec.h = v.videoHeight || 720; rec.duration = isFinite(v.duration) ? v.duration : 0;
    rec.buffer = await decodeAudio(blob);
    if (rec.buffer) rec.peaks = computePeaks(rec.buffer);
  } else if (kind === 'audio') {
    rec.buffer = await decodeAudio(blob);
    rec.duration = rec.buffer ? rec.buffer.duration : 0;
    if (rec.buffer) rec.peaks = computePeaks(rec.buffer);
  }
  return rec;
}

async function registerAsset(blob, kind, name) {
  const id = uid();
  P().assets[id] = { kind, name, mime: blob.type };
  try { await idb.put(id, { blob, kind, name, mime: blob.type }); } catch { /* sem IndexedDB: fica só na memória */ }
  return loadAsset(id, blob, kind);
}

async function loadAllAssets() {
  const assets = P().assets || {};
  for (const [id, meta] of Object.entries(assets)) {
    if (A.has(id)) continue;
    try {
      if (typeof meta === 'string') {           // formato antigo: imagem embutida
        const blob = await (await fetch(meta)).blob();
        assets[id] = { kind: 'image', name: 'imagem', mime: blob.type };
        idb.put(id, { blob, kind: 'image' }).catch(() => {});
        await loadAsset(id, blob, 'image');
      } else if (meta.data) {                    // vindo de um arquivo .motion.json
        const blob = await (await fetch(meta.data)).blob();
        delete meta.data;
        idb.put(id, { blob, kind: meta.kind, name: meta.name, mime: meta.mime }).catch(() => {});
        await loadAsset(id, blob, meta.kind);
      } else {
        const rec = await idb.get(id);
        if (rec && rec.blob) await loadAsset(id, rec.blob, meta.kind || rec.kind);
      }
    } catch { /* arquivo perdido: a camada mostra um aviso */ }
  }
  renderMain(); drawOverlay(); renderTimeline();
}

async function cleanupAssets() {
  try {
    const used = new Set(Object.keys(P().assets || {}));
    for (const k of await idb.keys()) if (!used.has(k)) await idb.del(k);
  } catch { /* ignora */ }
  for (const [id, rec] of A) if (!P().assets[id]) { URL.revokeObjectURL(rec.url); A.delete(id); }
}

function videoFor(L) {
  const rec = A.get(L.s.asset);
  if (!rec) return null;
  let v = VIDS.get(L.id);
  if (!v || v.dataset.asset !== L.s.asset) {
    if (v) v.pause();
    v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.dataset.asset = L.s.asset;
    v.src = rec.url;
    v.addEventListener('seeked', () => { if (!S.playing && !S.exporting) { renderMain(); drawOverlay(); } });
    v.addEventListener('loadeddata', () => { if (!S.playing) renderMain(); });
    VIDS.set(L.id, v);
  }
  return v;
}

/* mantém os vídeos no tempo certo (preview e exportação) */
function syncMedia() {
  const running = S.playing || S.exporting;
  for (const L of P().layers) {
    if (L.type !== 'video') continue;
    const v = videoFor(L);
    if (!v) continue;
    const rec = A.get(L.s.asset);
    const sp = L.s.speed || 1;
    const local = (S.time - L.start) * sp + (L.s.trimIn || 0);
    const active = L.visible && S.time >= L.start && (S.time < L.end || S.time === P().duration && L.end === P().duration) && local <= (rec.duration || Infinity);
    if (!active) { if (!v.paused) v.pause(); continue; }
    if (Math.abs(v.playbackRate - sp) > 1e-4) { try { v.playbackRate = sp; } catch {} }
    if (running) {
      if (v.paused) { try { v.currentTime = local; } catch {} v.play().catch(() => {}); }
      else if (Math.abs(v.currentTime - local) > 0.25) v.currentTime = local;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - local) > 0.5 / P().fps) { try { v.currentTime = local; } catch {} }
    }
  }
  for (const [id, v] of VIDS) if (!byId(id)) { v.pause(); VIDS.delete(id); }
}
const pauseAllVideos = () => VIDS.forEach(v => v.pause());

/* agenda o som de todas as camadas a partir de "from" */
function scheduleAudio(ac, dest, from, lead = 0.03) {
  const out = [];
  for (const L of P().layers) {
    if (!MEDIA(L.type) || !L.visible || L.s.muted || L.end <= from) continue;
    const rec = A.get(L.s.asset);
    if (!rec || !rec.buffer) continue;
    const vol = (L.s.volume ?? 100) / 100;
    if (vol <= 0) continue;
    const sp = L.s.speed || 1;
    const len = L.end - L.start;
    const into = Math.max(0, from - L.start);
    const offset = (L.s.trimIn || 0) + into * sp;
    if (offset >= rec.buffer.duration) continue;
    const when = ac.currentTime + Math.max(0, L.start - from) + lead;
    const src = ac.createBufferSource();
    src.buffer = rec.buffer;
    if (src.playbackRate) { try { src.playbackRate.setValueAtTime(sp, when); } catch {} }
    const g = ac.createGain();
    src.connect(g); g.connect(dest);
    const rem = (rec.buffer.duration - offset) / sp;
    const duration = Math.min(len - into, rem);
    if (duration <= 0) continue;
    let fi = Math.max(0, L.s.fadeIn || 0), fo = Math.max(0, L.s.fadeOut || 0);
    // Fades longos dividem o clipe proporcionalmente, sem eventos no passado.
    const fadeScale = Math.min(1, len / (fi + fo || 1));
    fi *= fadeScale; fo *= fadeScale;
    const env = x => vol * Math.max(0, Math.min(1, fi > 0 ? x / fi : 1, fo > 0 ? (len - x) / fo : 1));
    g.gain.setValueAtTime(env(into), when);
    if (fi > 0 && into < fi) {
      const end = Math.min(fi, into + duration);
      g.gain.linearRampToValueAtTime(env(end), when + end - into);
    }
    if (fo > 0) {
      const foStart = Math.max(into, len - fo);
      if (foStart < into + duration) {
        g.gain.setValueAtTime(env(foStart), when + (foStart - into));
        const end = into + duration;
        g.gain.linearRampToValueAtTime(env(end), when + duration);
      }
    }
    // start() usa segundos da fonte; stop() usa segundos de reprodução.
    src.start(when, offset, duration * sp);
    src.stop(when + duration);
    out.push(src);
  }
  return out;
}
let liveAudio = [];
const stopAudio = () => { liveAudio.forEach(s => { try { s.stop(); } catch {} }); liveAudio = []; };

/* ======================= modelo ======================= */
function newProject(aspect = '9:16') {
  const [w, h] = ASPECTS[aspect];
  return { v: 2, name: 'Projeto sem título', aspect, width: w, height: h, fps: 30, duration: 5, background: '#14122a', layers: [], assets: {} };
}

function defaultS(type) {
  const p = P(), m = Math.min(p.width, p.height);
  const look = { blend: 'source-over', clip: false, shadowX: 0, shadowY: 0, shadowBlur: 0, shadowColor: '#000000', shadowOpacity: 60, fillType: 'solid', gradAngle: 90, flipH: false, flipV: false, colorLook: 'none', lookIntensity: 100, transitionIn: 'none', transitionOut: 'none', transitionInDuration: 0.5, transitionOutDuration: 0.5 };
  const framing = { mediaFit: 'stretch', focalX: 50, focalY: 50 };
  const media = { asset: null, trimIn: 0, volume: 100, fadeIn: 0, fadeOut: 0, speed: 1, muted: false };
  switch (type) {
    case 'text': return { ...look, text: 'Seu texto', font: 'Montserrat', size: Math.round(m * 0.11), weight: 900, color: '#ffffff', fill2: '#ffb547', align: 'center', stroke: 0, strokeColor: '#000000', glowColor: '#ffb547', anim: 'none' };
    case 'rect': return { ...look, w: Math.round(m * 0.4), h: Math.round(m * 0.4), radius: 28, fill: '#ff8f6b', fill2: '#b89cff', glowColor: '#ff8f6b' };
    case 'ellipse': return { ...look, w: Math.round(m * 0.36), h: Math.round(m * 0.36), fill: '#b89cff', fill2: '#6fd8ff', glowColor: '#b89cff' };
    case 'star': return { ...look, w: Math.round(m * 0.4), points: 5, inner: 0.45, fill: '#ffb547', fill2: '#ff6b4a', glowColor: '#ffb547' };
    case 'path': return { ...look, points: [], stroke: '#ffb547', width: Math.max(4, Math.round(m * 0.012)), fillOn: false, fill: '#ffb547', fill2: '#ff6b4a', glowColor: '#ffb547' };
    case 'image': return { ...look, ...framing, asset: null, w: 400, h: 400, glowColor: '#ffffff' };
    case 'video': return { ...look, ...framing, ...media, w: 800, h: 450, glowColor: '#ffffff' };
    case 'audio': return { ...media };
    case 'group': return { blend: 'source-over', clip: false };
  }
  return {};
}
const defaultP = () => Object.fromEntries(Object.entries(PROPS).map(([k, d]) => [k, d.def]));

function makeLayer(type, extra = {}) {
  const p = P();
  const count = p.layers.filter(l => l.type === type).length + 1;
  const L = {
    id: uid(), type, name: `${TYPE_NAMES[type]} ${count}`,
    start: 0, end: p.duration, visible: true, parent: null,
    p: { ...defaultP(), x: p.width / 2, y: p.height / 2 },
    kf: {}, s: defaultS(type),
  };
  Object.assign(L.s, extra.s || {});
  Object.assign(L.p, extra.p || {});
  for (const k of ['name', 'start', 'end', 'kf', 'parent']) if (extra[k] != null) L[k] = extra[k];
  return L;
}

/* completa campos que projetos antigos não tinham */
function normalize(p) {
  p.assets = p.assets || {};
  S.project = p;
  for (const L of p.layers) {
    L.p = { ...defaultP(), ...L.p };
    L.s = { ...defaultS(L.type), ...L.s };
    if (MEDIA(L.type)) {
      L.s.speed = Number(L.s.speed) || 1;
      if (L.s.muted == null) L.s.muted = false;
    }
    if (L.s.flipH == null) L.s.flipH = false;
    if (L.s.flipV == null) L.s.flipV = false;
    L.kf = L.kf || {};
    if (L.parent === undefined) L.parent = null;
  }
  return p;
}

function val(L, prop, t = S.time) {
  const k = L.kf[prop];
  if (!k || !k.length) return L.p[prop];
  if (t <= k[0].t) return k[0].v;
  const last = k[k.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * easeFn(a)(u);
    }
  }
  return last.v;
}
const kfIndex = (L, prop, t = S.time) => (L.kf[prop] || []).findIndex(k => Math.abs(k.t - t) < 0.5 / P().fps);
const isAnimated = (L, prop) => !!(L.kf[prop] && L.kf[prop].length);
const kfTimes = L => [...new Set(Object.values(L.kf).flat().map(k => round(k.t, 4)))].sort((a, b) => a - b);

function upsertKf(L, prop, t, v, e) {
  t = clamp(snap(t), 0, P().duration);
  const arr = L.kf[prop] || (L.kf[prop] = []);
  const i = arr.findIndex(k => Math.abs(k.t - t) < 0.5 / P().fps);
  if (i >= 0) { arr[i].v = v; if (e) arr[i].e = e; }
  else { arr.push({ t, v, e: e || 'easeInOut' }); arr.sort((a, b) => a.t - b.t); }
}
function setProp(L, prop, v) {
  const d = PROPS[prop];
  if (d.min != null) v = clamp(v, d.min, d.max);
  if (isAnimated(L, prop)) upsertKf(L, prop, S.time, v);
  else L.p[prop] = v;
}
function toggleKf(L, prop) {
  const i = kfIndex(L, prop);
  if (i >= 0) {
    const removed = L.kf[prop].splice(i, 1)[0];
    if (!L.kf[prop].length) { delete L.kf[prop]; L.p[prop] = removed.v; }
  } else upsertKf(L, prop, S.time, val(L, prop));
}
function moveKeyframes(L, from, to) {
  if (Math.abs(from - to) < 1e-6) return;
  for (const prop of Object.keys(L.kf)) {
    const arr = L.kf[prop];
    const k = arr.find(k => Math.abs(k.t - from) < 0.5 / P().fps);
    if (!k) continue;
    const clash = arr.findIndex(o => o !== k && Math.abs(o.t - to) < 0.5 / P().fps);
    if (clash >= 0) arr.splice(clash, 1);
    k.t = to;
    arr.sort((a, b) => a.t - b.t);
  }
}
function deleteKeyframesAt(L, t) {
  for (const prop of Object.keys(L.kf)) {
    const arr = L.kf[prop];
    const i = arr.findIndex(k => Math.abs(k.t - t) < 0.5 / P().fps);
    if (i < 0) continue;
    const removed = arr.splice(i, 1)[0];
    if (!arr.length) { delete L.kf[prop]; L.p[prop] = removed.v; }
  }
}

/* transformações encadeadas (camada que segue outra) */
function transitionState(L, t) {
  const s = L.s;
  // Uma divisão mantém as bordas originais para não repetir a transição no corte.
  const start = s.transitionStart ?? L.start, end = s.transitionEnd ?? L.end;
  const len = Math.max(0, end - start);
  let di = s.transitionIn !== 'none' ? clamp(+s.transitionInDuration || 0, 0, 10) : 0;
  let dout = s.transitionOut !== 'none' ? clamp(+s.transitionOutDuration || 0, 0, 10) : 0;
  const k = Math.min(1, len / (di + dout || 1));
  di *= k; dout *= k;
  const enter = di > 0 ? EASES.easeInOut(clamp((t - start) / di, 0, 1)) : 1;
  const exit = dout > 0 ? EASES.easeInOut(clamp((end - t) / dout, 0, 1)) : 1;
  const fades = type => type === 'fade' || type === 'zoom';
  return {
    alpha: (fades(s.transitionIn) ? enter : 1) * (fades(s.transitionOut) ? exit : 1),
    zoom: (s.transitionIn === 'zoom' ? 0.85 + 0.15 * enter : 1) * (s.transitionOut === 'zoom' ? 0.85 + 0.15 * exit : 1),
    left: s.transitionOut === 'wipe' ? 1 - exit : 0,
    right: s.transitionIn === 'wipe' ? enter : 1,
  };
}
const localMatrix = (L, t) => { const sc = val(L, 'scale', t) / 100 * transitionState(L, t).zoom; return new DOMMatrix().translate(val(L, 'x', t), val(L, 'y', t)).rotate(val(L, 'rotation', t)).scale(sc, sc); };
function parentMatrix(L, t, depth = 0) {
  const par = L.parent && byId(L.parent);
  return par && depth < 16 ? worldMatrix(par, t, depth + 1) : new DOMMatrix();
}
function worldMatrix(L, t, depth = 0) { return parentMatrix(L, t, depth).multiply(localMatrix(L, t)); }
function worldOpacity(L, t) {
  let op = clamp(val(L, 'opacity', t), 0, 100) / 100 * transitionState(L, t).alpha, cur = L, n = 0;
  while (cur.parent && n++ < 16) { cur = byId(cur.parent); if (!cur) break; op *= clamp(val(cur, 'opacity', t), 0, 100) / 100 * transitionState(cur, t).alpha; }
  return op;
}
const mScale = m => Math.hypot(m.a, m.b);
const mRot = m => Math.atan2(m.b, m.a) * 180 / Math.PI;
const descendants = L => { const out = new Set([L.id]); let grew = true; while (grew) { grew = false; for (const l of P().layers) if (l.parent && out.has(l.parent) && !out.has(l.id)) { out.add(l.id); grew = true; } } return out; };

/* troca o "pai" mantendo a camada no mesmo lugar da tela */
function setParent(L, parentId) {
  const t = S.time;
  const w = worldMatrix(L, t);
  const pos = w.transformPoint(new DOMPoint(0, 0));
  const rot = mRot(w), sc = mScale(w) * 100;
  L.parent = parentId || null;
  const pm = parentMatrix(L, t);
  const local = pm.inverse().transformPoint(pos);
  const target = { x: local.x, y: local.y, rotation: rot - mRot(pm), scale: sc / (mScale(pm) || 1) / transitionState(L, t).zoom };
  for (const prop of ['x', 'y', 'rotation']) {
    const d = target[prop] - val(L, prop, t);
    L.p[prop] += d; (L.kf[prop] || []).forEach(k => (k.v += d));
  }
  const f = target.scale / (val(L, 'scale', t) || 1);
  L.p.scale *= f; (L.kf.scale || []).forEach(k => (k.v *= f));
}

/* ======================= render ======================= */
function starPath(c, r, points, inner) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
}

function paint(c, s, w, h, base) {
  if (s.fillType === 'linear') {
    const a = (s.gradAngle || 0) * Math.PI / 180;
    const r = Math.abs(w / 2 * Math.cos(a)) + Math.abs(h / 2 * Math.sin(a));
    const g = c.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
    g.addColorStop(0, base); g.addColorStop(1, s.fill2);
    return g;
  }
  if (s.fillType === 'radial') {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, base); g.addColorStop(1, s.fill2);
    return g;
  }
  return base;
}

function drawText(c, L, local) {
  const s = L.s;
  c.font = `${s.weight} ${s.size}px "${s.font}", sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const lines = String(s.text || ' ').split('\n');
  const lh = s.size * 1.15;
  const widths = lines.map(l => c.measureText(l).width);
  const bw = Math.max(s.size * 0.5, ...widths), bh = lh * lines.length;
  c.fillStyle = paint(c, s, bw, bh, s.color);
  const str = (t, x, y) => {
    if (s.stroke > 0) { c.lineWidth = s.stroke * 2; c.lineJoin = 'round'; c.strokeStyle = s.strokeColor; c.strokeText(t, x, y); }
    c.fillText(t, x, y);
  };
  const wordOf = [];
  let wc = -1;
  for (const line of lines) { let prev = ' '; for (const ch of [...line]) { if (ch !== ' ' && prev === ' ') wc++; wordOf.push(Math.max(0, wc)); prev = ch; } }
  let ci = 0;
  lines.forEach((line, li) => {
    const ly = -bh / 2 + lh * li + lh / 2;
    const lw = widths[li];
    const x0 = s.align === 'left' ? -bw / 2 : s.align === 'right' ? bw / 2 - lw : -lw / 2;
    const chars = [...line];
    if (s.anim === 'none' || !s.anim) { str(line, x0, ly); ci += chars.length; return; }
    let acc = '';
    for (const ch of chars) {
      const cx = x0 + c.measureText(acc).width;
      const cw = c.measureText(ch).width;
      acc += ch;
      const i = ci++;
      let a = 1, dy = 0, dx = 0, sc = 1, glyph = ch, chroma = false;
      if (s.anim === 'typewriter') { if (local < i * 0.06) continue; }
      else if (s.anim === 'rise') { const u = clamp((local - i * 0.035) / 0.45, 0, 1); const e = EASES.easeOut(u); a = e; dy = (1 - e) * s.size * 0.6; }
      else if (s.anim === 'pop') { const u = clamp((local - i * 0.05) / 0.4, 0, 1); sc = EASES.back(u); a = u > 0 ? 1 : 0; }
      else if (s.anim === 'fade') { a = clamp((local - i * 0.05) / 0.3, 0, 1); }
      else if (s.anim === 'wave') { dy = Math.sin(local * 5 - i * 0.55) * s.size * 0.14; }
      else if (s.anim === 'words') { const u = clamp((local - wordOf[i] * 0.18) / 0.4, 0, 1); const e = EASES.easeOut(u); a = e; dy = (1 - e) * s.size * 0.5; sc = 0.9 + 0.1 * e; }
      else if (s.anim === 'scramble') {
        const done = i * 0.035 + 0.35;
        if (local < i * 0.035) a = 0;
        else if (local < done && ch.trim()) glyph = GLYPHS[Math.floor(rand(i * 3.7 + Math.floor(local * 20)) * GLYPHS.length)];
      }
      else if (s.anim === 'bounce') { dy = -Math.max(0, Math.sin(local * 6 - i * 0.45)) * s.size * 0.22; }
      else if (s.anim === 'glitch') {
        const f = Math.floor(local * 14);
        if (rand(i * 7.1 + f) < 0.22) { dx = (rand(i + f * 3.3) - 0.5) * s.size * 0.35; chroma = true; }
        if (rand(f * 1.7) < 0.08) { chroma = true; dy = (rand(f + i) - 0.5) * s.size * 0.15; }
      }
      else if (s.anim === 'neon') {
        const f = local < 1.2 ? Math.floor(local * 18) : Math.floor(local * 6);
        const off = local < 1.2 ? rand(f * 13 + (i % 3)) < 0.45 : rand(f * 5.3) < 0.06;
        a = off ? 0.18 : 1;
      }
      if (a <= 0 || sc <= 0) continue;
      c.save();
      c.globalAlpha *= a;
      c.translate(cx + cw / 2 + dx, ly + dy);
      if (sc !== 1) c.scale(sc, sc);
      if (chroma) {
        const keep = c.fillStyle, k = s.size * 0.035;
        c.globalAlpha *= 0.85;
        c.fillStyle = '#ff2a6d'; c.fillText(glyph, -cw / 2 - k, 0);
        c.fillStyle = '#05d9e8'; c.fillText(glyph, -cw / 2 + k, 0);
        c.globalAlpha /= 0.85;
        c.fillStyle = keep;
      }
      str(glyph, -cw / 2, 0);
      c.restore();
    }
  });
  return { w: bw, h: bh };
}

function pathPartial(pts, f) {
  if (f >= 1) return pts;
  const segs = [];
  let tot = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(d); tot += d; }
  let rem = tot * f;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = segs[i - 1];
    if (rem >= d) { out.push(pts[i]); rem -= d; }
    else { const k = d ? rem / d : 0; out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]); break; }
  }
  return out;
}
function tracePath(c, pts) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { c.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
  const l = pts[pts.length - 1];
  c.lineTo(l[0], l[1]);
}
function drawPath(c, L, t) {
  const s = L.s, pts = s.points || [];
  if (pts.length < 2) return { w: s.width, h: s.width };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0, h = y1 - y0;
  const f = clamp(val(L, 'trim', t), 0, 100) / 100;
  if (s.fillOn && f >= 1) { tracePath(c, pts); c.closePath(); c.fillStyle = paint(c, s, w, h, s.fill); c.fill(); }
  if (s.width > 0 && f > 0) {
    tracePath(c, pathPartial(pts, f));
    c.lineWidth = s.width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = s.fillOn ? s.stroke : paint(c, s, w, h, s.stroke);
    c.stroke();
  }
  return { w: Math.max(w, 1) + s.width, h: Math.max(h, 1) + s.width };
}

function drawMissing(c, w, h, label) {
  c.fillStyle = '#2b2f45'; c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = '#8a8ea9'; c.font = `600 ${Math.max(18, Math.min(w, h) * 0.08)}px Figtree, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 0);
}

function drawFramedMedia(c, source, sw, sh, s) {
  const { w, h } = s;
  if (s.mediaFit === 'cover') {
    const k = Math.max(w / sw, h / sh), cw = w / k, ch = h / k;
    const x = (sw - cw) * clamp((s.focalX ?? 50) / 100, 0, 1);
    const y = (sh - ch) * clamp((s.focalY ?? 50) / 100, 0, 1);
    c.drawImage(source, x, y, cw, ch, -w / 2, -h / 2, w, h);
  } else if (s.mediaFit === 'contain') {
    const k = Math.min(w / sw, h / sh), dw = sw * k, dh = sh * k;
    c.drawImage(source, -dw / 2, -dh / 2, dw, dh);
  } else c.drawImage(source, -w / 2, -h / 2, w, h);
}

function drawShape(c, L, local) {
  const s = L.s;
  if (s.flipH || s.flipV) c.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
  switch (L.type) {
    case 'text': return drawText(c, L, local);
    case 'rect': {
      c.fillStyle = paint(c, s, s.w, s.h, s.fill);
      c.beginPath();
      const r = clamp(s.radius, 0, Math.min(s.w, s.h) / 2);
      if (c.roundRect) c.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, r); else c.rect(-s.w / 2, -s.h / 2, s.w, s.h);
      c.fill();
      return { w: s.w, h: s.h };
    }
    case 'ellipse':
      c.fillStyle = paint(c, s, s.w, s.h, s.fill);
      c.beginPath(); c.ellipse(0, 0, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); c.fill();
      return { w: s.w, h: s.h };
    case 'star':
      c.fillStyle = paint(c, s, s.w, s.w, s.fill);
      starPath(c, s.w / 2, Math.round(s.points), s.inner); c.fill();
      return { w: s.w, h: s.w };
    case 'path': return drawPath(c, L, local + L.start);
    case 'image': {
      const rec = A.get(s.asset);
      if (rec && rec.el && rec.el.naturalWidth) drawFramedMedia(c, rec.el, rec.el.naturalWidth, rec.el.naturalHeight, s);
      else drawMissing(c, s.w, s.h, 'Imagem');
      return { w: s.w, h: s.h };
    }
    case 'video': {
      const v = VIDS.get(L.id) || videoFor(L);
      if (v && v.readyState >= 2) drawFramedMedia(c, v, v.videoWidth, v.videoHeight, s);
      else drawMissing(c, s.w, s.h, A.get(s.asset) ? 'Carregando…' : 'Vídeo');
      return { w: s.w, h: s.h };
    }
  }
  return { w: 0, h: 0 };
}

/* RK: escala do render. 1 = resolução do projeto. O preview usa menos enquanto toca; a exportação pode usar mais. */
let RK = 1, RKM = new DOMMatrix();
function drawLayer(c, L, t, comp) {
  if (!VISUAL(L.type) || !L.visible || t < L.start || t > L.end || t === L.end && t < P().duration) { S.bounds.delete(L.id); return; }
  const m = worldMatrix(L, t);
  const op = worldOpacity(L, t);
  if (op <= 0 || mScale(m) < 1e-6) { S.bounds.delete(L.id); return; }
  if (L.type === 'group') { S.bounds.set(L.id, { w: 160, h: 160 }); return; }
  const s = L.s;
  const f = [];
  const blur = Math.max(0, val(L, 'blur', t));
  if (blur > 0) f.push(`blur(${blur * RK}px)`);
  const br = val(L, 'brightness', t), co = val(L, 'contrast', t), sa = val(L, 'saturate', t), hu = val(L, 'hue', t);
  if (br !== 100) f.push(`brightness(${br}%)`);
  if (co !== 100) f.push(`contrast(${co}%)`);
  if (sa !== 100) f.push(`saturate(${sa}%)`);
  if (hu) f.push(`hue-rotate(${hu}deg)`);
  const look = COLOR_LOOKS[s.colorLook] || COLOR_LOOKS.none;
  const intensity = clamp((s.lookIntensity ?? 100) / 100, 0, 1);
  // O look é independente dos ajustes manuais e dos keyframes de cor.
  for (const key of ['sepia', 'brightness', 'contrast', 'saturate', 'hue']) {
    if (look[key] == null || intensity === 0) continue;
    const base = key === 'sepia' || key === 'hue' ? 0 : 100;
    const v = base + (look[key] - base) * intensity;
    f.push(key === 'hue' ? `hue-rotate(${v}deg)` : `${key}(${v}%)`);
  }
  const filter = f.join(' ') || 'none';
  const glow = Math.max(0, val(L, 'glow', t));
  const shadowOn = (s.shadowBlur > 0 || s.shadowX || s.shadowY) && s.shadowOpacity > 0;
  const passes = shadowOn ? ['shadow'] : [];
  if (glow > 0) passes.push('glow', 'glow');
  if (!passes.length) passes.push('plain');
  let b = { w: 0, h: 0 };
  for (const pass of passes) {
    c.save();
    c.setTransform(RK === 1 ? m : RKM.multiply(m));
    c.globalAlpha = op;
    c.globalCompositeOperation = comp || s.blend || 'source-over';
    c.filter = filter;
    if ((L.type === 'image' || L.type === 'video') && (s.transitionIn === 'wipe' || s.transitionOut === 'wipe')) {
      const tr = transitionState(L, t);
      c.beginPath();
      c.rect(-s.w / 2 + s.w * tr.left, -s.h / 2, s.w * Math.max(0, tr.right - tr.left), s.h);
      c.clip();
    }
    if (pass === 'shadow') {
      c.shadowColor = hexA(s.shadowColor, s.shadowOpacity / 100);
      c.shadowBlur = s.shadowBlur * RK; c.shadowOffsetX = s.shadowX * RK; c.shadowOffsetY = s.shadowY * RK;
    } else if (pass === 'glow') {
      c.shadowColor = s.glowColor || '#ffffff'; c.shadowBlur = glow * mScale(m) * RK;
    }
    b = drawShape(c, L, t - L.start);
    c.restore();
  }
  S.bounds.set(L.id, b);
}

function renderFrame(c, t, opt = {}) {
  const p = P();
  RK = opt.k || 1;
  RKM = new DOMMatrix([RK, 0, 0, RK, 0, 0]);
  const cw = c.canvas.width, chh = c.canvas.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.filter = 'none'; c.shadowBlur = 0; c.globalCompositeOperation = 'source-over';
  if (opt.transparent) c.clearRect(0, 0, cw, chh);
  else { c.fillStyle = p.background; c.fillRect(0, 0, cw, chh); }
  const ls = p.layers;
  let i = ls.length - 1;
  while (i >= 0) {
    const base = ls[i];
    const clipped = [];
    let j = i - 1;
    while (j >= 0 && ls[j].s && ls[j].s.clip && VISUAL(ls[j].type)) clipped.push(ls[j--]);
    if (!clipped.length) drawLayer(c, base, t);
    else {
      // máscara de recorte: as camadas acima só aparecem onde a camada de baixo existe
      if (off.width !== cw || off.height !== chh) { off.width = cw; off.height = chh; }
      offCtx.setTransform(1, 0, 0, 1, 0, 0);
      offCtx.clearRect(0, 0, off.width, off.height);
      drawLayer(offCtx, base, t, 'source-over');
      for (const C of clipped) drawLayer(offCtx, C, t, 'source-atop');
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = base.s.blend || 'source-over';
      c.drawImage(off, 0, 0);
      c.restore();
    }
    i = j;
  }
  RK = 1; RKM = new DOMMatrix();
}
/* enquanto toca, o preview desenha só na resolução da tela (bem mais leve no celular) */
function renderMain(t = S.time) {
  const p = P();
  const k = S.playing && !S.exporting ? S.playK || 1 : 1;
  const w = Math.max(2, Math.round(p.width * k)), h = Math.max(2, Math.round(p.height * k));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  renderFrame(ctx, t, { k });
}

/* ======================= seleção no preview ======================= */
function handlesOf(L) {
  const b = S.bounds.get(L.id);
  if (!b) return null;
  const m = worldMatrix(L, S.time);
  const sc = mScale(m);
  const tp = (x, y) => { const q = m.transformPoint(new DOMPoint(x, y)); return { x: q.x, y: q.y }; };
  const hw = b.w / 2, hh = b.h / 2;
  const ext = 28 / (S.view * sc);
  return {
    corners: [tp(-hw, -hh), tp(hw, -hh), tp(hw, hh), tp(-hw, hh)],
    scale: tp(hw, hh), rotate: tp(0, -hh - ext), top: tp(0, -hh), center: tp(0, 0),
  };
}

let pathDots = [];
function drawMotionPath(L, k, dpr) {
  pathDots = [];
  if (S.playing || !(isAnimated(L, 'x') || isAnimated(L, 'y'))) return;
  const times = [...new Set([...(L.kf.x || []), ...(L.kf.y || [])].map(q => round(q.t, 4)))].sort((a, b) => a - b);
  if (!times.length) return;
  const at = t => { const q = parentMatrix(L, t).transformPoint(new DOMPoint(val(L, 'x', t), val(L, 'y', t))); return { x: q.x * k, y: q.y * k }; };
  const t0 = times[0], t1 = times[times.length - 1];
  if (t1 > t0) {
    octx.save();
    octx.strokeStyle = 'rgba(255,181,71,.85)';
    octx.lineWidth = 1.5 * dpr;
    octx.setLineDash([4 * dpr, 4 * dpr]);
    octx.beginPath();
    const step = Math.max(1 / P().fps, (t1 - t0) / 240);
    for (let t = t0; t <= t1 + 1e-6; t += step) { const q = at(t); t === t0 ? octx.moveTo(q.x, q.y) : octx.lineTo(q.x, q.y); }
    octx.stroke();
    octx.restore();
  }
  for (const t of times) {
    const q = at(t);
    pathDots.push({ t, x: q.x / k, y: q.y / k });
    const on = Math.abs(t - S.time) < 0.5 / P().fps;
    octx.beginPath();
    octx.rect(q.x - 5 * dpr, q.y - 5 * dpr, 10 * dpr, 10 * dpr);
    octx.fillStyle = on ? '#ffffff' : '#ffb547';
    octx.fill();
    octx.lineWidth = 1.5 * dpr; octx.strokeStyle = '#0e0f14'; octx.stroke();
  }
}

let penPts = null;
function drawOverlay() {
  const dpr = window.devicePixelRatio || 1;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (penPts && penPts.length > 1) {
    const k = S.view * dpr;
    octx.strokeStyle = '#ffb547'; octx.lineWidth = 3 * dpr; octx.lineCap = 'round'; octx.lineJoin = 'round';
    octx.beginPath(); penPts.forEach((q, i) => (i ? octx.lineTo(q.x * k, q.y * k) : octx.moveTo(q.x * k, q.y * k))); octx.stroke();
    return;
  }
  const L = selLayer();
  if (!L || S.exporting || !L.visible || !VISUAL(L.type)) return;
  const h = handlesOf(L);
  if (!h) return;
  const k = S.view * dpr;
  const m = pt => [pt.x * k, pt.y * k];
  octx.lineWidth = 1.5 * dpr;
  octx.strokeStyle = '#6fd8ff';
  octx.setLineDash(L.type === 'group' ? [6 * dpr, 4 * dpr] : []);
  octx.beginPath();
  h.corners.forEach((pt, i) => (i ? octx.lineTo(...m(pt)) : octx.moveTo(...m(pt))));
  octx.closePath(); octx.stroke();
  octx.setLineDash([]);
  if (L.type === 'group') {
    const [cx, cy] = m(h.center);
    octx.beginPath(); octx.moveTo(cx - 10 * dpr, cy); octx.lineTo(cx + 10 * dpr, cy); octx.moveTo(cx, cy - 10 * dpr); octx.lineTo(cx, cy + 10 * dpr); octx.stroke();
  }
  octx.beginPath(); octx.moveTo(...m(h.top)); octx.lineTo(...m(h.rotate)); octx.stroke();
  const dot = (pt, r, fill) => { octx.beginPath(); octx.arc(...m(pt), r * dpr, 0, Math.PI * 2); octx.fillStyle = fill; octx.fill(); octx.stroke(); };
  dot(h.rotate, 6, '#0e0f14');
  dot(h.scale, 7, '#6fd8ff');
  drawMotionPath(L, k, dpr);
}

function fitStage() {
  const p = P();
  const stage = $('#stage');
  const cs = getComputedStyle(stage);
  const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const r = Math.max(0.01, Math.min(aw / p.width, ah / p.height));
  const cw = Math.floor(p.width * r), ch = Math.floor(p.height * r);
  const dpr = window.devicePixelRatio || 1;
  // resolução do preview durante a reprodução: a da tela, nunca mais que o projeto
  const pk = Math.min(1, (cw * dpr) / p.width);
  S.playK = pk > 0.85 ? 1 : Math.max(0.25, pk);
  canvas.style.width = overlay.style.width = cw + 'px';
  canvas.style.height = overlay.style.height = ch + 'px';
  overlay.width = Math.round(cw * dpr); overlay.height = Math.round(ch * dpr);
  S.view = cw / p.width;
  renderMain(); drawOverlay();
}

const toProject = e => { const r = overlay.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.view, y: (e.clientY - r.top) / S.view }; };

function hitTest(pt) {
  for (const L of P().layers) {
    if (!VISUAL(L.type) || L.type === 'group' || !L.visible || S.time < L.start || S.time > L.end || S.time === L.end && S.time < P().duration) continue;
    const b = S.bounds.get(L.id);
    if (!b) continue;
    const m = worldMatrix(L, S.time);
    if (!m.isIdentity && mScale(m) < 1e-6) continue;
    const q = m.inverse().transformPoint(new DOMPoint(pt.x, pt.y));
    const pad = 10 / (S.view * mScale(m));
    if (Math.abs(q.x) <= b.w / 2 + pad && Math.abs(q.y) <= b.h / 2 + pad) return L;
  }
  return null;
}

let drag = null;
overlay.addEventListener('pointerdown', e => {
  if (S.exporting) return;
  const pt = toProject(e);
  if (S.pen) {
    if (S.playing) pause();
    penPts = [pt];
    drag = { mode: 'pen' };
    overlay.setPointerCapture(e.pointerId);
    return;
  }
  const near = (a, r = 18) => a && Math.hypot((a.x - pt.x) * S.view, (a.y - pt.y) * S.view) <= r;
  let L = selLayer();
  const h = L && L.visible && VISUAL(L.type) ? handlesOf(L) : null;
  const dot = L && pathDots.find(d => near(d, 12));
  if (dot) {
    drag = { mode: 'pathkf', L, t: dot.t, inv: parentMatrix(L, dot.t).inverse() };
    setTime(dot.t);
  } else if (h && near(h.scale)) {
    drag = { mode: 'scale', L, c: h.center, d0: Math.hypot(pt.x - h.center.x, pt.y - h.center.y) || 1, v0: val(L, 'scale') };
  } else if (h && near(h.rotate)) {
    drag = { mode: 'rotate', L, c: h.center, a0: Math.atan2(pt.y - h.center.y, pt.x - h.center.x), v0: val(L, 'rotation') };
  } else if (h && L.type === 'group' && near(h.center, 24)) {
    drag = { mode: 'move', L };
  } else {
    L = hitTest(pt);
    if (L !== selLayer()) select(L ? L.id : null);
    if (!L) return;
    drag = { mode: 'move', L };
  }
  if (drag.mode === 'move') {
    drag.inv = parentMatrix(drag.L, S.time).inverse();
    drag.p0 = drag.inv.transformPoint(new DOMPoint(pt.x, pt.y));
    drag.x0 = val(drag.L, 'x'); drag.y0 = val(drag.L, 'y');
  }
  if (S.playing) pause();
  drag.moved = false;
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', e => {
  if (!drag) return;
  const pt = toProject(e), L = drag.L;
  if (drag.mode === 'pen') {
    const last = penPts[penPts.length - 1];
    if (Math.hypot(pt.x - last.x, pt.y - last.y) * S.view > 2) { penPts.push(pt); drawOverlay(); }
    return;
  }
  if (drag.mode === 'pathkf') {
    const q = drag.inv.transformPoint(new DOMPoint(pt.x, pt.y));
    upsertKf(L, 'x', drag.t, Math.round(q.x)); upsertKf(L, 'y', drag.t, Math.round(q.y));
    drag.moved = true;
    renderMain(); drawOverlay(); syncPanel();
    return;
  }
  if (drag.mode === 'move') {
    const q = drag.inv.transformPoint(new DOMPoint(pt.x, pt.y));
    let nx = drag.x0 + q.x - drag.p0.x, ny = drag.y0 + q.y - drag.p0.y;
    if (!L.parent) {
      const p = P(), tol = 8 / S.view;
      if (Math.abs(nx - p.width / 2) < tol) nx = p.width / 2;
      if (Math.abs(ny - p.height / 2) < tol) ny = p.height / 2;
    }
    setProp(L, 'x', Math.round(nx)); setProp(L, 'y', Math.round(ny));
  } else if (drag.mode === 'scale') {
    setProp(L, 'scale', Math.round(drag.v0 * Math.hypot(pt.x - drag.c.x, pt.y - drag.c.y) / drag.d0));
  } else if (drag.mode === 'rotate') {
    let deg = drag.v0 + (Math.atan2(pt.y - drag.c.y, pt.x - drag.c.x) - drag.a0) * 180 / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    setProp(L, 'rotation', Math.round(deg));
  }
  drag.moved = true;
  renderMain(); drawOverlay(); syncPanel();
});
const endDrag = () => {
  if (!drag) return;
  if (drag.mode === 'pen') { drag = null; finishPen(); return; }
  if (drag.moved) { commit(); renderTimeline(); }
  drag = null;
};
function setPen(on) {
  S.pen = on;
  $('[data-add="path"]').classList.toggle('on', on);
  overlay.style.cursor = on ? 'crosshair' : '';
  if (on) toast('Desenhe com o dedo ou o mouse no preview.');
}
function finishPen() {
  const pts = penPts || [];
  penPts = null;
  setPen(false);
  if (pts.length < 2) { drawOverlay(); return; }
  // simplifica: descarta pontos muito próximos
  const min = 3 / S.view, simple = [pts[0]];
  for (const q of pts.slice(1)) { const l = simple[simple.length - 1]; if (Math.hypot(q.x - l.x, q.y - l.y) >= min) simple.push(q); }
  if (simple.length < 2) simple.push(pts[pts.length - 1]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of simple) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const L = makeLayer('path', { p: { x: Math.round(cx), y: Math.round(cy) }, s: { points: simple.map(q => [round(q.x - cx, 1), round(q.y - cy, 1)]) } });
  addLayer(L);
}
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);

/* ======================= tempo e reprodução ======================= */
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
function refreshTime() {
  syncMedia();
  renderMain(); drawOverlay(); updatePlayhead();
  $('#timecode').textContent = fmtTime(S.time);
  syncPanel();
}
function setTime(t) { S.time = clamp(snap(t), 0, P().duration); refreshTime(); }

function play() {
  if (S.playing || S.exporting) return;
  S.playing = true; app.classList.add('playing');
  if (S.time >= P().duration - 1e-3) S.time = 0;
  const startAudio = () => {
    stopAudio();
    try { const ac = audioCtx(); ac.resume(); liveAudio = scheduleAudio(ac, ac.destination, S.time); } catch { /* sem áudio */ }
  };
  startAudio();
  let last = performance.now();
  const loop = now => {
    if (!S.playing) return;
    S.time += (now - last) / 1000; last = now;
    if (S.time >= P().duration) { S.time = 0; pauseAllVideos(); startAudio(); }
    refreshTime(); followPlayhead();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function pause() {
  S.playing = false; app.classList.remove('playing');
  stopAudio(); pauseAllVideos();
  S.time = clamp(snap(S.time), 0, P().duration);
  refreshTime();
}
$('#btnPlay').onclick = () => (S.playing ? pause() : play());
$('#btnStart').onclick = () => { pause(); setTime(0); $('#tlScroll').scrollLeft = 0; };
$('#btnSplit').onclick = () => splitLayer();

/* ======================= linha do tempo ======================= */
const labelW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-w')) || 112;
const tx = t => TL_PAD + t * S.pps;
const mediaSourceDur = L => { const r = A.get(L.s.asset); return r && r.duration ? r.duration : Infinity; };
const mediaDur = L => mediaSourceDur(L) / (L.s && L.s.speed ? L.s.speed : 1);
const mediaRemaining = L => Math.max(0, (mediaSourceDur(L) - (L.s.trimIn || 0)) / (L.s && L.s.speed ? L.s.speed : 1));

function renderTimeline() {
  const p = P();
  if (!p) return;
  const trackW = TL_PAD * 2 + p.duration * S.pps;
  $('#tlInner').style.width = labelW() + trackW + 'px';
  $('#tlDur').textContent = '/ ' + fmtTime(p.duration);

  const ticks = $('#tlTicks');
  ticks.style.width = trackW + 'px';
  const minor = S.pps >= 220 ? 0.1 : S.pps >= 90 ? 0.25 : 0.5;
  const major = S.pps >= 60 ? 1 : 2;
  let html = '';
  for (let t = 0; t <= p.duration + 1e-6; t = round(t + minor, 4)) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    html += `<div class="tick${isMajor ? ' major' : ''}" style="left:${tx(t)}px">${isMajor ? `<span>${t}s</span>` : ''}</div>`;
  }
  ticks.innerHTML = html;

  const eyeOn = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/></svg>';
  const muteOn = '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  const muteOff = '<svg viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  const depth = L => { let d = 0, c = L; while (c.parent && d < 6) { c = byId(c.parent); if (!c) break; d++; } return d; };
  $('#tlRows').innerHTML = p.layers.map(L => {
    // keyframes gerados por código viram uma faixa única; os losangos ficam só para os feitos à mão
    const codeSet = new Set(L.codeKf || []);
    const handTimes = [...new Set(Object.entries(L.kf).filter(([prop]) => !codeSet.has(prop)).flatMap(([, ks]) => ks.map(k => round(k.t, 4))))].sort((a, b) => a - b);
    const codeTimes = [...codeSet].flatMap(prop => (L.kf[prop] || []).map(k => k.t));
    const codeSpan = codeTimes.length ? `<div class="code-span" title="Animado por código" style="left:${tx(Math.min(...codeTimes))}px;width:${Math.max(4, (Math.max(...codeTimes) - Math.min(...codeTimes)) * S.pps)}px"></div>` : '';
    const kfs = codeSpan + handTimes.map(t => `<button class="kf${S.selKf && S.selKf.id === L.id && Math.abs(S.selKf.t - t) < 1e-4 ? ' sel' : ''}" data-kf-t="${t}" style="left:${tx(t)}px" aria-label="Keyframe em ${t.toFixed(2)}s"></button>`).join('');
    const d = depth(L);
    const tag = L.s.clip ? '<span class="tag" title="Recortada na camada de baixo">↳</span>' : '';
    const muteBtn = MEDIA(L.type) ? `<button class="mute${L.s.muted ? ' is-muted' : ''}" data-mute aria-label="${L.s.muted ? 'Ativar som' : 'Desativar som'}">${L.s.muted ? muteOn : muteOff}</button>` : '';
    return `<div class="tl-row${L.id === S.sel ? ' sel' : ''}${L.visible ? '' : ' off'}" data-id="${L.id}">
      <div class="tl-label" style="padding-left:${8 + d * 10}px"><button class="eye" data-eye aria-label="${L.visible ? 'Ocultar' : 'Mostrar'} camada">${L.visible ? eyeOn : eyeOff}</button>${muteBtn}<i class="type-dot ${L.type}"></i>${tag}<span class="name">${esc(L.name)}</span></div>
      <div class="tl-track" style="width:${trackW}px">
        <div class="clip ${L.type}" style="left:${tx(L.start)}px;width:${(L.end - L.start) * S.pps}px">${MEDIA(L.type) ? `<canvas class="wave" data-wave="${L.id}"></canvas>` : ''}<span class="h l"></span><span class="h r"></span></div>
        ${kfs}
      </div></div>`;
  }).join('') || `<div class="tl-row"><div class="tl-label" style="color:var(--muted)">Vazio</div><div class="tl-track" style="width:${trackW}px"></div></div>`;
  drawWaves();
  updatePlayhead();
}

function drawWaves() {
  const dpr = window.devicePixelRatio || 1;
  $$('canvas.wave').forEach(cv => {
    const L = byId(cv.dataset.wave);
    const rec = L && A.get(L.s.asset);
    if (!rec || !rec.peaks) return;
    const w = Math.min(4000, Math.max(1, Math.round((L.end - L.start) * S.pps)));
    const h = cv.parentElement.clientHeight || 22;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = L.type === 'audio' ? 'rgba(111,216,255,.75)' : 'rgba(255,255,255,.35)';
    const mid = h / 2;
    const sp = L.s && L.s.speed ? L.s.speed : 1;
    for (let x = 0; x < w; x += 2) {
      const src = (L.s.trimIn || 0) + (x / S.pps) * sp;
      const amp = rec.peaks[Math.floor(src * PEAKS_PER_SEC)] || 0;
      const bh = Math.max(1, amp * (h - 6));
      c.fillRect(x, mid - bh / 2, 1.2, bh);
    }
  });
}

function updatePlayhead() { $('#playhead').style.left = labelW() + tx(S.time) + 'px'; }
function followPlayhead() {
  const sc = $('#tlScroll'), x = labelW() + tx(S.time);
  if (x > sc.scrollLeft + sc.clientWidth - 30 || x < sc.scrollLeft + labelW()) sc.scrollLeft = x - labelW() - 20;
}

const ticksEl = $('#tlTicks');
ticksEl.style.touchAction = 'none';
ticksEl.addEventListener('pointerdown', e => {
  if (S.playing) pause();
  const move = ev => setTime((ev.clientX - ticksEl.getBoundingClientRect().left - TL_PAD) / S.pps);
  move(e);
  ticksEl.setPointerCapture(e.pointerId);
  ticksEl.onpointermove = move;
  ticksEl.onpointerup = ticksEl.onpointercancel = () => { ticksEl.onpointermove = null; };
});
$('#tlZoom').addEventListener('input', e => { S.pps = +e.target.value; renderTimeline(); });

const rows = $('#tlRows');
rows.addEventListener('click', e => {
  const row = e.target.closest('.tl-row[data-id]');
  if (!row) return;
  const L = byId(row.dataset.id);
  if (e.target.closest('[data-eye]')) { L.visible = !L.visible; commit(); renderTimeline(); refreshTime(); return; }
  if (e.target.closest('[data-mute]')) { L.s.muted = !L.s.muted; commit(); renderTimeline(); renderPanel(); refreshTime(); return; }
  if (e.target.closest('.tl-label')) { select(L.id); return; }
  if (e.target.classList.contains('tl-track')) {
    if (S.playing) pause();
    setTime((e.clientX - e.target.getBoundingClientRect().left - TL_PAD) / S.pps);
  }
});

rows.addEventListener('pointerdown', e => {
  const row = e.target.closest('.tl-row[data-id]');
  if (!row || S.exporting) return;
  const L = byId(row.dataset.id);
  const kfEl = e.target.closest('.kf');
  const clipEl = e.target.closest('.clip');
  if (!kfEl && !clipEl) return;
  e.preventDefault();
  if (S.playing) pause();
  const x0 = e.clientX;
  const target = kfEl || clipEl;
  target.setPointerCapture(e.pointerId);

  if (kfEl) {
    const t0 = +kfEl.dataset.kfT;
    S.sel = L.id; S.selKf = { id: L.id, t: t0 };
    setTime(t0);
    let nt = t0;
    target.onpointermove = ev => {
      nt = clamp(snap(t0 + (ev.clientX - x0) / S.pps), 0, P().duration);
      kfEl.style.left = tx(nt) + 'px';
    };
    target.onpointerup = target.onpointercancel = () => {
      target.onpointermove = target.onpointerup = target.onpointercancel = null;
      if (Math.abs(nt - t0) > 1e-6) { moveKeyframes(L, t0, nt); S.selKf.t = nt; setTime(nt); commit(); }
      renderTimeline(); renderPanel(); refreshTime();
      const box = $('.kf-box', panel); if (box) box.scrollIntoView({ block: 'nearest' });
    };
    return;
  }

  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const s0 = L.start, e0 = L.end, dur = P().duration, trim0 = L.s.trimIn || 0, isMedia = MEDIA(L.type);
  const trStart0 = L.s.transitionStart, trEnd0 = L.s.transitionEnd;
  const sp = L.s.speed || 1;
  if (L.id !== S.sel) select(L.id);
  const clip = row.querySelector('.clip');
  const kfEls = $$('.kf', row).map(el => ({ el, t: +el.dataset.kfT }));
  let dt = 0;
  target.onpointermove = ev => {
    dt = (ev.clientX - x0) / S.pps;
    if (mode === 'move') {
      dt = clamp(snap(dt), -s0, dur - e0);
      let ns = s0 + dt, ne = e0 + dt;
      if (Math.abs(ns - S.time) < 8 / S.pps) { dt = S.time - s0; ns = s0 + dt; ne = e0 + dt; }
      else if (Math.abs(ne - S.time) < 8 / S.pps) { dt = S.time - e0; ns = s0 + dt; ne = e0 + dt; }
      L.start = ns; L.end = ne;
      if (trStart0 != null) L.s.transitionStart = trStart0 + dt;
      if (trEnd0 != null) L.s.transitionEnd = trEnd0 + dt;
      kfEls.forEach(k => (k.el.style.left = tx(k.t + dt) + 'px'));
    } else if (mode === 'l') {
      const minStart = isMedia ? Math.max(0, s0 - trim0 / sp) : 0;
      let ns = clamp(snap(s0 + dt), minStart, L.end - 0.1);
      if (Math.abs(ns - S.time) < 8 / S.pps && S.time >= minStart && S.time <= L.end - 0.1) ns = snap(S.time);
      L.start = ns;
      if (ns !== s0) delete L.s.transitionStart;
      else if (trStart0 != null) L.s.transitionStart = trStart0;
      if (isMedia) L.s.trimIn = round(trim0 + (L.start - s0) * sp, 4);
    } else {
      const maxEnd = isMedia ? Math.min(dur, L.start + mediaRemaining(L)) : dur;
      let ne = clamp(snap(e0 + dt), L.start + 0.1, maxEnd);
      if (Math.abs(ne - S.time) < 8 / S.pps && S.time >= L.start + 0.1 && S.time <= maxEnd) ne = snap(S.time);
      L.end = ne;
      if (ne !== e0) delete L.s.transitionEnd;
      else if (trEnd0 != null) L.s.transitionEnd = trEnd0;
    }
    clip.style.left = tx(L.start) + 'px';
    clip.style.width = (L.end - L.start) * S.pps + 'px';
    syncMedia(); renderMain(); drawOverlay();
  };
  target.onpointerup = target.onpointercancel = () => {
    target.onpointermove = target.onpointerup = target.onpointercancel = null;
    if (mode === 'move' && dt) for (const prop of Object.keys(L.kf)) L.kf[prop].forEach(k => (k.t = round(k.t + dt, 4)));
    if (L.start !== s0 || L.end !== e0) commit();
    renderTimeline(); renderPanel(); refreshTime();
  };
});

/* ======================= painel de propriedades ======================= */
const panel = $('#panel');
function rangeFor(prop) {
  const p = P(), d = PROPS[prop];
  if (prop === 'x') return [-p.width, p.width * 2];
  if (prop === 'y') return [-p.height, p.height * 2];
  return [d.min, d.max];
}
const propRow = prop => {
  const d = PROPS[prop], [mn, mx] = rangeFor(prop);
  return `<div class="row"><label for="n-${prop}">${d.label}</label>
    <input type="range" id="r-${prop}" data-prop="${prop}" min="${mn}" max="${mx}" step="${d.step}" aria-label="${d.label}">
    <input type="number" id="n-${prop}" data-prop="${prop}" step="${d.step}">
    <button class="kbtn" data-kf="${prop}" title="Adicionar ou remover keyframe neste tempo" aria-label="Keyframe de ${d.label}"><i></i></button></div>`;
};
const numRow = (key, label, mn, mx, step = 1) =>
  `<div class="row"><label for="s-${key}">${label}</label>
    <input type="range" data-s="${key}" min="${mn}" max="${mx}" step="${step}" aria-label="${label}">
    <input type="number" id="s-${key}" data-s="${key}" min="${mn}" max="${mx}" step="${step}"><span></span></div>`;
const colorRow = (key, label) => `<div class="row plain"><label for="s-${key}">${label}</label><input type="color" id="s-${key}" data-s="${key}"></div>`;
const selectRow = (key, label, opts) =>
  `<div class="row plain"><label for="s-${key}">${label}</label><select id="s-${key}" data-s="${key}">${Object.entries(opts).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`;
const checkRow = (key, label) => `<label class="check"><input type="checkbox" data-s="${key}" id="s-${key}"> ${label}</label>`;
const fillRows = (colorKey, label) => `${selectRow('fillType', 'Preenchimento', { solid: 'Cor sólida', linear: 'Degradê linear', radial: 'Degradê radial' })}
  ${colorRow(colorKey, label)}
  <div data-show="grad">${colorRow('fill2', 'Segunda cor')}${numRow('gradAngle', 'Ângulo', 0, 360)}</div>`;

function renderPanel() {
  const scroll = panel.scrollTop;
  const L = selLayer();
  panel.innerHTML = L ? layerPanel(L) : projectPanel();
  panel.scrollTop = scroll;
  syncPanel(true);
  const cv = $('#curveCv', panel);
  if (cv && L) setupCurve(cv, L);
}

const kfsAt = (L, t) => Object.values(L.kf).flat().filter(k => Math.abs(k.t - t) < 0.5 / P().fps);
function setupCurve(cv, L) {
  const pad = 14, yMin = -0.4, yMax = 1.4;
  const geo = () => ({ W: cv.clientWidth, H: cv.clientHeight });
  const X = (x, g) => pad + x * (g.W - pad * 2);
  const Y = (y, g) => g.H - pad - (y - yMin) / (yMax - yMin) * (g.H - pad * 2);
  const inv = (px, py, g) => ({ x: clamp((px - pad) / (g.W - pad * 2), 0, 1), y: clamp(yMin + (g.H - pad - py) / (g.H - pad * 2) * (yMax - yMin), yMin, yMax) });
  const draw = () => {
    const ks = S.selKf ? kfsAt(L, S.selKf.t) : [];
    if (!ks.length) return;
    const k = ks[0], g = geo(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.strokeStyle = '#2b2f45'; c.lineWidth = 1;
    for (const y of [0, 1]) { c.beginPath(); c.moveTo(X(0, g), Y(y, g)); c.lineTo(X(1, g), Y(y, g)); c.stroke(); }
    const fn = easeFn(k);
    c.strokeStyle = '#ffb547'; c.lineWidth = 2.5; c.beginPath();
    for (let i = 0; i <= 80; i++) { const x = i / 80, y = fn(x); i ? c.lineTo(X(x, g), Y(y, g)) : c.moveTo(X(x, g), Y(y, g)); }
    c.stroke();
    const bz = k.e === 'custom' && k.bz ? k.bz : BEZ_OF[k.e];
    if (bz) {
      c.strokeStyle = '#6fd8ff'; c.lineWidth = 1.5;
      const hs = [[0, 0, bz[0], bz[1]], [1, 1, bz[2], bz[3]]];
      for (const [ax, ay, hx, hy] of hs) {
        c.beginPath(); c.moveTo(X(ax, g), Y(ay, g)); c.lineTo(X(hx, g), Y(hy, g)); c.stroke();
        c.beginPath(); c.arc(X(hx, g), Y(hy, g), 6, 0, Math.PI * 2); c.fillStyle = '#6fd8ff'; c.fill();
      }
    } else {
      c.fillStyle = '#8a8ea9'; c.font = '12px Figtree, sans-serif'; c.fillText('Arraste para editar como curva', X(0, g), Y(1.3, g));
    }
  };
  draw();
  cv.onpointerdown = e => {
    const ks = kfsAt(L, S.selKf.t);
    if (!ks.length) return;
    const k = ks[0];
    const bz = (k.e === 'custom' && k.bz ? k.bz : BEZ_OF[k.e] || BEZ_OF.easeInOut).slice();
    const r = cv.getBoundingClientRect(), g = geo();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const d1 = Math.hypot(px - X(bz[0], g), py - Y(bz[1], g)), d2 = Math.hypot(px - X(bz[2], g), py - Y(bz[3], g));
    const which = d1 <= d2 ? 0 : 2;
    cv.setPointerCapture(e.pointerId);
    const apply = ev => {
      const q = inv(ev.clientX - r.left, ev.clientY - r.top, g);
      bz[which] = round(q.x, 3); bz[which + 1] = round(q.y, 3);
      ks.forEach(o => { o.e = 'custom'; o.bz = bz.slice(); });
      draw(); renderMain(); drawOverlay();
    };
    apply(e);
    cv.onpointermove = apply;
    cv.onpointerup = cv.onpointercancel = () => {
      cv.onpointermove = cv.onpointerup = null;
      const sel = $('#kf-ease', panel); if (sel) sel.value = 'custom';
      commit();
    };
  };
  cv.redraw = draw;
}

function projectPanel() {
  const p = P();
  return `
  <div class="sec"><h3>Projeto</h3>
    <div class="row plain"><label>Formato</label><div class="seg">${Object.keys(ASPECTS).map(a => `<button data-aspect="${a}" class="${p.aspect === a ? 'on' : ''}">${a}</button>`).join('')}</div></div>
    <div class="row plain"><label for="pj-duration">Duração (s)</label><input class="field" type="number" id="pj-duration" data-proj="duration" min="0.5" max="600" step="0.5"></div>
    <div class="row plain"><label for="pj-fps">Quadros/s</label><select class="field" id="pj-fps" data-proj="fps"><option>24</option><option>30</option><option>60</option></select></div>
    <div class="row plain"><label for="pj-bg">Fundo</label><input type="color" id="pj-bg" data-proj="background"></div>
  </div>
  <div class="sec"><h3>Como usar</h3>
    <p class="hint">Adicione texto, formas, imagens, vídeos e música com os botões abaixo do preview. Toque numa camada para editar e arraste no preview para mover. A alça azul do canto muda o tamanho e a bolinha de cima gira.</p>
    <p class="hint">Para animar, mova o cursor da linha do tempo e toque no losango ao lado de uma propriedade. Cada losango é um keyframe. Ou use uma animação pronta.</p>
    <p class="hint">Grupos movem várias camadas juntas: crie um grupo e, em cada camada, escolha o grupo em "Seguir camada".</p>
  </div>`;
}

function layerPanel(L) {
  const s = L.s;
  let content = '';
  if (L.type === 'text') {
    content = `<textarea data-s="text" id="s-text" aria-label="Texto" rows="2"></textarea>
      ${selectRow('font', 'Fonte', Object.fromEntries(FONTS.map(f => [f, f])))}
      ${numRow('size', 'Tamanho', 10, 600)}
      ${selectRow('weight', 'Peso', { 400: 'Normal', 600: 'Médio', 700: 'Negrito', 900: 'Pesado' })}
      ${fillRows('color', 'Cor')}
      <div class="row plain"><label>Alinhar</label><div class="seg">${['left', 'center', 'right'].map(a => `<button data-align="${a}" class="${s.align === a ? 'on' : ''}">${{ left: 'Esq.', center: 'Centro', right: 'Dir.' }[a]}</button>`).join('')}</div></div>
      ${numRow('stroke', 'Contorno', 0, 40)}
      ${colorRow('strokeColor', 'Cor contorno')}
      ${selectRow('anim', 'Animação', TEXT_ANIMS)}`;
  } else if (L.type === 'rect') {
    content = numRow('w', 'Largura', 1, 4000) + numRow('h', 'Altura', 1, 4000) + numRow('radius', 'Cantos', 0, 1000) + fillRows('fill', 'Cor');
  } else if (L.type === 'ellipse') {
    content = numRow('w', 'Largura', 1, 4000) + numRow('h', 'Altura', 1, 4000) + fillRows('fill', 'Cor');
  } else if (L.type === 'star') {
    content = numRow('w', 'Tamanho', 1, 4000) + numRow('points', 'Pontas', 3, 16) + numRow('inner', 'Recorte', 0.1, 0.95, 0.01) + fillRows('fill', 'Cor');
  } else if (L.type === 'path') {
    content = `${colorRow('stroke', 'Cor do traço')}${numRow('width', 'Espessura', 0, 200)}
      ${propRow('trim')}
      <p class="hint">Anime "Desenhado %" de 0 a 100 para o traço se desenhar sozinho, ou use "Desenhar traço" nas animações prontas.</p>
      ${checkRow('fillOn', 'Preencher a forma')}
      <div data-show="fillOn">${fillRows('fill', 'Cor do preenchimento')}</div>`;
  } else if (L.type === 'image' || L.type === 'video') {
    content = numRow('w', 'Largura', 1, 6000) + numRow('h', 'Altura', 1, 6000) +
      selectRow('mediaFit', 'Enquadrar', MEDIA_FITS) +
      `<div data-show="focal">${numRow('focalX', 'Foco X %', 0, 100)}${numRow('focalY', 'Foco Y %', 0, 100)}</div>
      <p class="hint">Preencher recorta sem deformar. Ajuste o foco para manter a pessoa ou o objeto no quadro.</p>
      <div class="actions"><button class="btn btn-small" data-act="media-frame">Quadro do projeto</button></div>` +
      `<div class="actions"><button class="btn btn-small" data-act="replace-media">Trocar arquivo</button><button class="btn btn-small" data-act="media-ratio">Proporção original</button><button class="btn btn-small" data-act="media-fill">Preencher a tela</button>${L.type === 'video' ? '<button class="btn btn-small" data-act="freeze-frame" title="Congela o quadro atual como nova camada">Congelar quadro</button>' : ''}${L.type === 'image' ? '<button class="btn btn-small btn-ai" data-act="remove-bg">Remover fundo (IA)</button>' : ''}</div>`;
  } else if (L.type === 'group') {
    content = '<p class="hint">Um grupo não aparece no vídeo. Ele move, gira, escala e esmaece todas as camadas que o seguem. Escolha este grupo em "Seguir camada" nas outras camadas.</p>';
  }
  let media = '';
  if (MEDIA(L.type)) {
    const rec = A.get(s.asset);
    const info = rec ? (rec.buffer ? `Duração do arquivo: ${fmtTime(rec.duration || 0)}` : (L.type === 'video' ? 'Este vídeo não tem som (ou o navegador não conseguiu ler o áudio).' : 'Não consegui ler este áudio.')) : 'Arquivo não encontrado neste aparelho. Use "Trocar arquivo".';
    const speeds = { '0.25': '0.25x (lento 4x)', '0.5': '0.5x (lento 2x)', '0.75': '0.75x', '1': '1x (normal)', '1.25': '1.25x', '1.5': '1.5x (rápido)', '2': '2x (acelerado)', '3': '3x', '4': '4x' };
    media = `<div class="sec"><h3>${L.type === 'video' ? 'Áudio e Velocidade' : 'Som'}</h3>
      ${checkRow('muted', 'Mudo (sem som)')}
      ${selectRow('speed', 'Velocidade', speeds)}
      ${numRow('volume', 'Volume %', 0, 200)}
      ${numRow('fadeIn', 'Entrada (s)', 0, 10, 0.1)}
      ${numRow('fadeOut', 'Saída (s)', 0, 10, 0.1)}
      ${numRow('trimIn', 'Começa em (s)', 0, Math.max(1, Math.floor(mediaSourceDur(L) === Infinity ? 60 : mediaSourceDur(L))), 0.1)}
      <p class="hint">${info}</p>
      ${rec && rec.buffer ? '<div class="actions"><button class="btn btn-small btn-ai" data-act="captions">Gerar legendas (IA)</button></div>' : ''}
      ${L.type === 'audio' ? '<div class="actions"><button class="btn btn-small" data-act="replace-media">Trocar arquivo</button><button class="btn btn-small" data-act="fit-project">Projeto do tamanho da música</button></div>' : ''}
    </div>`;
  }

  const times = kfTimes(L);
  const kfSel = S.selKf && S.selKf.id === L.id && times.some(t => Math.abs(t - S.selKf.t) < 1e-4) ? S.selKf.t : null;
  let kfBox = '';
  if (kfSel != null) {
    const first = Object.values(L.kf).flat().find(k => Math.abs(k.t - kfSel) < 0.5 / P().fps);
    kfBox = `<div class="sec kf-box"><h3>Keyframe em ${kfSel.toFixed(2)}s</h3>
      <div class="row plain"><label for="kf-ease">Curva</label><select class="field" id="kf-ease" data-kfease>${Object.entries(EASE_LABELS).map(([v, t]) => `<option value="${v}"${first && first.e === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <canvas class="curve" id="curveCv" aria-label="Editor de curva: arraste as bolinhas"></canvas>
      <p class="hint">A curva define como o movimento vai deste keyframe até o próximo. Arraste as bolinhas para criar a sua.</p>
      <div class="actions"><button class="btn btn-small btn-danger" data-act="kf-delete">Excluir keyframe</button><button class="btn btn-small" data-act="kf-deselect">Fechar</button></div></div>`;
  }

  const banned = descendants(L);
  const parents = P().layers.filter(o => !banned.has(o.id) && VISUAL(o.type));
  const visual = VISUAL(L.type);
  const look = visual && L.type !== 'group';

  return `
  <div class="sec"><div class="panel-title"><i class="type-dot ${L.type}"></i><input class="field" id="layer-name" data-name value="${esc(L.name)}" aria-label="Nome da camada"></div>
    ${L.codeKf && L.codeKf.length ? `<p class="hint code-note">${L.fromCode ? 'Criada' : 'Animada'} pelo código (${L.codeKf.map(k => CODE_UNITS[k][0]).join(', ')}). Para mudar o movimento, edite em <button class="linkish" data-act="open-code">Código</button>.</p>` : ''}</div>
  ${kfBox}
  ${content ? `<div class="sec"><h3>${TYPE_NAMES[L.type]}</h3>${content}</div>` : ''}
  ${media}
  ${visual ? `<div class="sec"><h3>Transformação <button class="btn btn-small" data-act="kf-all" title="Keyframe em todas (tecla K)">◆ Todas</button></h3>${TRANSFORM.map(propRow).join('')}
    <div class="row plain"><label>Espelhar</label><div class="actions"><button class="btn btn-small${s.flipH ? ' btn-primary' : ''}" data-act="flip-h" title="Inverter horizontalmente">⇄ Horizontal</button><button class="btn btn-small${s.flipV ? ' btn-primary' : ''}" data-act="flip-v" title="Inverter verticalmente">⇅ Vertical</button></div></div>
    <div class="row plain"><label for="s-parent">Seguir camada</label><select id="s-parent" data-parent><option value="">Nenhuma</option>${parents.map(o => `<option value="${o.id}"${L.parent === o.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div></div>` : ''}
  ${look ? `<div class="sec"><h3>Efeitos</h3>${propRow('blur')}${propRow('glow')}${colorRow('glowColor', 'Cor do brilho')}
    ${selectRow('blend', 'Mistura', BLENDS)}
    ${checkRow('clip', 'Recortar na camada de baixo (máscara)')}</div>
  <div class="sec"><h3>Cor</h3>${COLOR_PROPS.map(propRow).join('')}</div>
  <div class="sec"><h3>Looks de cor</h3>
    ${selectRow('colorLook', 'Estilo', Object.fromEntries(Object.entries(COLOR_LOOKS).map(([k, v]) => [k, v.label])))}
    ${numRow('lookIntensity', 'Intensidade %', 0, 100)}
    <p class="hint">O estilo se combina com os ajustes de cor. Escolha Original para removê-lo.</p>
  </div>
  <div class="sec"><h3>Transições</h3>
    ${selectRow('transitionIn', 'Entrada', L.type === 'image' || L.type === 'video' ? TRANSITIONS : Object.fromEntries(Object.entries(TRANSITIONS).filter(([k]) => k !== 'wipe')))}
    ${numRow('transitionInDuration', 'Duração (s)', 0, 10, 0.1)}
    ${selectRow('transitionOut', 'Saída', L.type === 'image' || L.type === 'video' ? TRANSITIONS : Object.fromEntries(Object.entries(TRANSITIONS).filter(([k]) => k !== 'wipe')))}
    ${numRow('transitionOutDuration', 'Duração (s)', 0, 10, 0.1)}
    <p class="hint">Entrada e saída da camada, sem apagar suas animações. Em clipes curtos, as durações se ajustam para caber.</p>
  </div>
  <div class="sec"><h3>Sombra</h3>${numRow('shadowX', 'Deslocar X', -200, 200)}${numRow('shadowY', 'Deslocar Y', -200, 200)}${numRow('shadowBlur', 'Suavidade', 0, 200)}${numRow('shadowOpacity', 'Opacidade %', 0, 100)}${colorRow('shadowColor', 'Cor')}</div>` : ''}
  ${visual ? `<div class="sec"><h3>Animações prontas</h3>
    <div class="presets">
      <button data-preset="fadeIn">Aparecer suave</button>
      <button data-preset="zoomIn">Entrar com zoom</button>
      <button data-preset="slideLeft">Deslizar da esquerda</button>
      <button data-preset="slideRight">Deslizar da direita</button>
      <button data-preset="slideUp">Deslizar de baixo</button>
      <button data-preset="riseIn">Subir e aparecer</button>
      <button data-preset="drop">Cair quicando</button>
      <button data-preset="blurIn">Surgir do desfoque</button>
      <button data-preset="flash">Clarão de entrada</button>
      <button data-preset="pulse">Pulsar</button>
      <button data-preset="shake">Tremor de impacto</button>
      <button data-preset="spin">Girar 360°</button>
      <button data-preset="zoomOut">Sumir com zoom</button>
      <button data-preset="fadeOut">Sumir no final</button>
      ${L.type === 'path' ? '<button data-preset="drawOn">Desenhar traço</button>' : ''}
    </div>
    <button class="btn btn-small" data-preset="clear">Remover animações</button>
  </div>` : ''}
  <div class="sec"><h3>Tempo na tela</h3>
    <div class="pair"><label class="hint" for="t-start">Começa (s)<input class="field" type="number" id="t-start" data-time="start" step="0.1" min="0"></label>
    <label class="hint" for="t-end">Termina (s)<input class="field" type="number" id="t-end" data-time="end" step="0.1" min="0"></label></div>
  </div>
  <div class="sec"><h3>Camada</h3>
    <div class="actions">
      <button class="btn btn-small" data-act="split" title="Dividir na agulha (S)">Dividir na agulha</button>
      <button class="btn btn-small" data-act="dup">Duplicar</button>
      <button class="btn btn-small" data-act="up">Trazer pra frente</button>
      <button class="btn btn-small" data-act="down">Mandar pra trás</button>
      <button class="btn btn-small btn-danger" data-act="del">Excluir</button>
    </div>
  </div>`;
}

function syncPanel(full) {
  const L = selLayer();
  const active = document.activeElement;
  if (!L) {
    if (!full) return;
    const p = P();
    $('#pj-duration', panel).value = p.duration;
    $('#pj-fps', panel).value = p.fps;
    $('#pj-bg', panel).value = p.background;
    return;
  }
  $$('[data-prop]', panel).forEach(el => { if (el !== active) el.value = round(val(L, el.dataset.prop), 1); });
  $$('[data-kf]', panel).forEach(el => {
    const prop = el.dataset.kf;
    el.classList.toggle('anim', isAnimated(L, prop));
    el.classList.toggle('on', kfIndex(L, prop) >= 0);
  });
  if (full) {
    $$('[data-s]', panel).forEach(el => {
      if (el === active) return;
      if (el.type === 'checkbox') el.checked = !!L.s[el.dataset.s];
      else el.value = L.s[el.dataset.s] ?? '';
    });
    $$('[data-show="grad"]', panel).forEach(el => (el.hidden = !L.s.fillType || L.s.fillType === 'solid'));
    $$('[data-show="fillOn"]', panel).forEach(el => (el.hidden = !L.s.fillOn));
    $$('[data-show="focal"]', panel).forEach(el => (el.hidden = L.s.mediaFit !== 'cover'));
    const ts = $('#t-start', panel), te = $('#t-end', panel);
    if (ts && ts !== active) ts.value = round(L.start, 2);
    if (te && te !== active) te.value = round(L.end, 2);
  }
}

panel.addEventListener('input', e => {
  const el = e.target, L = selLayer();
  if (el.dataset.prop && L) {
    const v = parseFloat(el.value);
    if (Number.isNaN(v)) return;
    const before = kfTimes(L).length;
    setProp(L, el.dataset.prop, v);
    refreshTime();
    if (kfTimes(L).length !== before) renderTimeline();
  } else if (el.dataset.s && L) {
    const key = el.dataset.s;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number' || el.type === 'range') { v = parseFloat(el.value); if (Number.isNaN(v)) return; }
    else v = el.value;
    if (key === 'trimIn') v = clamp(v, 0, Math.max(0, mediaSourceDur(L) - 0.1));
    if (key === 'speed') {
      v = clamp(parseFloat(v) || 1, 0.25, 4);
      const old = Number(L.s.speed) || 1;
      const oldEnd = L.end;
      L.s.speed = v;
      // mantém o mesmo trecho do arquivo: mais rápido encurta o bloco, mais lento alonga
      L.end = clamp(snap(L.start + (L.end - L.start) * old / v), L.start + 0.1, Math.min(P().duration, L.start + mediaRemaining(L)));
      if (L.end !== oldEnd) delete L.s.transitionEnd;
      renderTimeline(); refreshTime(); syncPanel(true);
      return;
    }
    if (['lookIntensity', 'focalX', 'focalY'].includes(key)) v = clamp(v, 0, 100);
    if (['transitionInDuration', 'transitionOutDuration'].includes(key)) v = clamp(v, 0, 10);
    if (key === 'transitionIn' || key === 'transitionInDuration') delete L.s.transitionStart;
    if (key === 'transitionOut' || key === 'transitionOutDuration') delete L.s.transitionEnd;
    L.s[key] = v;
    $$(`[data-s="${key}"]`, panel).forEach(o => { if (o !== el && o.type !== 'checkbox') o.value = v; });
    if (key === 'fillType') $$('[data-show="grad"]', panel).forEach(x => (x.hidden = v === 'solid'));
    if (key === 'fillOn') $$('[data-show="fillOn"]', panel).forEach(x => (x.hidden = !v));
    if (key === 'mediaFit') $$('[data-show="focal"]', panel).forEach(x => (x.hidden = v !== 'cover'));
    if (key === 'clip' || key === 'trimIn') renderTimeline();
    refreshTime();
  } else if (el.dataset.name !== undefined && L) {
    L.name = el.value || TYPE_NAMES[L.type];
    const n = $(`.tl-row[data-id="${L.id}"] .name`);
    if (n) n.textContent = L.name;
  } else if (el.dataset.proj === 'background') {
    P().background = el.value; refreshTime();
  }
});

panel.addEventListener('change', e => {
  const el = e.target, L = selLayer(), p = P();
  if (el.dataset.proj === 'duration') { setDuration(parseFloat(el.value) || p.duration); return; }
  if (el.dataset.proj === 'fps') { p.fps = +el.value; commit(); return; }
  if (el.dataset.parent !== undefined && L) {
    setParent(L, el.value || null);
    commit(); renderTimeline(); renderPanel(); refreshTime();
    return;
  }
  if (el.dataset.time && L) {
    const v = parseFloat(el.value);
    if (!Number.isNaN(v)) {
      if (el.dataset.time === 'start') { L.start = clamp(snap(v), 0, L.end - 0.1); delete L.s.transitionStart; }
      else { L.end = clamp(snap(v), L.start + 0.1, p.duration); delete L.s.transitionEnd; }
    }
    commit(); renderTimeline(); syncPanel(true); refreshTime();
    return;
  }
  if (el.dataset.kfease !== undefined && L && S.selKf) {
    kfsAt(L, S.selKf.t).forEach(k => { k.e = el.value; if (el.value === 'custom' && !k.bz) k.bz = BEZ_OF.easeInOut.slice(); });
    commit(); refreshTime();
    const cv = $('#curveCv', panel); if (cv && cv.redraw) cv.redraw();
    return;
  }
  if (el.dataset.name !== undefined) { commit(); renderTimeline(); return; }
  commit();
});

panel.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const L = selLayer();
  if (b.dataset.kf && L) {
    toggleKf(L, b.dataset.kf);
    commit(); renderTimeline(); refreshTime();
  } else if (b.dataset.aspect) {
    setAspect(b.dataset.aspect);
  } else if (b.dataset.align && L) {
    L.s.align = b.dataset.align; commit(); renderPanel(); refreshTime();
  } else if (b.dataset.preset && L) {
    applyPreset(L, b.dataset.preset);
    commit(); renderTimeline(); renderPanel();
    if (b.dataset.preset !== 'clear') {
      const showAt = { fadeOut: L.end - 0.6, zoomOut: L.end - 0.6, spin: L.start + 0.5, pulse: L.start + 0.25, drawOn: L.start + 0.75, flash: L.start + 0.15, shake: L.start + 0.1 }[b.dataset.preset] ?? L.start + 0.7;
      setTime(clamp(showAt, L.start, L.end));
      toast('Animação aplicada. Dê play para ver.');
    } else refreshTime();
  } else if (b.dataset.act) {
    const act = b.dataset.act;
    if (act === 'kf-all' && L) {
      const allOn = TRANSFORM.every(pr => kfIndex(L, pr) >= 0);
      TRANSFORM.forEach(pr => { if ((kfIndex(L, pr) >= 0) === allOn) toggleKf(L, pr); });
      commit(); renderTimeline(); refreshTime();
    } else if (act === 'kf-delete' && L && S.selKf) {
      deleteKeyframesAt(L, S.selKf.t); S.selKf = null;
      commit(); renderTimeline(); renderPanel(); refreshTime();
    } else if (act === 'kf-deselect') {
      S.selKf = null; renderTimeline(); renderPanel();
    } else if (act === 'split' && L) splitLayer(L);
    else if (act === 'open-code') codeModal();
    else if (act === 'dup' && L) duplicateLayer(L);
    else if (act === 'del' && L) deleteLayer(L);
    else if ((act === 'up' || act === 'down') && L) moveLayer(L, act === 'up' ? -1 : 1);
    else if (act === 'flip-h' && L) { L.s.flipH = !L.s.flipH; commit(); renderPanel(); refreshTime(); }
    else if (act === 'flip-v' && L) { L.s.flipV = !L.s.flipV; commit(); renderPanel(); refreshTime(); }
    else if (act === 'freeze-frame' && L) freezeFrame(L);
    else if (act === 'replace-media' && L) pickMedia(L.type, L.id);
    else if (act === 'remove-bg' && L) removeBackground(L);
    else if (act === 'captions' && L) aiCaptionsPicker();
    else if (act === 'media-ratio' && L) {
      const rec = A.get(L.s.asset);
      if (rec && rec.w) { L.s.h = Math.round(L.s.w * rec.h / rec.w); commit(); syncPanel(true); refreshTime(); }
    } else if (act === 'media-frame' && L) {
      const p = P(), pm = parentMatrix(L, S.time);
      const center = pm.inverse().transformPoint(new DOMPoint(p.width / 2, p.height / 2));
      if (![center.x, center.y].every(Number.isFinite)) { toast('A camada que você segue está com escala zero.'); return; }
      L.s.w = p.width; L.s.h = p.height; L.s.mediaFit = 'cover';
      setProp(L, 'x', center.x); setProp(L, 'y', center.y);
      setProp(L, 'scale', 100 / (mScale(pm) || 1)); setProp(L, 'rotation', -mRot(pm));
      commit(); renderPanel(); renderTimeline(); refreshTime();
    } else if (act === 'media-fill' && L) {
      const rec = A.get(L.s.asset), p = P();
      if (rec && rec.w) {
        const k = Math.max(p.width / rec.w, p.height / rec.h);
        L.s.w = Math.round(rec.w * k); L.s.h = Math.round(rec.h * k);
        L.p.x = p.width / 2; L.p.y = p.height / 2; delete L.kf.x; delete L.kf.y;
        commit(); syncPanel(true); renderTimeline(); refreshTime();
      }
    } else if (act === 'fit-project' && L) {
      const d = mediaRemaining(L);
      if (isFinite(d)) { setDuration(Math.ceil(d * 10) / 10 + L.start); L.end = P().duration; commit(); renderTimeline(); renderPanel(); }
    }
  }
});

function setDuration(d) {
  const p = P();
  d = clamp(d, 0.5, 600);
  const old = p.duration;
  p.duration = d;
  for (const l of p.layers) {
    const oldStart = l.start, oldEnd = l.end;
    if (Math.abs(l.end - old) < 1e-6) l.end = MEDIA(l.type) ? Math.min(d, l.start + mediaRemaining(l)) : d;
    l.end = clamp(l.end, 0.1, d); l.start = clamp(l.start, 0, l.end - 0.1);
    if (l.start !== oldStart) delete l.s.transitionStart;
    if (l.end !== oldEnd) delete l.s.transitionEnd;
  }
  S.time = clamp(S.time, 0, d);
  commit(); renderTimeline(); renderPanel(); refreshTime();
}

/* ======================= animações prontas ======================= */
function applyPreset(L, name) {
  const p = P(), s = L.start, e = L.end;
  const base = prop => (isAnimated(L, prop) ? val(L, prop, e) : L.p[prop]);
  const reset = prop => { const v = base(prop); delete L.kf[prop]; L.p[prop] = v; return v; };
  const add = (prop, t, v, ease) => upsertKf(L, prop, clamp(t, s, e), v, ease);
  if (name === 'clear') { for (const prop of Object.keys(L.kf)) L.p[prop] = val(L, prop); L.kf = {}; return; }
  if (name === 'fadeIn') {
    const op = reset('opacity');
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.6, op || 100);
  } else if (name === 'zoomIn') {
    const sc = reset('scale'), op = reset('opacity');
    add('scale', s, 0, 'back'); add('scale', s + 0.6, sc || 100);
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.3, op || 100);
  } else if (name === 'slideLeft') {
    const x = reset('x');
    add('x', s, x - p.width * 0.75, 'back'); add('x', s + 0.7, x);
  } else if (name === 'slideRight') {
    const x = reset('x');
    add('x', s, x + p.width * 0.75, 'back'); add('x', s + 0.7, x);
  } else if (name === 'slideUp') {
    const y = reset('y');
    add('y', s, y + p.height * 0.7, 'back'); add('y', s + 0.7, y);
  } else if (name === 'riseIn') {
    const y = reset('y'), op = reset('opacity');
    add('y', s, y + p.height * 0.08, 'easeOut'); add('y', s + 0.6, y);
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.5, op || 100);
  } else if (name === 'drop') {
    const y = reset('y');
    add('y', s, y - p.height * 0.6, 'bounce'); add('y', s + 1, y);
  } else if (name === 'blurIn') {
    reset('blur'); const op = reset('opacity');
    add('blur', s, 40, 'easeOut'); add('blur', s + 0.7, 0);
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.4, op || 100);
  } else if (name === 'flash') {
    reset('brightness'); const op = reset('opacity');
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.1, op || 100);
    add('brightness', s, 260, 'easeOut'); add('brightness', s + 0.45, 100);
  } else if (name === 'pulse') {
    const sc = reset('scale') || 100;
    let i = 0;
    for (let t = s; t <= e + 1e-6; t = round(t + 0.5, 4)) add('scale', t, i++ % 2 ? sc * 1.12 : sc, 'easeInOut');
  } else if (name === 'shake') {
    const x0 = reset('x'), y0 = reset('y');
    const d = Math.max(12, Math.round(p.width * 0.02));
    add('x', s, x0); add('y', s, y0);
    add('x', s + 0.05, x0 - d); add('y', s + 0.05, y0 + d);
    add('x', s + 0.1, x0 + d); add('y', s + 0.1, y0 - d);
    add('x', s + 0.16, x0 - Math.round(d / 2)); add('y', s + 0.16, y0 + Math.round(d / 2));
    add('x', s + 0.24, x0); add('y', s + 0.24, y0);
  } else if (name === 'spin') {
    const r = reset('rotation');
    add('rotation', s, r, 'linear'); add('rotation', e, r + 360, 'linear');
  } else if (name === 'drawOn') {
    delete L.kf.trim; L.p.trim = 100;
    add('trim', s, 0, 'easeInOut'); add('trim', Math.min(e, s + 1.5), 100);
  } else if (name === 'zoomOut') {
    const sc = isAnimated(L, 'scale') ? val(L, 'scale', Math.max(s, e - 0.5)) : L.p.scale;
    const op = isAnimated(L, 'opacity') ? val(L, 'opacity', Math.max(s, e - 0.5)) : L.p.opacity;
    add('scale', Math.max(s, e - 0.5), sc, 'easeIn'); add('scale', e, 0);
    add('opacity', Math.max(s, e - 0.5), op, 'easeIn'); add('opacity', e, 0);
  } else if (name === 'fadeOut') {
    const op = isAnimated(L, 'opacity') ? val(L, 'opacity', Math.max(s, e - 0.5)) : L.p.opacity;
    add('opacity', Math.max(s, e - 0.5), op, 'easeIn'); add('opacity', e, 0);
  }
}

/* ======================= camadas ======================= */
function select(id) {
  if (S.sel !== id) { S.selKf = null; panel.scrollTop = 0; }
  S.sel = id;
  renderTimeline(); renderPanel(); drawOverlay();
}

function addLayer(L, keepTiming) {
  const p = P();
  if (!keepTiming) {
    L.start = clamp(snap(S.time), 0, Math.max(0, p.duration - 0.5));
    if (L.start > 0 && p.duration - L.start < 1) L.start = 0;
    L.end = p.duration;
  }
  const sel = selLayer();
  p.layers.splice(sel ? p.layers.indexOf(sel) : 0, 0, L);
  commit();
  select(L.id);
  refreshTime();
}

function splitLayer(L, t = S.time) {
  L = L || selLayer();
  if (!L) { toast('Selecione uma camada para dividir.'); return; }
  const cut = clamp(snap(t), 0, P().duration);
  if (cut <= L.start + 0.05 || cut >= L.end - 0.05) {
    toast('Posicione o cursor dentro da camada para dividir.');
    return;
  }
  const L2 = JSON.parse(JSON.stringify(L));
  L2.id = uid();
  L2.name = L.name + ' (parte 2)';
  const origEnd = L.end;
  // Preserve a transição externa mesmo quando o corte ocorre dentro dela.
  const transitionStart = L.s.transitionStart ?? L.start;
  const transitionEnd = L.s.transitionEnd ?? origEnd;
  for (const part of [L, L2]) {
    part.s.transitionStart = transitionStart;
    part.s.transitionEnd = transitionEnd;
  }
  L.end = cut;
  L2.start = cut;
  L2.end = origEnd;

  if (MEDIA(L.type)) {
    const sp = L.s.speed || 1;
    L2.s.trimIn = round((L.s.trimIn || 0) + (cut - L.start) * sp, 4);
  }

  // os keyframes usam tempo absoluto: as duas partes mantêm todos eles,
  // então a animação continua idêntica dos dois lados do corte
  const p = P();
  const idx = p.layers.indexOf(L);
  p.layers.splice(idx, 0, L2);
  commit();
  select(L2.id);
  renderTimeline();
  renderPanel();
  refreshTime();
  toast('Camada dividida.');
}

function freezeFrame(L) {
  L = L || selLayer();
  if (!L || L.type !== 'video') { toast('Selecione um vídeo para congelar o quadro.'); return; }
  const v = VIDS.get(L.id) || videoFor(L);
  if (!v || v.readyState < 2) { toast('Aguarde o vídeo carregar.'); return; }
  const vw = v.videoWidth || L.s.w, vh = v.videoHeight || L.s.h;
  const fc = document.createElement('canvas');
  fc.width = vw; fc.height = vh;
  const fctx = fc.getContext('2d');
  fctx.drawImage(v, 0, 0, vw, vh);
  fc.toBlob(async blob => {
    if (!blob) { toast('Não foi possível capturar o quadro.'); return; }
    try {
      const rec = await registerAsset(blob, 'image', `${L.name} (quadro)`);
      const p = P();
      const cut = snap(S.time);
      const imgL = makeLayer('image', {
        name: `${L.name} (quadro)`,
        parent: L.parent,
        start: cut,
        end: clamp(snap(cut + 2), cut + 0.5, p.duration),
        p: { ...L.p, x: val(L, 'x'), y: val(L, 'y'), scale: val(L, 'scale'), rotation: val(L, 'rotation'), opacity: val(L, 'opacity') },
        s: { asset: rec.id, w: L.s.w, h: L.s.h, flipH: !!L.s.flipH, flipV: !!L.s.flipV, mediaFit: L.s.mediaFit, focalX: L.s.focalX, focalY: L.s.focalY, colorLook: L.s.colorLook, lookIntensity: L.s.lookIntensity },
      });
      addLayer(imgL, true);
      toast('Quadro congelado criado como camada.');
    } catch {
      toast('Erro ao congelar quadro.');
    }
  }, 'image/png');
}

function duplicateLayer(L) {
  const c = JSON.parse(JSON.stringify(L));
  c.id = uid(); c.name = L.name + ' cópia';
  if (VISUAL(L.type)) { c.p.x += 30; c.p.y += 30; }
  const p = P();
  p.layers.splice(p.layers.indexOf(L), 0, c);
  commit(); select(c.id); refreshTime();
}

function deleteLayer(L) {
  const p = P();
  for (const o of p.layers) if (o.parent === L.id) setParent(o, L.parent);
  p.layers.splice(p.layers.indexOf(L), 1);
  S.sel = null; S.selKf = null;
  commit(); renderTimeline(); renderPanel(); refreshTime();
  toast('Camada excluída. Ctrl+Z ou ↶ desfaz.');
}

function moveLayer(L, dir) {
  const a = P().layers, i = a.indexOf(L), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit(); renderTimeline(); refreshTime();
}

function setAspect(aspect) {
  const p = P();
  const [w, h] = ASPECTS[aspect];
  const fx = w / p.width, fy = h / p.height;
  for (const L of p.layers) {
    if (L.parent) continue;
    L.p.x *= fx; L.p.y *= fy;
    (L.kf.x || []).forEach(k => (k.v *= fx));
    (L.kf.y || []).forEach(k => (k.v *= fy));
  }
  Object.assign(p, { aspect, width: w, height: h });
  commit(); fitStage(); renderPanel(); refreshTime();
}

/* adicionar */
let pendingMedia = null;
const mediaInput = $('#mediaInput');
function pickMedia(kind, replaceId = null) {
  pendingMedia = { kind, replaceId };
  mediaInput.accept = kind + '/*';
  mediaInput.click();
}
$$('[data-add]').forEach(b => b.addEventListener('click', () => {
  const type = b.dataset.add;
  if (type === 'image' || type === 'video' || type === 'audio') { pickMedia(type); return; }
  if (type === 'path') { setPen(!S.pen); return; }
  addLayer(makeLayer(type));
}));

mediaInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !pendingMedia) return;
  const { kind, replaceId } = pendingMedia;
  pendingMedia = null;
  const fileKind = file.type.split('/')[0];
  if (fileKind && fileKind !== kind) { toast(`Esse arquivo não é ${kind === 'image' ? 'uma imagem' : kind === 'video' ? 'um vídeo' : 'um áudio'}.`); return; }
  toast('Carregando arquivo…');
  try {
    const blob = kind === 'image' ? await shrinkImage(file) : file;
    const rec = await registerAsset(blob, kind, file.name);
    if ((kind === 'audio' || kind === 'video') && !rec.duration && kind === 'audio') throw new Error('sem duração');
    const p = P();
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || TYPE_NAMES[kind];
    const existing = replaceId && byId(replaceId);
    if (existing) {
      existing.s.asset = rec.id;
      if (rec.w) existing.s.h = Math.round(existing.s.w * rec.h / rec.w);
      existing.s.trimIn = 0;
      if (MEDIA(kind)) existing.end = Math.min(p.duration, existing.start + (rec.duration || p.duration));
      commit(); renderPanel(); renderTimeline(); refreshTime();
      return;
    }
    if (kind === 'image' || kind === 'video') {
      const fit = Math.min(p.width * (kind === 'video' ? 1 : 0.7) / rec.w, p.height * (kind === 'video' ? 1 : 0.5) / rec.h, kind === 'video' ? 10 : 1);
      const L = makeLayer(kind, { name, s: { asset: rec.id, w: Math.round(rec.w * fit), h: Math.round(rec.h * fit) } });
      if (kind === 'video') growForMedia(rec.duration, L);
      addLayer(L, kind === 'video');
    } else {
      const L = makeLayer('audio', { name, s: { asset: rec.id } });
      growForMedia(rec.duration, L);
      addLayer(L, true);
    }
    toast(rec.buffer || kind === 'image' ? 'Pronto.' : 'Adicionado. O som deste vídeo não pôde ser lido.');
  } catch {
    toast('Não consegui abrir esse arquivo. Tente outro formato (MP4, MP3, PNG, JPG).');
  }
});

/* coloca a mídia a partir do cursor e aumenta o projeto se ela for mais longa */
function growForMedia(dur, L) {
  const p = P();
  L.start = snap(S.time >= p.duration - 0.5 ? 0 : S.time);
  if (!dur) { L.end = p.duration; return; }
  const need = Math.min(600, Math.ceil((L.start + dur) * 10) / 10);
  if (need > p.duration) {
    const old = p.duration;
    p.duration = need;
    for (const l of p.layers) if (Math.abs(l.end - old) < 1e-6 && !MEDIA(l.type)) l.end = need;
    toast(`O projeto aumentou para ${need}s para caber o arquivo.`);
  }
  L.end = Math.min(p.duration, L.start + dur);
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 2048;
      if (img.naturalWidth <= max && img.naturalHeight <= max) return resolve(file);
      const k = max / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('imagem'))), file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.9);
    };
    img.src = url;
  });
}

/* ======================= desfazer / salvar ======================= */
const snapshot = () => JSON.stringify(P());
function commit() {
  const s = snapshot();
  if (S.undo[S.undo.length - 1] === s) return;
  S.undo.push(s);
  if (S.undo.length > 100) S.undo.shift();
  S.redo = [];
  updateUndoBtns();
  scheduleSave();
}
function restore(json) {
  S.project = normalize(JSON.parse(json));
  if (!selLayer()) { S.sel = null; S.selKf = null; }
  S.time = clamp(S.time, 0, P().duration);
  fitStage(); renderTimeline(); renderPanel(); refreshTime(); updateUndoBtns(); scheduleSave();
  $('#projectName').value = P().name;
}
function undo() { if (S.undo.length < 2) return; S.redo.push(S.undo.pop()); restore(S.undo[S.undo.length - 1]); }
function redo() { if (!S.redo.length) return; const s = S.redo.pop(); S.undo.push(s); restore(s); }
function updateUndoBtns() { $('#btnUndo').disabled = S.undo.length < 2; $('#btnRedo').disabled = !S.redo.length; }
$('#btnUndo').onclick = undo;
$('#btnRedo').onclick = redo;

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, snapshot()); } catch { /* armazenamento indisponível */ } }, 600);
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && Array.isArray(p.layers) ? p : null;
  } catch { return null; }
}

function setProject(p, fresh) {
  if (S.project) pause();
  VIDS.forEach(v => v.pause()); VIDS.clear();
  S.project = normalize(p); S.sel = null; S.selKf = null; S.time = 0;
  S.undo = [snapshot()]; S.redo = [];
  $('#projectName').value = P().name;
  fitStage(); renderTimeline(); renderPanel(); refreshTime(); updateUndoBtns(); scheduleSave();
  loadAllAssets().then(() => { if (fresh) cleanupAssets(); });
}
$('#projectName').addEventListener('change', e => { P().name = e.target.value.trim() || 'Projeto sem título'; e.target.value = P().name; commit(); });

/* ======================= exemplo inicial ======================= */
function demoProject() {
  const p = newProject('9:16');
  p.name = 'Exemplo: abertura';
  p.duration = 6;
  S.project = p;
  const kf = pairs => pairs.map(([t, v, e]) => ({ t, v, e: e || 'easeInOut' }));
  p.layers = [
    makeLayer('text', {
      name: 'Título', p: { y: 820, glow: 40 },
      s: { text: 'MOTION', font: 'Unbounded', size: 190, weight: 900, color: '#ffffff', glowColor: '#ffb547', anim: 'pop' },
      kf: { opacity: kf([[5.4, 100, 'easeIn'], [6, 0]]), scale: kf([[0, 90, 'easeOut'], [5.4, 100]]) },
    }),
    makeLayer('text', {
      name: 'Subtítulo', start: 0.7, p: { y: 1000 },
      s: { text: 'feito no navegador', font: 'Figtree', size: 64, weight: 600, color: '#ffb547', anim: 'rise' },
      kf: { opacity: kf([[5.4, 100, 'easeIn'], [6, 0]]) },
    }),
    makeLayer('rect', {
      name: 'Linha', p: { y: 1090 },
      s: { w: 520, h: 8, radius: 4, fill: '#ffffff' },
      kf: { x: kf([[0.4, -400, 'back'], [1.2, 540]]), opacity: kf([[0.4, 60], [5.4, 60, 'easeIn'], [6, 0]]) },
    }),
    makeLayer('star', {
      name: 'Estrela', p: { x: 540, y: 1460, glow: 30 },
      s: { w: 220, fill: '#ffb547', fill2: '#ff6b4a', fillType: 'radial', glowColor: '#ffb547' },
      kf: { rotation: kf([[0, 0, 'linear'], [6, 360]]), scale: kf([[1, 0, 'back'], [1.6, 100], [5.4, 100, 'easeIn'], [6, 0]]) },
    }),
    makeLayer('ellipse', {
      name: 'Luz azul', p: { y: 560, opacity: 45, blur: 70 },
      s: { w: 820, h: 820, fill: '#4c7dff', blend: 'screen' },
      kf: { x: kf([[0, 160], [6, 920]]) },
    }),
    makeLayer('ellipse', {
      name: 'Luz coral', p: { y: 1420, opacity: 40, blur: 80 },
      s: { w: 760, h: 760, fill: '#ff6b4a', blend: 'screen' },
      kf: { x: kf([[0, 940], [6, 160]]) },
    }),
  ];
  return p;
}

/* ======================= exportação ======================= */
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const fileBase = () => (P().name || 'motion').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'motion';
const hasSound = () => P().layers.some(L => MEDIA(L.type) && L.visible && !L.s.muted && (L.s.volume ?? 100) > 0 && A.get(L.s.asset)?.buffer);

async function exportVideo(forceMime) {
  if (S.exporting) return;
  if (!window.MediaRecorder || !canvas.captureStream) {
    showModal('Exportação indisponível', '<p>Este navegador não grava vídeo a partir do canvas. Use o Chrome, Edge ou Firefox atualizados, ou o Safari 14.1+.</p>', [{ label: 'Entendi', cls: 'btn-primary' }]);
    return;
  }
  pause();
  const p = P();
  const sound = hasSound();
  const types = sound
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = forceMime || types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  let cancelled = false;
  showModal('Gerando vídeo…', `<p>Mantenha esta aba aberta e visível. O vídeo é gravado em tempo real (${p.duration}s)${sound ? ', com som' : ''}.</p><div class="progress"><div id="expBar"></div></div>`,
    [{ label: 'Cancelar', keepOpen: true, onClick: () => { cancelled = true; } }]);

  const keepTime = S.time;
  S.exporting = true; drawOverlay();
  S.time = 0; syncMedia(); renderMain(0); drawWatermark(ctx);
  const vstream = canvas.captureStream(p.fps);
  let ac = null, adest = null, sources = [];
  const tracks = [...vstream.getVideoTracks()];
  if (sound) {
    try { ac = audioCtx(); await ac.resume(); adest = ac.createMediaStreamDestination(); tracks.push(...adest.stream.getAudioTracks()); }
    catch { ac = null; }
  }
  const stream = new MediaStream(tracks);
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : { videoBitsPerSecond: 12e6 }); }
  catch { rec = new MediaRecorder(stream); }
  const chunks = [];
  rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => (rec.onstop = r));
  await wait(120);
  rec.start(250);
  if (ac) sources = scheduleAudio(ac, adest, 0);
  const t0 = performance.now();
  await new Promise(resolve => {
    const step = () => {
      if (cancelled) return resolve();
      const t = (performance.now() - t0) / 1000;
      if (t >= p.duration) { S.time = p.duration - 1e-4; renderMain(S.time); drawWatermark(ctx); return resolve(); }
      S.time = t; syncMedia(); renderMain(t); drawWatermark(ctx);
      const bar = $('#expBar');
      if (bar) bar.style.width = (t / p.duration * 100).toFixed(1) + '%';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await wait(200);
  rec.stop();
  await stopped;
  sources.forEach(s => { try { s.stop(); } catch {} });
  stream.getTracks().forEach(t => t.stop());
  S.exporting = false;
  pauseAllVideos();
  S.time = keepTime; refreshTime();
  if (cancelled) { hideModal(); toast('Exportação cancelada.'); return; }

  const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
  if (blob.size < 1024 && ext === 'mp4') {
    hideModal();
    const alt = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
    return exportVideo(alt);
  }
  if (blob.size < 1024) {
    showModal('O vídeo saiu vazio', '<p>O navegador não entregou nenhum quadro. Mantenha a aba visível durante a exportação e tente de novo, de preferência no Chrome.</p>', [{ label: 'Fechar', cls: 'btn-primary' }]);
    return;
  }
  const url = URL.createObjectURL(blob);
  const name = `${fileBase()}.${ext}`;
  const file = new File([blob], name, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const size = blob.size > 1048576 ? (blob.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB';
  showModal('Vídeo pronto', `<video src="${url}" controls playsinline loop></video><p>${ext.toUpperCase()} · ${size} · ${p.width}×${p.height}${ext === 'webm' ? '. Seu navegador gera WEBM; para MP4 use o Chrome recente ou o Safari.' : ''}</p>${S.pro ? '' : '<p>Versão grátis: o vídeo sai com a marca "feito com Motion". <a href="#" id="goPro">Tirar a marca d\'água</a></p>'}`, [
    ...(canShare ? [{ label: 'Compartilhar', keepOpen: true, onClick: () => navigator.share({ files: [file], title: P().name }).catch(() => {}) }] : []),
    { label: 'Baixar vídeo', cls: 'btn-primary', keepOpen: true, onClick: () => download(blob, name) },
    { label: 'Fechar', onClick: () => URL.revokeObjectURL(url) },
  ]);
  const gp = $('#goPro');
  if (gp) gp.onclick = ev => { ev.preventDefault(); hideModal(); setTimeout(() => proModal(), 30); };
}
function exportModal() {
  const p = P();
  const fast = canFastExport();
  const short = Math.min(p.width, p.height);
  const dims = side => { const k = side / short; return `${even(p.width * k)}×${even(p.height * k)}`; };
  // padrão: a resolução do próprio projeto; as outras escalam para mais ou para menos
  const sides = [[720, '720p'], [1080, '1080p'], [2160, '4K']];
  if (!sides.some(([v]) => v === short)) sides.unshift([short, 'Projeto']);
  const resOpts = sides.map(([side, label]) =>
    `<option value="${side}"${side === short ? ' selected' : ''}>${label} (${dims(side)})${side === 2160 && !S.pro ? ' · Pro' : ''}</option>`).join('');
  const fpsOpts = [[24, '24 (cinema)'], [30, '30 (padrão)'], [60, '60 (fluido)']].map(([v, l]) => `<option value="${v}"${p.fps === v ? ' selected' : ''}>${l}</option>`).join('');
  const hints = {
    mp4: fast ? 'Monta o vídeo quadro a quadro, com som: não pula quadros, mesmo com efeitos pesados, e continua mesmo se você trocar de aba.' : 'Este navegador não tem o codificador rápido: o vídeo será gravado em tempo real, com a aba aberta.',
    live: 'Grava em tempo real, como uma tela. Mantenha a aba aberta e visível até terminar.',
    gif: 'Sem som. Bom para figurinhas, prévias e mensagens.',
    png: 'Salva o quadro atual na resolução do projeto.',
  };
  showModal('Exportar', `
    <div class="row plain"><label for="expFmt">Formato</label><select class="field" id="expFmt">
      <option value="mp4">Vídeo MP4${fast ? ' (rápido)' : ''}</option>
      ${fast ? '<option value="live">Vídeo (gravação em tempo real)</option>' : ''}
      <option value="gif">GIF animado</option>
      <option value="png">Imagem PNG do quadro atual</option>
    </select></div>
    <div class="row plain" data-for="mp4"><label for="expRes">Resolução</label><select class="field" id="expRes">${resOpts}</select></div>
    <div class="row plain" data-for="mp4 live"><label for="expFps">Quadros/s</label><select class="field" id="expFps">${fpsOpts}</select></div>
    <div class="row plain" data-for="gif"><label for="expGif">Tamanho</label><select class="field" id="expGif"><option value="320">Pequeno (320 px)</option><option value="480" selected>Médio (480 px)</option><option value="720">Grande (720 px)</option></select></div>
    <label class="check" data-for="gif png"><input type="checkbox" id="expAlpha"> Fundo transparente</label>
    <p class="hint" id="expHint"></p>
    <p class="hint">Duração: ${p.duration} s · ${hasSound() ? 'com som' : 'sem som'}</p>`, [
    { label: 'Cancelar' },
    { label: 'Exportar', cls: 'btn-primary', keepOpen: true, onClick: () => {
      // lê tudo antes de fechar: hideModal() limpa o conteúdo do modal
      const fmt = $('#expFmt').value;
      const fps = parseInt($('#expFps').value, 10) || p.fps;
      const alpha = $('#expAlpha').checked, gifSide = +$('#expGif').value, side = +$('#expRes').value;
      if ((fmt === 'mp4' || fmt === 'live') && fps !== p.fps) { p.fps = fps; commit(); }
      if (fmt === 'png') { hideModal(); exportPng(alpha); return; }
      if (fmt === 'gif') { hideModal(); exportGif({ shortSide: gifSide, transparent: alpha }); return; }
      if (fmt === 'live' || !fast) { hideModal(); exportVideo(); return; }
      if (side > 1080 && !S.pro) { hideModal(); setTimeout(() => proModal('Exportar em 4K é do Motion Pro.'), 30); return; }
      hideModal();
      fastExport({ k: side / short, fps });
    } },
  ]);
  const sync = () => {
    const fmt = $('#expFmt').value;
    $$('[data-for]', $('#modalBody')).forEach(el => (el.hidden = !el.dataset.for.split(' ').includes(fmt)));
    $('#expHint').textContent = hints[fmt];
  };
  $('#expFmt').onchange = sync;
  sync();
}
$('#btnExport').onclick = exportModal;

/* ======================= exportação rápida (WebCodecs) e GIF ======================= */
/* Quadro a quadro, sem tempo real: não pula quadros, não precisa da aba visível e é mais rápido que gravar.
   Vídeo em H.264 (ou VP9 quando o aparelho não tem H.264), som em AAC (ou Opus), tudo num MP4. */
const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js';
const GIFENC_URL = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/dist/gifenc.esm.js';
const even = v => Math.max(2, Math.round(v / 2) * 2);
/* cede a vez ao navegador sem depender de setTimeout, que fica lento com a aba em segundo plano */
const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
const canFastExport = () => 'VideoEncoder' in window && 'VideoFrame' in window && 'AudioEncoder' in window;
const scriptCache = new Map();
function loadScript(src) {
  if (!scriptCache.has(src)) scriptCache.set(src, new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src; el.async = true;
    el.onload = res;
    el.onerror = () => { scriptCache.delete(src); el.remove(); rej(new Error('Não consegui baixar o componente de exportação. Confira a internet.')); };
    document.head.appendChild(el);
  }));
  return scriptCache.get(src);
}

async function pickVideoCodec(w, h, fps) {
  const bitrate = Math.round(clamp(w * h * fps * 0.14, 2e6, 60e6));
  const tries = [
    ['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['avc1.4d0033', 'avc'], ['avc1.4d0028', 'avc'], ['avc1.42003e', 'avc'], ['avc1.42001f', 'avc'],
    ['vp09.00.40.08', 'vp9'], ['vp09.00.10.08', 'vp9'],
  ];
  for (const [codec, mux] of tries) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' };
    if (mux === 'avc') cfg.avc = { format: 'avc' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch { /* tenta o próximo */ }
  }
  return null;
}
async function pickAudioCodec() {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux }; } catch { /* tenta o próximo */ }
  }
  return null;
}

/* mixa todas as faixas de som do projeto offline, sem tocar nada */
async function renderAudioMix(dur) {
  if (!hasSound()) return null;
  const rate = 48000;
  const oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * rate)), rate);
  scheduleAudio(oac, oac.destination, 0, 0);
  return oac.startRendering();
}

async function encodeAudio(buf, acfg, muxer) {
  let err = null;
  const enc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { err = e; } });
  enc.configure(acfg.cfg);
  const rate = buf.sampleRate, total = buf.length, step = 9600;
  const ch0 = buf.getChannelData(0), ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  for (let i = 0; i < total; i += step) {
    if (err) throw err;
    const n = Math.min(step, total - i);
    const data = new Float32Array(n * 2);
    data.set(ch0.subarray(i, i + n), 0);
    data.set(ch1.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / rate * 1e6), data });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
  if (err) throw err;
}

/* posiciona cada vídeo exatamente no quadro pedido e espera ele aparecer */
async function seekVideosExact(t) {
  const waits = [];
  for (const L of P().layers) {
    if (L.type !== 'video' || !L.visible || t < L.start || t > L.end) continue;
    const v = videoFor(L);
    if (!v) continue;
    if (!v.paused) v.pause();
    const rec = A.get(L.s.asset);
    const local = clamp((t - L.start) * (L.s.speed || 1) + (L.s.trimIn || 0), 0, Math.max(0, ((rec && rec.duration) || 1e9) - 0.001));
    if (Math.abs(v.currentTime - local) < 0.25 / P().fps && v.readyState >= 2) continue;
    waits.push(new Promise(res => {
      const done = () => { clearTimeout(to); v.removeEventListener('seeked', done); res(); };
      const to = setTimeout(done, 3000);
      v.addEventListener('seeked', done);
      try { v.currentTime = local; } catch { done(); }
    }));
  }
  await Promise.all(waits);
}

function exportProgress(title) {
  showModal(title, `<p id="expText">Preparando…</p><div class="progress"><div id="expBar"></div></div>`, [
    { label: 'Cancelar', keepOpen: true, onClick: () => { exportProgress.cancelled = true; } },
  ]);
  exportProgress.cancelled = false;
  const started = performance.now();
  return (text, frac) => {
    const bar = $('#expBar'), el = $('#expText');
    if (bar && frac != null) bar.style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%';
    if (!el) return;
    if (frac > 0.04 && frac < 1) {
      const left = (performance.now() - started) / 1000 * (1 - frac) / frac;
      el.textContent = `${text} · faltam ${left < 60 ? Math.ceil(left) + ' s' : Math.ceil(left / 60) + ' min'}`;
    } else el.textContent = text;
  };
}

function fileReady(blob, name, info) {
  const url = URL.createObjectURL(blob);
  const isVideo = blob.type.startsWith('video/');
  const file = new File([blob], name, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const size = blob.size > 1048576 ? (blob.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB';
  showModal(isVideo ? 'Vídeo pronto' : 'Arquivo pronto', `${isVideo ? `<video src="${url}" controls playsinline loop></video>` : `<img class="export-preview" src="${url}" alt="Prévia do arquivo exportado">`}
    <p>${esc(info)} · ${size}</p>
    ${S.pro ? '' : '<p>Versão grátis: sai com a marca "feito com Motion". <a href="#" id="goPro">Tirar a marca d\'água</a></p>'}`, [
    ...(canShare ? [{ label: 'Compartilhar', keepOpen: true, onClick: () => navigator.share({ files: [file], title: P().name }).catch(() => {}) }] : []),
    { label: 'Baixar', cls: 'btn-primary', keepOpen: true, onClick: () => download(blob, name) },
    { label: 'Fechar', onClick: () => URL.revokeObjectURL(url) },
  ]);
  const gp = $('#goPro');
  if (gp) gp.onclick = ev => { ev.preventDefault(); hideModal(); setTimeout(() => proModal(), 30); };
}

async function fastExport({ k = 1, fps = P().fps } = {}) {
  if (S.exporting) return;
  pause();
  const p = P();
  const W = even(p.width * k), H = even(p.height * k);
  const say = exportProgress('Gerando vídeo…');
  const keepTime = S.time;
  S.exporting = true; drawOverlay();
  let venc = null;
  try {
    say('Preparando…', 0);
    await loadScript(MUXER_URL);
    const video = await pickVideoCodec(W, H, fps);
    if (!video) throw Object.assign(new Error('sem codificador'), { fallback: true });
    const audioBuf = await renderAudioMix(p.duration);
    const audio = audioBuf ? await pickAudioCodec() : null;
    const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: video.mux, width: W, height: H, frameRate: fps },
      audio: audio ? { codec: audio.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encErr = null;
    venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { encErr = e; } });
    venc.configure(video.cfg);
    if (audio) { say('Mixando o som…', 0); await encodeAudio(audioBuf, audio, muxer); }

    const ec = document.createElement('canvas');
    ec.width = W; ec.height = H;
    const ectx = ec.getContext('2d');
    const n = Math.max(1, Math.round(p.duration * fps));
    const kRender = W / p.width;
    for (let i = 0; i < n; i++) {
      if (exportProgress.cancelled) break;
      if (encErr) throw encErr;
      const t = Math.min(p.duration - 1e-4, i / fps);
      S.time = t;
      await seekVideosExact(t);
      renderFrame(ectx, t, { k: kRender });
      drawWatermark(ectx);
      const vf = new VideoFrame(ec, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      venc.encode(vf, { keyFrame: i % Math.round(fps * 2) === 0 });
      vf.close();
      while (venc.encodeQueueSize > 4) await yieldNow();
      if (i % 2 === 0) { say(`Quadro ${i + 1} de ${n}`, (i + 1) / n); await yieldNow(); }
    }
    if (exportProgress.cancelled) { try { venc.close(); } catch {} hideModal(); toast('Exportação cancelada.'); return; }
    say('Finalizando o arquivo…', 1);
    await venc.flush();
    if (encErr) throw encErr;
    venc.close();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    const vname = video.mux === 'avc' ? 'H.264' : 'VP9';
    fileReady(blob, `${fileBase()}.mp4`, `MP4 ${vname}${audio ? ' com som' : ''} · ${W}×${H} · ${fps} fps`);
  } catch (err) {
    try { venc && venc.state !== 'closed' && venc.close(); } catch {}
    if (err && err.fallback) {
      hideModal();
      toast('Este aparelho não tem o codificador rápido. Gravando em tempo real.');
      S.exporting = false;
      setTimeout(() => exportVideo(), 50);
      return;
    }
    showModal('Não deu para exportar', `<p>${esc(err && err.message ? err.message : 'Erro desconhecido.')}</p><p>Você pode tentar a gravação em tempo real.</p>`, [
      { label: 'Fechar' }, { label: 'Gravar em tempo real', cls: 'btn-primary', onClick: () => setTimeout(() => exportVideo(), 50) },
    ]);
  } finally {
    S.exporting = false;
    pauseAllVideos();
    S.time = keepTime;
    refreshTime();
  }
}

async function exportGif({ shortSide = 480, fps = 15, transparent = false } = {}) {
  if (S.exporting) return;
  pause();
  const p = P();
  const k = Math.min(1, shortSide / Math.min(p.width, p.height));
  const W = Math.max(2, Math.round(p.width * k)), H = Math.max(2, Math.round(p.height * k));
  const say = exportProgress('Gerando GIF…');
  const keepTime = S.time;
  S.exporting = true; drawOverlay();
  try {
    say('Preparando…', 0);
    const { GIFEncoder, quantize, applyPalette } = await import(GIFENC_URL);
    const ec = document.createElement('canvas');
    ec.width = W; ec.height = H;
    const ectx = ec.getContext('2d', { willReadFrequently: true });
    const gif = GIFEncoder();
    const n = Math.max(1, Math.round(p.duration * fps));
    const format = transparent ? 'rgba4444' : 'rgb565';
    for (let i = 0; i < n; i++) {
      if (exportProgress.cancelled) { hideModal(); toast('Exportação cancelada.'); return; }
      const t = Math.min(p.duration - 1e-4, i / fps);
      S.time = t;
      await seekVideosExact(t);
      renderFrame(ectx, t, { k, transparent });
      drawWatermark(ectx);
      const { data } = ectx.getImageData(0, 0, W, H);
      const palette = quantize(data, 256, { format, oneBitAlpha: transparent });
      const index = applyPalette(data, palette, format);
      const opts = { palette, delay: Math.round(1000 / fps) };
      if (transparent) {
        const ti = palette.findIndex(c => c[3] === 0);
        if (ti >= 0) { opts.transparent = true; opts.transparentIndex = ti; }
      }
      gif.writeFrame(index, W, H, opts);
      say(`Quadro ${i + 1} de ${n}`, (i + 1) / n);
      await yieldNow();
    }
    gif.finish();
    fileReady(new Blob([gif.bytes()], { type: 'image/gif' }), `${fileBase()}.gif`, `GIF ${W}×${H} · ${fps} fps${transparent ? ' · fundo transparente' : ''}`);
  } catch (err) {
    showModal('Não deu para gerar o GIF', `<p>${esc(err && err.message ? err.message : 'Erro desconhecido.')}</p>`, [{ label: 'Fechar', cls: 'btn-primary' }]);
  } finally {
    S.exporting = false;
    pauseAllVideos();
    S.time = keepTime;
    refreshTime();
  }
}

function exportPng(transparent) {
  pause();
  const p = P();
  const c = document.createElement('canvas');
  c.width = p.width; c.height = p.height;
  const cc = c.getContext('2d');
  renderFrame(cc, S.time, { transparent });
  drawWatermark(cc);
  c.toBlob(b => { if (b) download(b, `${fileBase()}-${S.time.toFixed(2)}s.png`); }, 'image/png');
}

/* ======================= IA (Gemini + remoção de fundo) ======================= */
const AI_KEY = 'motion-editor:ai';
const AI_DEFAULT_MODEL = 'gemini-3.8-flash';
const aiCfg = () => { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch { return {}; } };
const saveAiCfg = c => { try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch { /* sem armazenamento */ } };
const isNum = v => typeof v === 'number' && isFinite(v);

function parseJSONLoose(text) {
  const t = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* tenta achar o JSON dentro do texto */ }
  const i = Math.min(...['{', '['].map(c => { const k = t.indexOf(c); return k < 0 ? Infinity : k; }));
  const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (isFinite(i) && j > i) return JSON.parse(t.slice(i, j + 1));
  throw new Error('A IA não respondeu em JSON.');
}

async function gemini(parts, json = true) {
  const cfg = aiCfg();
  if (!cfg.key) throw Object.assign(new Error('Configure sua chave do Gemini primeiro.'), { code: 'nokey' });
  const model = (cfg.model || AI_DEFAULT_MODEL).trim();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.9 } : { temperature: 0.7 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : `Erro ${res.status}`;
    if (res.status === 400 && /api key/i.test(msg)) throw Object.assign(new Error('A chave do Gemini foi recusada. Confira se copiou ela inteira.'), { code: 'nokey' });
    if (res.status === 404) throw new Error(`O modelo "${model}" não existe mais ou não está liberado na sua conta. Troque o modelo nas configurações de IA.`);
    if (res.status === 429) throw new Error('Limite de uso do Gemini atingido. Espere um pouco e tente de novo.');
    throw new Error(msg);
  }
  const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []).map(p => p.text || '').join('');
  if (!text) throw new Error('A IA não devolveu nada. Tente reformular o pedido.');
  return json ? parseJSONLoose(text) : text;
}

function aiSettings(after) {
  const c = aiCfg();
  showModal('Configurar IA', `
    <p>As funções de IA usam o Gemini, do Google, com a sua chave. Ela fica salva só neste aparelho.</p>
    <p>Crie uma chave grátis em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e cole abaixo.</p>
    <label class="hint" for="aiKey">Chave da API<input class="field" id="aiKey" type="password" autocomplete="off" spellcheck="false" value="${esc(c.key || '')}" placeholder="AIza..."></label>
    <label class="hint" for="aiModel">Modelo<input class="field" id="aiModel" spellcheck="false" value="${esc(c.model || AI_DEFAULT_MODEL)}"></label>`, [
    { label: 'Cancelar' },
    { label: 'Salvar', cls: 'btn-primary', onClick: () => {
      saveAiCfg({ key: $('#aiKey').value.trim(), model: $('#aiModel').value.trim() || AI_DEFAULT_MODEL });
      toast('Configuração de IA salva.');
      if (after) setTimeout(after, 50);
    } },
  ]);
}

function aiError(err, retry) {
  if (err && err.code === 'nokey') { aiSettings(retry); return; }
  showModal('A IA não conseguiu', `<p>${esc(err && err.message ? err.message : 'Erro desconhecido.')}</p>`, [
    { label: 'Fechar' }, ...(retry ? [{ label: 'Tentar de novo', cls: 'btn-primary', onClick: () => setTimeout(retry, 50) }] : []),
  ]);
}

function busy(title, text) {
  showModal(title, `<p id="busyText">${esc(text)}</p><div class="progress indeterminate"><div></div></div>`, []);
  return t => { const el = $('#busyText'); if (el) el.textContent = t; };
}

/* ---------- 1. gerar animação a partir de um texto ---------- */
function aiPrompt(request, replace) {
  const p = P();
  return `Você é um motion designer sênior. Crie uma animação para um editor de motion graphics descrito por JSON.

QUADRO: ${p.width}x${p.height} px, origem no canto superior esquerdo. "x" e "y" são o CENTRO da camada. ${replace ? 'Escolha a duração (entre 3 e 15 s).' : `Duração do projeto: ${p.duration} s.`} ${p.fps} quadros/s.

FORMATO DA RESPOSTA (somente JSON, sem comentários):
{"background":"#rrggbb","duration":number,"layers":[CAMADA, ...]}
A primeira camada da lista fica na frente de todas.

CAMADA: {"type":"text|rect|ellipse|star|path","name":string,"start":s,"end":s,"p":{...},"s":{...},"kf":{"prop":[{"t":s,"v":number,"e":ease}]}}
- "p" são valores fixos: x, y, scale (%, 100 = normal), rotation (graus), opacity (0-100), blur (px), glow (0-150, brilho externo), brightness/contrast/saturate (%, 100 = normal), hue (graus), trim (0-100, só "path": quanto do traço aparece).
- "kf" anima qualquer uma dessas propriedades. "t" é o tempo absoluto em segundos. Quando uma propriedade tem keyframes, eles mandam no valor.
- ease: ${Object.keys(EASES).join(', ')}.
- "s" por tipo:
  text: text, font (${FONTS.join(', ')}), size (px), weight (400|600|700|900), color, fillType (solid|linear|radial), fill2, gradAngle, align (left|center|right), stroke (px), strokeColor, glowColor, anim (${Object.keys(TEXT_ANIMS).join(', ')}).
  rect: w, h, radius, fill, fillType, fill2, gradAngle.  ellipse: w, h, fill, fillType, fill2.  star: w, points, inner (0.1-0.9), fill.
  path: points ([[x,y],...] relativos ao centro da camada), stroke, width, fillOn, fill.
  Todos podem ter: blend (${Object.keys(BLENDS).join(', ')}), glowColor, shadowX, shadowY, shadowBlur, shadowColor, shadowOpacity.
- Cores sempre em "#rrggbb".

REGRAS: 3 a 12 camadas. Paleta harmoniosa e contraste legível. Movimento elegante com keyframes (entradas com easeOut/back, saídas com easeIn) e escalonamento entre camadas. Textos curtos, no idioma do pedido. No fim das entradas tudo deve estar dentro do quadro. Use formas e luzes desfocadas (ellipse com blur alto e blend screen) para dar profundidade.

PEDIDO: ${request}`;
}

function sanitizeAI(obj, replace) {
  const p = P();
  const dur = replace && isNum(obj.duration) ? clamp(obj.duration, 1, 60) : p.duration;
  const hex = v => { if (typeof v !== 'string') return null; const m = v.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]; return '#' + h.toLowerCase(); };
  const enums = { font: FONTS, anim: Object.keys(TEXT_ANIMS), blend: Object.keys(BLENDS), fillType: ['solid', 'linear', 'radial'], align: ['left', 'center', 'right'] };
  const layers = [];
  for (const raw of (Array.isArray(obj.layers) ? obj.layers : []).slice(0, 30)) {
    if (!raw || !['text', 'rect', 'ellipse', 'star', 'path'].includes(raw.type)) continue;
    const L = makeLayer(raw.type);
    if (typeof raw.name === 'string' && raw.name.trim()) L.name = raw.name.trim().slice(0, 40);
    L.start = clamp(isNum(raw.start) ? raw.start : 0, 0, dur - 0.1);
    L.end = clamp(isNum(raw.end) ? raw.end : dur, L.start + 0.1, dur);
    const clampP = (k, v) => {
      if (k === 'x') return clamp(v, -p.width, p.width * 2);
      if (k === 'y') return clamp(v, -p.height, p.height * 2);
      const d = PROPS[k]; return d.min != null ? clamp(v, d.min, d.max) : v;
    };
    for (const k of Object.keys(PROPS)) if (raw.p && isNum(raw.p[k])) L.p[k] = clampP(k, raw.p[k]);
    for (const [k, v] of Object.entries(raw.s || {})) {
      if (!(k in L.s) || k === 'asset' || k === 'clip') continue;
      const cur = L.s[k];
      if (k === 'points') {
        if (Array.isArray(v)) L.s.points = v.filter(q => Array.isArray(q) && isNum(q[0]) && isNum(q[1])).slice(0, 400).map(q => [clamp(q[0], -p.width * 2, p.width * 2), clamp(q[1], -p.height * 2, p.height * 2)]);
      } else if (enums[k]) { if (enums[k].includes(String(v))) L.s[k] = String(v); }
      else if (typeof cur === 'number' && isNum(v)) L.s[k] = clamp(v, -10000, 10000);
      else if (typeof cur === 'boolean') L.s[k] = !!v;
      else if (typeof cur === 'string' && hex(cur)) { const h = hex(v); if (h) L.s[k] = h; }
      else if (k === 'text' && typeof v === 'string') L.s.text = v.slice(0, 300);
    }
    if (L.type === 'text' && isNum(L.s.weight)) L.s.weight = [400, 600, 700, 900].reduce((a, b) => (Math.abs(b - L.s.weight) < Math.abs(a - L.s.weight) ? b : a));
    for (const [k, arr] of Object.entries(raw.kf || {})) {
      if (!PROPS[k] || !Array.isArray(arr)) continue;
      const ks = arr.filter(q => q && isNum(q.t) && isNum(q.v)).slice(0, 60)
        .map(q => ({ t: round(clamp(q.t, 0, dur), 4), v: clampP(k, q.v), e: EASES[q.e] ? q.e : 'easeInOut' }))
        .sort((a, b) => a.t - b.t);
      if (ks.length) L.kf[k] = ks;
    }
    if (L.type === 'path' && L.s.points.length < 2) continue;
    layers.push(L);
  }
  if (!layers.length) throw new Error('A IA não criou nenhuma camada válida. Tente descrever de outro jeito.');
  return { layers, dur, background: hex(obj.background) };
}

function aiGenerate() {
  const ideas = ['Abertura de canal de música eletrônica com título neon', 'Promoção de pizza: 50% OFF só hoje', 'Contagem regressiva 3, 2, 1 com explosão de cores', 'Intro elegante para loja de roupas'];
  showModal('Criar animação com IA', `
    <p>Descreva o que você quer. A IA monta as camadas e os keyframes, e depois você edita tudo normalmente.</p>
    <textarea id="aiReq" rows="4" placeholder="Ex.: título &quot;NOITE DO FUNK&quot; entrando com zoom e brilho roxo, estrelas girando"></textarea>
    <div class="actions">${ideas.map(i => `<button class="chip" data-idea="${esc(i)}">${esc(i)}</button>`).join('')}</div>
    <label class="check"><input type="checkbox" id="aiReplace" ${P().layers.length ? '' : 'checked'}> Começar do zero (substitui o projeto atual)</label>`, [
    { label: 'Cancelar' },
    { label: 'Configurar chave', onClick: () => setTimeout(() => aiSettings(aiGenerate), 50) },
    { label: 'Gerar', cls: 'btn-primary', keepOpen: true, onClick: () => {
      const req = $('#aiReq').value.trim();
      if (!req) { toast('Descreva a animação primeiro.'); return; }
      runGenerate(req, $('#aiReplace').checked);
    } },
  ]);
  $$('[data-idea]').forEach(b => (b.onclick = () => { $('#aiReq').value = b.dataset.idea; $('#aiReq').focus(); }));
  setTimeout(() => $('#aiReq') && $('#aiReq').focus(), 30);
}

async function runGenerate(req, replace) {
  busy('Criando sua animação…', 'A IA está montando as camadas. Leva de 5 a 30 segundos.');
  try {
    const obj = await gemini([{ text: aiPrompt(req, replace) }]);
    const { layers, dur, background } = sanitizeAI(obj, replace);
    const p = P();
    if (replace) {
      p.layers = [];
      p.duration = dur;
      if (background) p.background = background;
      p.name = req.slice(0, 40);
      $('#projectName').value = p.name;
    }
    p.layers.unshift(...layers);
    S.sel = null; S.selKf = null;
    commit();
    hideModal();
    renderTimeline(); renderPanel(); setTime(0);
    play();
    toast(`${layers.length} camadas criadas. Toque em qualquer uma para editar.`);
  } catch (err) {
    aiError(err, () => runGenerate(req, replace));
  }
}

/* ---------- 2. legendas automáticas ---------- */
function encodeWav(buf) {
  const data = buf.getChannelData(0), n = data.length;
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, clamp(data[i], -1, 1) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}
async function sliceToWav(buffer, from, dur) {
  const rate = 16000;
  const oc = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * rate)), rate);
  const src = oc.createBufferSource();
  src.buffer = buffer; src.connect(oc.destination); src.start(0, from, dur);
  return encodeWav(await oc.startRendering());
}
const blobToB64 = async b => (await blobToDataURL(b)).split(',')[1];

function aiCaptionsPicker() {
  const media = P().layers.filter(L => MEDIA(L.type) && A.get(L.s.asset) && A.get(L.s.asset).buffer);
  if (!media.length) {
    showModal('Nada para legendar', '<p>Adicione um vídeo com fala ou uma música/narração primeiro. As legendas são criadas a partir do som.</p>', [{ label: 'Entendi', cls: 'btn-primary' }]);
    return;
  }
  const sel = selLayer();
  const first = media.includes(sel) ? sel : media[0];
  showModal('Legendas automáticas', `
    <p>A IA escuta o som, transcreve e cria as legendas sincronizadas, já animadas no estilo Reels.</p>
    <div class="row plain"><label for="capLayer">Áudio de</label><select id="capLayer">${media.map(L => `<option value="${L.id}"${L === first ? ' selected' : ''}>${esc(L.name)}</option>`).join('')}</select></div>
    <div class="row plain"><label for="capStyle">Estilo</label><select id="capStyle"><option value="pop">Estourar letras</option><option value="words">Palavra por palavra</option><option value="none">Sem animação</option></select></div>`, [
    { label: 'Cancelar' },
    { label: 'Criar legendas', cls: 'btn-primary', keepOpen: true, onClick: () => runCaptions(byId($('#capLayer').value), $('#capStyle').value) },
  ]);
}

async function runCaptions(L, style) {
  const say = busy('Criando legendas…', 'Preparando o áudio…');
  try {
    const rec = A.get(L.s.asset);
    const from = L.s.trimIn || 0;
    const len = Math.min(L.end - L.start, rec.buffer.duration - from);
    const CHUNK = 240;
    const segs = [];
    for (let off = 0; off < len - 0.05; off += CHUNK) {
      const d = Math.min(CHUNK, len - off);
      say(len > CHUNK ? `Transcrevendo parte ${Math.floor(off / CHUNK) + 1} de ${Math.ceil(len / CHUNK)}…` : 'Transcrevendo… leva alguns segundos.');
      const wav = await sliceToWav(rec.buffer, from + off, d);
      const res = await gemini([
        { text: `Transcreva a fala deste áudio de ${d.toFixed(1)} segundos. Responda só JSON no formato {"segments":[{"start":0.0,"end":1.2,"text":"..."}]}. Cada segmento deve ter no máximo 5 palavras, com tempos em segundos contados do início deste áudio, sem sobreposição, no idioma falado e com pontuação natural. Se não houver fala, devolva {"segments":[]}.` },
        { inline_data: { mime_type: 'audio/wav', data: await blobToB64(wav) } },
      ]);
      const arr = Array.isArray(res) ? res : res.segments || [];
      for (const s of arr) if (s && isNum(s.start) && typeof s.text === 'string' && s.text.trim()) {
        const st = clamp(s.start, 0, d), en = clamp(isNum(s.end) ? s.end : st + 1.5, st + 0.2, d + 0.5);
        segs.push({ start: off + st, end: off + en, text: s.text.trim() });
      }
    }
    if (!segs.length) throw new Error('Não encontrei fala nesse áudio.');
    const p = P(), m = Math.min(p.width, p.height);
    const group = makeLayer('group', { name: 'Legendas', p: { x: p.width / 2, y: Math.round(p.height * 0.74) } });
    group.start = 0; group.end = p.duration;
    const caps = segs.map((s, i) => {
      const next = segs[i + 1];
      const start = clamp(L.start + s.start, 0, p.duration - 0.05);
      const end = clamp(Math.min(L.start + s.end + 0.15, next ? L.start + next.start : Infinity), start + 0.15, p.duration);
      return makeLayer('text', {
        name: `Legenda ${i + 1}`, parent: group.id, start, end, p: { x: 0, y: 0 },
        s: { text: s.text, font: 'Montserrat', size: Math.round(m * 0.075), weight: 900, color: '#ffffff', stroke: Math.round(m * 0.008), strokeColor: '#000000', anim: style, shadowY: 6, shadowBlur: 12, shadowOpacity: 50 },
      });
    });
    p.layers.unshift(group, ...caps);
    S.sel = group.id; S.selKf = null;
    commit(); hideModal(); renderTimeline(); renderPanel(); setTime(caps[0].start);
    toast(`${caps.length} legendas criadas. Mova o grupo "Legendas" para reposicionar todas.`);
  } catch (err) {
    aiError(err, () => runCaptions(L, style));
  }
}

/* ---------- 3. remover fundo ---------- */
const BG_LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
async function removeBackground(L) {
  const rec = A.get(L.s.asset);
  if (!rec) { toast('Imagem não encontrada neste aparelho.'); return; }
  const say = busy('Removendo o fundo…', 'Baixando o modelo de IA (só na primeira vez, cerca de 40 MB)…');
  try {
    const lib = await import(BG_LIB);
    const out = await lib.removeBackground(rec.blob, {
      progress: (key, cur, total) => { if (total) say(`${key.startsWith('fetch') ? 'Baixando o modelo' : 'Processando'}… ${Math.round(cur / total * 100)}%`); },
      output: { format: 'image/png' },
    });
    const name = (P().assets[L.s.asset] && P().assets[L.s.asset].name) || 'imagem';
    const nrec = await registerAsset(out, 'image', name.replace(/\.[^.]+$/, '') + ' sem fundo.png');
    L.s.asset = nrec.id;
    commit(); hideModal(); renderPanel(); refreshTime();
    toast('Fundo removido. Ctrl+Z ou ↶ volta a imagem original.');
  } catch (err) {
    hideModal();
    showModal('Não deu para remover o fundo', `<p>${esc(err && err.message ? err.message : 'Erro desconhecido.')}</p><p>Essa função baixa um modelo da internet na primeira vez. Confira a conexão e tente de novo.</p>`, [{ label: 'Fechar' }, { label: 'Tentar de novo', cls: 'btn-primary', onClick: () => setTimeout(() => removeBackground(L), 50) }]);
  }
}

function aiMenu() {
  const L = selLayer();
  const img = L && L.type === 'image';
  showModal('Ferramentas de IA', `<div class="ai-list">
    <button class="ai-item" data-ai="gen"><b>Criar animação com texto</b><span>Descreva e a IA monta camadas e keyframes.</span></button>
    <button class="ai-item" data-ai="code"><b>Animar com código (GSAP)</b><span>A IA escreve o código da animação e o editor transforma em keyframes.</span></button>
    <button class="ai-item" data-ai="cap"><b>Legendas automáticas</b><span>Transcreve a fala de um vídeo ou áudio e cria legendas animadas.</span></button>
    <button class="ai-item" data-ai="bg"${img ? '' : ' disabled'}><b>Remover fundo</b><span>${img ? 'Recorta a imagem selecionada.' : 'Selecione uma camada de imagem primeiro.'}</span></button>
    <button class="ai-item" data-ai="cfg"><b>Configurar chave do Gemini</b><span>${aiCfg().key ? 'Chave configurada neste aparelho.' : 'Necessária para criar animações e legendas.'}</span></button>
  </div>`, [{ label: 'Fechar' }]);
  $$('[data-ai]').forEach(b => (b.onclick = () => {
    const a = b.dataset.ai;
    hideModal();
    setTimeout(() => {
      if (a === 'gen') aiGenerate();
      else if (a === 'cap') aiCaptionsPicker();
      else if (a === 'code') codeModal();
      else if (a === 'bg' && img) removeBackground(L);
      else if (a === 'cfg') aiSettings();
    }, 30);
  }));
}
$('#btnAI').onclick = aiMenu;

/* ======================= plano Pro e marca d'água ======================= */
const LIC_KEY = 'motion-editor:license';
S.pro = null;  // { n: cliente, u: validade } quando a licença é válida
const b64uDecode = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

async function verifyLicense(text) {
  const cfg = window.MOTION_PRO;
  if (!cfg || !cfg.publicKey || !crypto.subtle) return null;
  const m = String(text).trim().match(/^MOTION-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', cfg.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64uDecode(m[2]), new TextEncoder().encode(m[1]));
    if (!ok) return null;
    const info = JSON.parse(new TextDecoder().decode(b64uDecode(m[1])));
    if (info.u && info.u < new Date().toISOString().slice(0, 10)) return { ...info, expired: true };
    return info;
  } catch { return null; }
}

async function loadLicense() {
  let saved = null;
  try { saved = localStorage.getItem(LIC_KEY); } catch { /* sem armazenamento */ }
  const info = saved ? await verifyLicense(saved) : null;
  S.pro = info && !info.expired ? info : null;
  $('#btnPro').classList.toggle('is-pro', !!S.pro);
  $('#btnPro').textContent = S.pro ? 'PRO' : 'Seja Pro';
  if (info && info.expired) toast('Sua licença Pro venceu. Renove para tirar a marca d\'água.');
}

function proModal(reason) {
  const cfg = window.MOTION_PRO || {};
  const status = S.pro
    ? `<p class="pro-ok">Motion Pro ativo para <b>${esc(S.pro.n)}</b>${S.pro.u ? `, válido até ${esc(S.pro.u.split('-').reverse().join('/'))}` : ''}.</p>`
    : (reason ? `<p>${esc(reason)}</p>` : '');
  showModal('Motion Pro', `${status}
    <ul class="perks">
      <li>Vídeos e imagens sem marca d'água</li>
      <li>Todos os modelos prontos, incluindo os exclusivos</li>
      <li>Novos modelos todo mês</li>
    </ul>
    ${S.pro ? '' : `<p><b>${esc(cfg.price || '')}</b>. ${esc(cfg.buyText || '')}${cfg.buyLink ? ` <a href="${esc(cfg.buyLink)}" target="_blank" rel="noopener">Assinar agora</a>` : ''}</p>`}
    <label class="hint" for="licIn">${S.pro ? 'Trocar chave de licença' : 'Já tem uma chave? Cole aqui'}<input class="field" id="licIn" spellcheck="false" autocomplete="off" placeholder="MOTION-..."></label>`, [
    ...(S.pro ? [{ label: 'Remover licença', onClick: () => { try { localStorage.removeItem(LIC_KEY); } catch {} loadLicense(); } }] : []),
    { label: 'Fechar' },
    { label: 'Ativar', cls: 'btn-primary', keepOpen: true, onClick: async () => {
      const v = $('#licIn').value.trim();
      const info = await verifyLicense(v);
      if (!info) { toast('Chave inválida. Confira se copiou ela inteira.'); return; }
      if (info.expired) { toast('Essa chave já venceu.'); return; }
      try { localStorage.setItem(LIC_KEY, v); } catch { /* sem armazenamento */ }
      await loadLicense();
      hideModal();
      toast('Motion Pro ativado. Obrigado!');
    } },
  ]);
}
$('#btnPro').onclick = () => proModal();

function drawWatermark(c) {
  if (S.pro) return;
  const p = { width: c.canvas.width, height: c.canvas.height }, m = Math.min(p.width, p.height);
  const size = Math.round(m * 0.028), pad = Math.round(m * 0.03);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 0.8; c.filter = 'none'; c.globalCompositeOperation = 'source-over';
  c.font = `800 ${size}px Unbounded, Figtree, sans-serif`;
  c.textAlign = 'right'; c.textBaseline = 'bottom';
  const text = 'feito com Motion';
  const w = c.measureText(text).width;
  c.fillStyle = 'rgba(0,0,0,.45)';
  if (c.roundRect) { c.beginPath(); c.roundRect(p.width - pad - w - size * 0.9, p.height - pad - size * 1.6, w + size * 1.3, size * 2, size * 0.5); c.fill(); }
  c.fillStyle = '#ffffff';
  c.fillText(text, p.width - pad - size * 0.2, p.height - pad - size * 0.15);
  c.restore();
}

/* ======================= modelos prontos ======================= */
const K = (...pairs) => pairs.map(([t, v, e]) => ({ t, v, e: e || 'easeInOut' }));
const circlePts = (r, n = 60) => Array.from({ length: n + 1 }, (_, i) => [round(Math.cos(i / n * Math.PI * 2 - Math.PI / 2) * r, 1), round(Math.sin(i / n * Math.PI * 2 - Math.PI / 2) * r, 1)]);

const TEMPLATES = [
  {
    id: 'neon', name: 'Intro neon', aspect: '9:16', dur: 5, bg: '#0b0618', thumbAt: 2.2,
    layers: p => [
      makeLayer('text', { name: 'Título', p: { y: 860, glow: 60 }, s: { text: 'SEU NOME', font: 'Unbounded', size: 150, weight: 900, color: '#ffffff', glowColor: '#ff3df5', anim: 'neon' } }),
      makeLayer('text', { name: 'Subtítulo', start: 0.8, p: { y: 1030 }, s: { text: 'aqui vai sua frase', font: 'Figtree', size: 62, weight: 600, color: '#7ef9ff', anim: 'words' } }),
      makeLayer('path', { name: 'Linha', p: { y: 1120, glow: 30 }, s: { points: [[-300, 0], [300, 0]], stroke: '#ff3df5', width: 8, glowColor: '#ff3df5' }, kf: { trim: K([0.4, 0], [1.4, 100]) } }),
      makeLayer('ellipse', { name: 'Luz rosa', p: { x: 260, y: 640, opacity: 55, blur: 90 }, s: { w: 760, h: 760, fill: '#ff3df5', blend: 'screen' }, kf: { y: K([0, 600], [5, 760]) } }),
      makeLayer('ellipse', { name: 'Luz ciano', p: { x: 860, y: 1300, opacity: 45, blur: 90 }, s: { w: 700, h: 700, fill: '#2de2ff', blend: 'screen' }, kf: { y: K([0, 1360], [5, 1220]) } }),
    ],
  },
  {
    id: 'lower', name: 'Nome na tela (lower third)', aspect: '16:9', dur: 5, bg: '#151a24', thumbAt: 1.6,
    layers: p => [
      makeLayer('text', { name: 'Nome', start: 0.35, p: { x: 470, y: 852 }, s: { text: 'Maria Souza', font: 'Montserrat', size: 64, weight: 900, color: '#111111', align: 'left', anim: 'rise' }, kf: { opacity: K([4.4, 100, 'easeIn'], [4.8, 0]) } }),
      makeLayer('text', { name: 'Cargo', start: 0.6, p: { x: 448, y: 930 }, s: { text: 'Fundadora · Estúdio Aurora', font: 'Figtree', size: 38, weight: 600, color: '#ffffff', align: 'left', anim: 'fade' }, kf: { opacity: K([4.4, 100, 'easeIn'], [4.8, 0]) } }),
      makeLayer('rect', { name: 'Faixa clara', p: { y: 852 }, s: { w: 760, h: 92, radius: 6, fill: '#ffffff' }, kf: { x: K([0, -400, 'easeOut'], [0.5, 520], [4.3, 520, 'easeIn'], [4.8, -400]) } }),
      makeLayer('rect', { name: 'Faixa cor', p: { y: 930 }, s: { w: 620, h: 64, radius: 6, fill: '#ff5a36' }, kf: { x: K([0.15, -400, 'easeOut'], [0.65, 450], [4.2, 450, 'easeIn'], [4.7, -400]) } }),
      makeLayer('rect', { name: 'Detalhe', p: { x: 132, y: 890 }, s: { w: 14, h: 170, radius: 4, fill: '#ffb547' }, kf: { scale: K([0, 0, 'back'], [0.45, 100], [4.5, 100, 'easeIn'], [4.9, 0]) } }),
    ],
  },
  {
    id: 'countdown', name: 'Contagem 3, 2, 1', aspect: '9:16', dur: 4.2, bg: '#111018', thumbAt: 1.35,
    layers: p => [
      ...[3, 2, 1].map((n, i) => makeLayer('text', { name: `Número ${n}`, start: i, end: i + 1, p: { y: 960 }, s: { text: String(n), font: 'Anton', size: 520, weight: 400, color: '#ffffff', fillType: 'linear', fill2: '#ffb547' }, kf: { scale: K([i, 40, 'back'], [i + 0.35, 100], [i + 0.8, 100, 'easeIn'], [i + 1, 150]), opacity: K([i + 0.75, 100, 'easeIn'], [i + 1, 0]) } })),
      makeLayer('text', { name: 'Vai', start: 3, p: { y: 960, glow: 50 }, s: { text: 'VAI!', font: 'Unbounded', size: 210, weight: 900, color: '#ffffff', glowColor: '#ff5a36', anim: 'glitch' }, kf: { scale: K([3, 0, 'back'], [3.4, 100]) } }),
      makeLayer('path', { name: 'Anel', p: { y: 960 }, s: { points: circlePts(330), stroke: '#ffb547', width: 18 }, kf: { trim: K([0, 0, 'linear'], [3, 100]), rotation: K([0, 0, 'linear'], [4.2, 120]) } }),
      makeLayer('ellipse', { name: 'Luz', p: { y: 960, opacity: 40, blur: 100 }, s: { w: 900, h: 900, fill: '#ff5a36', blend: 'screen' }, kf: { scale: K([0, 80], [1, 110], [2, 80], [3, 130], [4.2, 100]) } }),
    ],
  },
  {
    id: 'logo', name: 'Revelar logo', aspect: '1:1', dur: 4, bg: '#0f1115', thumbAt: 2.4,
    layers: p => [
      makeLayer('text', { name: 'Marca', start: 1.2, p: { y: 800 }, s: { text: 'SUA MARCA', font: 'Montserrat', size: 92, weight: 900, color: '#ffffff', anim: 'scramble' } }),
      makeLayer('star', { name: 'Símbolo', p: { y: 480, glow: 25 }, s: { w: 260, points: 6, inner: 0.5, fill: '#ffb547', fillType: 'radial', fill2: '#ff5a36', glowColor: '#ffb547' }, kf: { scale: K([0.6, 0, 'back'], [1.2, 100]), rotation: K([0.6, -90, 'easeOut'], [1.6, 0]) } }),
      makeLayer('path', { name: 'Círculo', p: { y: 480 }, s: { points: circlePts(200), stroke: '#ffffff', width: 10 }, kf: { trim: K([0, 0], [1.1, 100]), opacity: K([3.4, 100, 'easeIn'], [4, 100]) } }),
    ],
  },
  {
    id: 'promo', name: 'Promoção relâmpago', aspect: '1:1', dur: 5, bg: '#ff3b30', pro: true, thumbAt: 1.8,
    layers: p => [
      makeLayer('text', { name: 'Desconto', p: { y: 470 }, s: { text: '50% OFF', font: 'Anton', size: 250, weight: 400, color: '#ffffff', stroke: 10, strokeColor: '#7a0d0d', anim: 'pop', shadowY: 14, shadowBlur: 0, shadowColor: '#7a0d0d', shadowOpacity: 100 } }),
      makeLayer('text', { name: 'Produto', start: 0.6, p: { y: 660 }, s: { text: 'em toda a loja', font: 'Montserrat', size: 70, weight: 900, color: '#ffe14d', anim: 'words' } }),
      makeLayer('text', { name: 'Selo texto', start: 1, p: { y: 850 }, s: { text: 'SÓ HOJE', font: 'Montserrat', size: 56, weight: 900, color: '#ff3b30' }, kf: { scale: K([1, 100], [1.5, 112], [2, 100], [2.5, 112], [3, 100], [3.5, 112], [4, 100]) } }),
      makeLayer('rect', { name: 'Selo', start: 1, p: { y: 850 }, s: { w: 360, h: 100, radius: 50, fill: '#ffffff' }, kf: { scale: K([1, 100], [1.5, 112], [2, 100], [2.5, 112], [3, 100], [3.5, 112], [4, 100]) } }),
      makeLayer('star', { name: 'Explosão', p: { y: 470, opacity: 35 }, s: { w: 1500, points: 16, inner: 0.7, fill: '#ff6a5f' }, kf: { rotation: K([0, 0, 'linear'], [5, 60]) } }),
    ],
  },
  {
    id: 'quote', name: 'Citação', aspect: '4:5', dur: 6, bg: '#1d1a17', pro: true, thumbAt: 3,
    layers: p => [
      makeLayer('text', { name: 'Aspas', p: { y: 330 }, s: { text: '“', font: 'Playfair Display', size: 320, weight: 900, color: '#ffb547' }, kf: { opacity: K([0, 0], [0.6, 100]), y: K([0, 280, 'easeOut'], [0.8, 330]) } }),
      makeLayer('text', { name: 'Frase', start: 0.5, p: { y: 640 }, s: { text: 'A simplicidade é o\núltimo grau da\nsofisticação.', font: 'Playfair Display', size: 84, weight: 700, color: '#f4efe6', anim: 'words' } }),
      makeLayer('text', { name: 'Autor', start: 2.2, p: { y: 940 }, s: { text: '— Leonardo da Vinci', font: 'Figtree', size: 42, weight: 600, color: '#bfb6a8', anim: 'fade' } }),
      makeLayer('rect', { name: 'Fundo', p: { y: 675 }, s: { w: 1080, h: 1350, radius: 0, fill: '#2a2420', fillType: 'linear', fill2: '#141210', gradAngle: 120 } }),
    ],
  },
  {
    id: 'subscribe', name: 'Inscreva-se', aspect: '16:9', dur: 4, bg: '#00ff00', pro: true, thumbAt: 1.9,
    layers: p => [
      makeLayer('text', { name: 'Texto', p: { x: 960, y: 540 }, s: { text: 'INSCREVA-SE', font: 'Montserrat', size: 64, weight: 900, color: '#ffffff' }, kf: { scale: K([0, 0, 'back'], [0.5, 100], [3.4, 100, 'easeIn'], [3.8, 0]) } }),
      makeLayer('rect', { name: 'Botão', p: { x: 960, y: 540 }, s: { w: 560, h: 130, radius: 24, fill: '#ff0033' }, kf: { scale: K([0, 0, 'back'], [0.5, 100], [1.8, 100], [1.9, 92], [2.05, 100], [3.4, 100, 'easeIn'], [3.8, 0]), saturate: K([1.85, 100, 'hold'], [1.9, 0]), brightness: K([1.85, 100, 'hold'], [1.9, 60]) } }),
      makeLayer('ellipse', { name: 'Cursor', p: { opacity: 95 }, s: { w: 46, h: 46, fill: '#ffffff', shadowBlur: 12, shadowOpacity: 60 }, kf: { x: K([0.6, 1500, 'easeInOut'], [1.6, 1100]), y: K([0.6, 860, 'easeInOut'], [1.6, 570]), scale: K([1.75, 100], [1.85, 70], [2, 100]), opacity: K([3.3, 95], [3.6, 0]) } }),
    ],
  },
  {
    id: 'event', name: 'Story de evento', aspect: '9:16', dur: 6, bg: '#101528', pro: true, thumbAt: 2.6,
    layers: p => [
      makeLayer('text', { name: 'Data', p: { y: 560 }, s: { text: '28 NOV', font: 'Bebas Neue', size: 300, weight: 400, color: '#ffffff', fillType: 'linear', fill2: '#7c8cff', gradAngle: 90 }, kf: { y: K([0, 640, 'easeOut'], [0.8, 560]), opacity: K([0, 0], [0.6, 100]) } }),
      makeLayer('text', { name: 'Evento', start: 0.8, p: { y: 860 }, s: { text: 'FESTA DE\nLANÇAMENTO', font: 'Unbounded', size: 92, weight: 900, color: '#ffffff', anim: 'scramble' } }),
      makeLayer('text', { name: 'Local', start: 2, p: { y: 1120 }, s: { text: 'Av. Paulista, 1000 · 22h', font: 'Figtree', size: 52, weight: 600, color: '#c9d0ff', anim: 'typewriter' } }),
      makeLayer('rect', { name: 'Moldura', p: { y: 860 }, s: { w: 900, h: 1500, radius: 40, fill: '#1b2142', shadowBlur: 60, shadowOpacity: 50 }, kf: { scale: K([0, 90, 'easeOut'], [0.7, 100]) } }),
    ],
  },
];

function buildTemplate(t) {
  const keep = S.project;
  const p = newProject(t.aspect);
  S.project = p;
  p.name = t.name; p.duration = t.dur; p.background = t.bg;
  p.layers = t.layers(p);
  for (const L of p.layers) { L.end = Math.min(L.end, p.duration); if (L.end <= L.start) L.end = p.duration; }
  S.project = keep;
  return p;
}

const thumbCache = new Map();
function templateThumb(t) {
  if (thumbCache.has(t.id)) return thumbCache.get(t.id);
  const p = buildTemplate(t);
  const keep = S.project;
  const big = document.createElement('canvas');
  big.width = p.width; big.height = p.height;
  S.project = p;
  try { renderFrame(big.getContext('2d'), t.thumbAt); } finally { S.project = keep; }
  const sm = document.createElement('canvas');
  const k = 240 / Math.max(p.width, p.height);
  sm.width = Math.round(p.width * k); sm.height = Math.round(p.height * k);
  sm.getContext('2d').drawImage(big, 0, 0, sm.width, sm.height);
  const url = sm.toDataURL('image/jpeg', 0.8);
  thumbCache.set(t.id, url);
  return url;
}

function templatesModal() {
  showModal('Modelos prontos', `<p>Escolha um modelo, troque os textos e exporte. Todos viram camadas normais que você pode editar.</p>
    <div class="tpl-grid">${TEMPLATES.map(t => `
      <button class="tpl" data-tpl="${t.id}">
        <span class="tpl-img"><img src="${templateThumb(t)}" alt=""></span>
        <span class="tpl-name">${esc(t.name)}</span>
        <span class="tpl-meta">${t.aspect} · ${t.dur}s${t.pro ? ' <i class="pro-badge">PRO</i>' : ''}</span>
      </button>`).join('')}</div>`, [{ label: 'Fechar' }]);
  $$('[data-tpl]').forEach(b => (b.onclick = () => {
    const t = TEMPLATES.find(x => x.id === b.dataset.tpl);
    if (t.pro && !S.pro) { hideModal(); setTimeout(() => proModal(`O modelo "${t.name}" é exclusivo do Motion Pro.`), 30); return; }
    const use = () => { setProject(buildTemplate(t), true); toast('Modelo aberto. Toque nos textos para trocar.'); };
    hideModal();
    if (P().layers.length) setTimeout(() => showModal('Usar este modelo?', '<p>O projeto atual será substituído. Se quiser guardar, use Salvar projeto antes.</p>', [{ label: 'Cancelar' }, { label: 'Usar modelo', cls: 'btn-primary', onClick: use }]), 30);
    else use();
  }));
}
$('#btnTemplates').onclick = templatesModal;

/* ======================= animação por código (GSAP) ======================= */
/* O código roda isolado: um iframe sandbox (origem opaca, sem acesso a localStorage/IndexedDB)
   cria um worker que carrega o GSAP, executa o código e amostra cada quadro.
   O resultado volta como números e vira keyframes lineares simplificados. */
const GSAP_URL = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js';
// propriedade do editor -> [nome no código, fator]. No código as unidades seguem o GSAP: scale 1 = 100%, opacidade 0 a 1.
const CODE_UNITS = {
  x: ['x', 1], y: ['y', 1], scale: ['scale', 100], rotation: ['rotation', 1], opacity: ['opacity', 100],
  blur: ['blur', 1], glow: ['glow', 1], brightness: ['brightness', 100], contrast: ['contrast', 100],
  saturate: ['saturate', 100], hue: ['hue', 1], trim: ['draw', 100],
};
const CODE_TOL = { x: 1, y: 1, scale: 0.5, rotation: 0.5, opacity: 0.5, blur: 0.5, glow: 1, brightness: 1, contrast: 1, saturate: 1, hue: 1, trim: 0.5 };

function codeWorkerMain() {
  var KEYS = ['x', 'y', 'scale', 'rotation', 'opacity', 'blur', 'glow', 'brightness', 'contrast', 'saturate', 'hue', 'draw'];
  var DEF = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, glow: 0, brightness: 1, contrast: 1, saturate: 1, hue: 0, draw: 1 };
  var TYPES = ['text', 'rect', 'ellipse', 'star', 'path'];
  var LABEL = { text: 'Texto', rect: 'Retângulo', ellipse: 'Círculo', star: 'Estrela', path: 'Traço' };
  self.onmessage = function (e) {
    var d = e.data, logs = [], fns = [], created = [], req = {};
    var seed = 20261012;
    Math.random = function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    function target(info) {
      var o = {};
      KEYS.forEach(function (k) { o[k] = info.init && typeof info.init[k] === 'number' ? info.init[k] : DEF[k]; });
      Object.defineProperty(o, 'autoAlpha', { get: function () { return o.opacity; }, set: function (v) { o.opacity = v; } });
      Object.defineProperty(o, 'alpha', { get: function () { return o.opacity; }, set: function (v) { o.opacity = v; } });
      ['name', 'type', 'start', 'end'].forEach(function (k) { Object.defineProperty(o, k, { value: info[k] }); });
      return o;
    }
    var layers = (d.layers || []).map(target);
    function layer(q) {
      if (typeof q === 'number') {
        var byIndex = layers[q < 0 ? layers.length + q : q];
        if (!byIndex) throw new Error('Não existe a camada número ' + q + '. O projeto tem ' + layers.length + ' camadas visuais.');
        return byIndex;
      }
      var i, low = String(q).toLowerCase();
      for (i = 0; i < layers.length; i++) if (layers[i].name === q) return layers[i];
      for (i = 0; i < layers.length; i++) if (layers[i].name.toLowerCase() === low) return layers[i];
      throw new Error('Camada "' + q + '" não encontrada. Camadas: ' + layers.map(function (l) { return l.name; }).join(', '));
    }
    function add(type, opts) {
      opts = opts || {};
      if (TYPES.indexOf(type) < 0) throw new Error('Tipo "' + type + '" não existe. Use text, rect, ellipse, star ou path.');
      var init = { x: d.W / 2, y: d.H / 2 }, s = {};
      Object.keys(opts).forEach(function (k) {
        if (KEYS.indexOf(k) >= 0) { if (typeof opts[k] === 'number' && isFinite(opts[k])) init[k] = opts[k]; }
        else if (k !== 'name' && k !== 'start' && k !== 'end') s[k] = opts[k];
      });
      var count = created.filter(function (c) { return c.type === type; }).length + 1;
      var info = {
        type: type, name: String(opts.name || (LABEL[type] + ' ' + count)).slice(0, 40),
        start: typeof opts.start === 'number' ? opts.start : 0,
        end: typeof opts.end === 'number' ? opts.end : null, init: init,
      };
      var t = target(info);
      created.push({ type: type, name: info.name, start: info.start, end: info.end, s: JSON.parse(JSON.stringify(s)), init: init, t: t });
      return t;
    }
    var say = function () { logs.push(Array.prototype.map.call(arguments, function (a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); }).join(' ')); };
    try {
      var gsap = self.gsap || (self.window && self.window.gsap);
      if (!gsap) throw new Error('Não consegui carregar o GSAP. Confira a internet.');
      var tl = gsap.timeline({ defaults: { duration: 0.8, ease: 'power3.out' } });
      var run = new Function('gsap', 'tl', 'layer', 'layers', 'add', 'every', 'duration', 'background', 'W', 'H', 'D', 'FPS', 'random', 'console', '"use strict";\n' + d.code);
      run(gsap, tl, layer, layers, add,
        function (f) { if (typeof f !== 'function') throw new Error('every() precisa de uma função, ex.: every(t => { ... })'); fns.push(f); },
        function (sec) { req.duration = Number(sec); },
        function (c) { req.background = String(c); },
        d.W, d.H, d.D, d.FPS,
        function (a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); },
        { log: say, info: say, warn: say, error: say });
      var dur = req.duration > 0 ? Math.min(600, Math.max(0.5, req.duration)) : d.D;
      var root = gsap.exportRoot();
      root.pause();
      var all = layers.concat(created.map(function (c) { return c.t; }));
      var n = Math.round(dur * d.FPS) + 1;
      if (n * all.length > 3e6) throw new Error('Animação grande demais para calcular. Diminua a duração ou o número de camadas.');
      var series = all.map(function () { var o = {}; KEYS.forEach(function (k) { o[k] = new Float64Array(n); }); return o; });
      for (var i = 0; i < n; i++) {
        var time = Math.min(dur, i / d.FPS);
        root.seek(time, false);
        for (var f = 0; f < fns.length; f++) fns[f](time);
        for (var j = 0; j < all.length; j++) {
          for (var k = 0; k < KEYS.length; k++) { var v = Number(all[j][KEYS[k]]); series[j][KEYS[k]][i] = isFinite(v) ? v : 0; }
        }
      }
      self.postMessage({
        ok: true, dur: dur, n: n, series: series, req: req, logs: logs.slice(0, 50),
        created: created.map(function (c) { return { type: c.type, name: c.name, start: c.start, end: c.end, s: c.s, init: c.init }; }),
      });
    } catch (err) {
      var m = String(err && err.stack || '').match(/(?:<anonymous>|Function):(\d+):\d+/);
      self.postMessage({ ok: false, error: String(err && err.message || err), line: m ? Number(m[1]) - 3 : null, logs: logs });
    }
  };
}
const CODE_WORKER_SRC = `importScripts(${JSON.stringify(GSAP_URL)});\n(${codeWorkerMain.toString()})();`;
const CODE_FRAME_SRC = `<script>
onmessage = function (e) {
  var w;
  try { w = new Worker(URL.createObjectURL(new Blob([e.data.src], { type: 'text/javascript' }))); }
  catch (err) { parent.postMessage({ ok: false, error: 'Este navegador não deixou rodar o código isolado.' }, '*'); return; }
  w.onmessage = function (m) { parent.postMessage(m.data, '*'); };
  w.onerror = function (err) { if (err.preventDefault) err.preventDefault(); parent.postMessage({ ok: false, error: /importScripts|NetworkError|load/i.test(err.message || '') ? 'Não consegui carregar o GSAP. Confira a internet.' : (err.message || 'Erro no código.') }, '*'); };
  w.postMessage(e.data.payload);
};
<\/script>`;

function runCodeSandbox(payload, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.hidden = true;
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      f.remove();          // destrói o iframe e o worker junto
      fn(v);
    };
    const onMsg = e => {
      if (e.source !== f.contentWindow) return;
      const d = e.data || {};
      if (d.ok) finish(resolve, d);
      else finish(reject, Object.assign(new Error(d.error || 'Erro no código.'), { line: d.line, logs: d.logs }));
    };
    window.addEventListener('message', onMsg);
    const timer = setTimeout(() => finish(reject, new Error('O código demorou demais (mais de 12 s). Veja se não tem um laço infinito.')), timeoutMs);
    f.onload = () => f.contentWindow.postMessage({ src: CODE_WORKER_SRC, payload }, '*');
    f.srcdoc = CODE_FRAME_SRC;
    document.body.appendChild(f);
  });
}

/* Ramer-Douglas-Peucker em 1D: guarda só os quadros que a interpolação linear não reproduz */
function simplifySeries(vals, fps, tol) {
  const n = vals.length;
  if (n < 2) return [{ t: 0, v: round(vals[0] || 0, 3), e: 'linear' }];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const va = vals[a], vb = vals[b];
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(vals[i] - (va + (vb - va) * (i - a) / (b - a)));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push({ t: round(i / fps, 4), v: round(vals[i], 3), e: 'linear' });
  return out;
}

/* valor inicial que o código enxerga para cada propriedade da camada */
function codeBase(L, prop) {
  if ((L.codeKf || []).includes(prop) || !isAnimated(L, prop)) return L.p[prop];
  return val(L, prop, L.start);
}
function codeInit(L) {
  const init = {};
  for (const [prop, [name, f]] of Object.entries(CODE_UNITS)) init[name] = codeBase(L, prop) / f;
  return init;
}

function seriesToKf(L, series, base, fps) {
  let count = 0;
  const baked = [];
  for (const [prop, [name, f]] of Object.entries(CODE_UNITS)) {
    if (prop === 'trim' && L.type !== 'path') continue;
    const raw = series[name];
    if (!raw) continue;
    const d = PROPS[prop];
    const vals = Array.from(raw, v => { v *= f; return d.min != null ? clamp(v, d.min, d.max) : v; });
    const b = base(prop);
    if (!vals.some(v => Math.abs(v - b) > CODE_TOL[prop] / 2)) continue;
    const kf = simplifySeries(vals, fps, CODE_TOL[prop]);
    L.kf[prop] = kf;
    baked.push(prop);
    count += kf.length;
  }
  return { baked, count };
}

function clearCodeResults(p) {
  const removed = new Set(p.layers.filter(L => L.fromCode).map(L => L.id));
  p.layers = p.layers.filter(L => !L.fromCode);
  for (const L of p.layers) {
    if (L.parent && removed.has(L.parent)) L.parent = null;
    for (const prop of L.codeKf || []) delete L.kf[prop];
    delete L.codeKf;
  }
  return removed.size;
}

function bakeCode(res, exposed, code) {
  const p = P();
  const created = [];
  // a nova execução substitui tudo o que a anterior gerou
  clearCodeResults(p);
  if (res.req.duration > 0 && Math.abs(res.dur - p.duration) > 1e-6) {
    const old = p.duration;
    p.duration = res.dur;
    for (const l of p.layers) {
      if (Math.abs(l.end - old) < 1e-6) l.end = MEDIA(l.type) ? Math.min(res.dur, l.start + mediaRemaining(l)) : res.dur;
      l.end = clamp(l.end, 0.1, res.dur); l.start = clamp(l.start, 0, l.end - 0.1);
    }
  }
  const bg = typeof res.req.background === 'string' && res.req.background.trim().match(/^#?([0-9a-f]{6})$/i);
  if (bg) p.background = '#' + bg[1].toLowerCase();

  let layersAnimated = 0, kfCount = 0;
  exposed.forEach((L, i) => {
    if (!p.layers.includes(L)) return;
    const { baked, count } = seriesToKf(L, res.series[i], prop => codeBase(L, prop), p.fps);
    if (baked.length) { L.codeKf = baked; layersAnimated++; kfCount += count; }
  });
  res.created.forEach((c, j) => {
    const pVals = {};
    for (const [prop, [name, f]] of Object.entries(CODE_UNITS)) if (typeof c.init[name] === 'number') pVals[prop] = c.init[name] * f;
    let L;
    try {
      L = sanitizeAI({ layers: [{ type: c.type, name: c.name, start: c.start, end: c.end == null ? p.duration : c.end, p: pVals, s: c.s }] }, false).layers[0];
    } catch { return; }
    L.fromCode = true;
    const { baked, count } = seriesToKf(L, res.series[exposed.length + j], prop => L.p[prop], p.fps);
    if (baked.length) L.codeKf = baked;
    kfCount += count;
    created.push(L);
  });
  for (const L of created) p.layers.unshift(L);   // a última criada fica na frente
  p.code = code;
  return { layersAnimated, created: created.length, kfCount };
}

async function applyCode(code) {
  const p = P();
  const exposed = p.layers.filter(L => VISUAL(L.type) && !L.fromCode);
  const res = await runCodeSandbox({
    code, W: p.width, H: p.height, D: p.duration, FPS: p.fps,
    layers: exposed.map(L => ({ name: L.name, type: L.type, start: L.start, end: L.end, init: codeInit(L) })),
  });
  const stats = bakeCode(res, exposed, code);
  stats.logs = res.logs || [];
  S.sel = null; S.selKf = null;
  commit();
  renderTimeline(); renderPanel(); refreshTime();
  return stats;
}

const CODE_EXAMPLES = {
  cascade: ['Entrada em cascata', `// Todas as camadas entram, uma depois da outra
tl.from(layers, {
  y: '+=80',
  opacity: 0,
  duration: 0.7,
  stagger: 0.1,
});`],
  elastic: ['Primeira camada elástica', `const alvo = layers[0];

tl.fromTo(alvo,
  { scale: 0, rotation: -20 },
  { scale: 1, rotation: 0, duration: 1.2, ease: 'elastic.out(1, 0.5)' }
);`],
  title: ['Título do zero', `duration(4);
background('#0f1020');

const titulo = add('text', {
  name: 'Título', text: 'OLÁ!', font: 'Unbounded', size: 180,
  color: '#ffffff', glow: 40, glowColor: '#ff3df5',
});
const linha = add('path', {
  name: 'Linha', points: [[-260, 0], [260, 0]],
  stroke: '#ff3df5', width: 10, y: H / 2 + 150,
});

tl.from(titulo, { scale: 0, rotation: -10, duration: 0.9, ease: 'back.out(2)' })
  .from(linha, { draw: 0, duration: 0.8 }, '-=0.3')
  .to([titulo, linha], { opacity: 0, duration: 0.5, ease: 'power2.in' }, 3.5);`],
  orbit: ['Órbita (cálculo por quadro)', `// every() roda a cada quadro: bom para movimento com matemática
const bola = add('ellipse', {
  name: 'Bolinha', w: 90, h: 90, fill: '#6fd8ff',
  glow: 40, glowColor: '#6fd8ff',
});

every(t => {
  bola.x = W / 2 + Math.cos(t * 2) * 320;
  bola.y = H / 2 + Math.sin(t * 2) * 320;
  bola.scale = 0.8 + Math.sin(t * 4) * 0.2;
});`],
  stars: ['Chuva de estrelas', `const estrelas = [];
for (let i = 0; i < 14; i++) {
  estrelas.push(add('star', {
    name: 'Estrela ' + (i + 1),
    x: random(80, W - 80),
    y: random(80, H - 80),
    w: random(40, 120),
    fill: i % 2 ? '#ffb547' : '#ff6b4a',
  }));
}

tl.from(estrelas, {
  y: '-=400',
  opacity: 0,
  rotation: -180,
  duration: 1,
  ease: 'bounce.out',
  stagger: { each: 0.08, from: 'random' },
});`],
  pulse: ['Pulsar no ritmo', `// Pulsa a primeira camada o vídeo todo (120 batidas por minuto)
tl.to(layers[0], {
  scale: 1.12,
  duration: 0.25,
  ease: 'sine.inOut',
  yoyo: true,
  repeat: -1,
});`],
};

function codeHelpHTML() {
  return `<div class="code-help" id="codeHelp" hidden>
    <p><code>layers</code> é a lista de camadas (a primeira é a da frente). <code>layer('Título')</code> ou <code>layer(0)</code> pega uma.</p>
    <p><code>tl</code> é uma linha do tempo do GSAP (padrão 0,8 s e <code>power3.out</code>). <code>gsap</code> também está disponível.</p>
    <p>Propriedades: <code>x</code>, <code>y</code> (centro, em px), <code>scale</code> (1 = normal), <code>rotation</code> (graus), <code>opacity</code> (0 a 1), <code>blur</code>, <code>glow</code>, <code>brightness</code>/<code>contrast</code>/<code>saturate</code> (1 = normal), <code>hue</code>, <code>draw</code> (0 a 1, traços).</p>
    <p><code>add(tipo, opções)</code> cria camada: <code>'text'</code>, <code>'rect'</code>, <code>'ellipse'</code>, <code>'star'</code>, <code>'path'</code>. As opções aceitam os campos do painel (text, font, size, color, fill, w, h, points, stroke…).</p>
    <p><code>every(t =&gt; { … })</code> roda a cada quadro. Também: <code>W</code>, <code>H</code>, <code>D</code> (duração), <code>FPS</code>, <code>duration(s)</code>, <code>background('#hex')</code>, <code>random(min, max)</code>, e <code>.start</code>/<code>.end</code> de cada camada.</p>
    <p>O código roda isolado: não acessa seus arquivos nem sua chave. Camadas criadas pelo código são recriadas a cada vez que você aplica.</p>
  </div>`;
}

function codeModal() {
  const p = P();
  showModal('Animar com código', `
    <p>Escreva a animação em JavaScript com o <b>GSAP</b>. Ao aplicar, ela vira keyframes normais que você pode editar na linha do tempo.</p>
    <div class="code-tools">
      <select id="codeEx" aria-label="Exemplos"><option value="">Exemplos…</option>${Object.entries(CODE_EXAMPLES).map(([k, [label]]) => `<option value="${k}">${esc(label)}</option>`).join('')}</select>
      <button class="btn btn-small" id="codeHelpBtn" type="button">Referência</button>
    </div>
    ${codeHelpHTML()}
    <textarea id="codeIn" class="code" spellcheck="false" autocapitalize="off" autocomplete="off" rows="14" aria-label="Código da animação"></textarea>
    <div class="code-ai">
      <input class="field" id="codeAsk" placeholder="Peça à IA, ex.: título entra girando e as luzes pulsam">
      <button class="btn btn-small btn-ai" id="codeAskBtn" type="button">Gerar com IA</button>
    </div>
    <p class="code-status" id="codeStatus" role="status"></p>`, [
    { label: 'Fechar' },
    ...(p.layers.some(L => L.fromCode || (L.codeKf && L.codeKf.length)) ? [{ label: 'Desfazer código', keepOpen: true, onClick: () => {
      const n = clearCodeResults(P()); commit(); renderTimeline(); renderPanel(); refreshTime();
      codeStatus(`Animações do código removidas${n ? ` e ${n} camada(s) criada(s) apagada(s)` : ''}.`);
    } }] : []),
    { label: 'Aplicar', cls: 'btn-primary', keepOpen: true, onClick: () => runCodeFromModal() },
  ]);
  $('.modal-card').classList.add('wide');
  const ta = $('#codeIn');
  ta.value = p.code || CODE_EXAMPLES.cascade[1];
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCodeFromModal(); }
  });
  $('#codeEx').onchange = e => { const ex = CODE_EXAMPLES[e.target.value]; if (ex) { ta.value = ex[1]; codeStatus(''); } e.target.value = ''; };
  $('#codeHelpBtn').onclick = () => { const h = $('#codeHelp'); h.hidden = !h.hidden; };
  $('#codeAskBtn').onclick = () => aiWriteCode($('#codeAsk').value.trim());
  $('#codeAsk').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aiWriteCode(e.target.value.trim()); } });
}
const codeStatus = (msg, bad) => { const el = $('#codeStatus'); if (el) { el.textContent = msg; el.classList.toggle('bad', !!bad); } };

function codeErrorText(err) {
  return (err.line ? `Linha ${err.line}: ` : '') + (err.message || 'Erro no código.');
}

async function runCodeFromModal() {
  const ta = $('#codeIn');
  if (!ta) return;
  const code = ta.value;
  if (!code.trim()) { codeStatus('Escreva algum código primeiro.', true); return; }
  codeStatus('Calculando a animação…');
  try {
    const st = await applyCode(code);
    finishCode(st);
  } catch (err) {
    codeStatus(codeErrorText(err), true);
  }
}

function finishCode(st) {
  if (!st.layersAnimated && !st.created) { codeStatus('O código rodou, mas nada se mexeu. Confira se os tweens estão na linha do tempo (tl) ou no gsap.', true); return; }
  hideModal();
  setTime(0);
  play();
  const parts = [];
  if (st.layersAnimated) parts.push(`${st.layersAnimated} camada(s) animada(s)`);
  if (st.created) parts.push(`${st.created} criada(s)`);
  toast(`Pronto: ${parts.join(', ')}, ${st.kfCount} keyframes.${st.logs.length ? ' Log: ' + st.logs[0] : ''}`);
}

/* ---------- a IA escreve o código, seguindo as boas práticas da skill de GSAP ---------- */
function aiCodePrompt(ask, fix) {
  const p = P();
  const ls = p.layers.filter(L => VISUAL(L.type) && !L.fromCode).map((L, i) => {
    const extra = L.type === 'text' ? ` texto="${String(L.s.text).replace(/\n/g, ' ').slice(0, 40)}"` : '';
    return `layers[${i}] "${L.name}" (${L.type}${extra}) de ${round(L.start, 2)}s a ${round(L.end, 2)}s, x=${Math.round(codeBase(L, 'x'))} y=${Math.round(codeBase(L, 'y'))}`;
  }).join('\n') || '(nenhuma camada ainda)';
  return `Você escreve animações em JavaScript com GSAP 3 para um editor de motion graphics. Responda SOMENTE com o código, sem markdown e sem explicação.

AMBIENTE (já existe, não importe nada, não use DOM, seletores CSS, ScrollTrigger nem SplitText):
- tl: gsap.timeline({ defaults: { duration: 0.8, ease: 'power3.out' } }). gsap também existe.
- layers: array de objetos-alvo (o primeiro é o da frente). layer('Nome') ou layer(índice).
- Propriedades animáveis: x, y (centro em px), scale (1 = normal), rotation (graus), opacity (0 a 1, autoAlpha também funciona), blur (px), glow (0 a 150), brightness/contrast/saturate (1 = normal), hue (graus), draw (0 a 1, só path).
- add(tipo, opções) cria camada e devolve o alvo. Tipos: 'text' (text, font: ${FONTS.join('|')}, size, weight, color, glowColor, stroke, strokeColor), 'rect' (w, h, radius, fill), 'ellipse' (w, h, fill), 'star' (w, points, inner, fill), 'path' (points: [[x,y],...] relativos ao centro, stroke, width). As opções também aceitam x, y, scale, opacity etc. como valor inicial e name, start, end.
- every(t => {...}) roda a cada quadro para movimento com matemática.
- W=${p.width}, H=${p.height}, D=${p.duration} (duração em s), FPS=${p.fps}. duration(s) muda a duração. background('#rrggbb'). random(min, max) é determinístico. Cada alvo tem .start e .end (tempo em que a camada aparece).

CAMADAS DO PROJETO:
${ls}

BOAS PRÁTICAS:
- Sequências numa timeline só, com parâmetro de posição ("-=0.3", "<", ">", tempos absolutos), nunca delays encadeados.
- Prefira fromTo quando o valor inicial importa. Anime uma camada só a partir do .start dela.
- Durações: 0.6 a 1 s em entradas, até 1.2 s em destaques. Eases: power2.out/power3.out para entradas, power2.inOut de A para B, expo.out para algo dramático, elastic/bounce com parcimônia, 'none' só em loops contínuos.
- Deslocamentos pequenos (20 a 80 px) ficam mais elegantes. Stagger entre 0.04 e 0.12.
- Uma entrada bem orquestrada vale mais que tudo se mexendo ao mesmo tempo. Tudo deve terminar dentro do quadro.
${fix ? `\nO CÓDIGO ABAIXO DEU ERRO. Corrija e devolva o código completo.\nErro: ${fix.error}\nCódigo:\n${fix.code}\n` : ''}
PEDIDO: ${ask}`;
}
const stripFences = t => String(t).replace(/^\s*```(?:js|javascript)?\s*/i, '').replace(/```\s*$/, '').trim();

async function aiWriteCode(ask) {
  if (!ask) { codeStatus('Escreva o que você quer no campo da IA.', true); return; }
  codeStatus('A IA está escrevendo o código…');
  let code = '';
  try {
    code = stripFences(await gemini([{ text: aiCodePrompt(ask) }], false));
    if ($('#codeIn')) $('#codeIn').value = code;
    codeStatus('Calculando a animação…');
    finishCode(await applyCode(code));
  } catch (err) {
    if (err.code === 'nokey') { aiError(err, () => { codeModal(); }); return; }
    if (!code) { codeStatus(err.message || 'A IA não respondeu.', true); return; }
    // uma tentativa de correção automática com a mensagem de erro
    try {
      codeStatus('O código deu erro. Pedindo para a IA corrigir…');
      code = stripFences(await gemini([{ text: aiCodePrompt(ask, { code, error: codeErrorText(err) }) }], false));
      if ($('#codeIn')) $('#codeIn').value = code;
      finishCode(await applyCode(code));
    } catch (err2) {
      codeStatus(codeErrorText(err2), true);
    }
  }
}
$('#btnCode').onclick = codeModal;

/* ======================= menu ======================= */
const menu = $('#menu');
$('#btnMenu').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', async e => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  menu.hidden = true;
  const act = b.dataset.menu;
  if (act === 'new') {
    showModal('Começar um projeto novo?', '<p>O projeto atual será substituído. Se quiser guardar, use Salvar projeto antes.</p>', [
      { label: 'Cancelar' },
      ...Object.keys(ASPECTS).map(a => ({ label: `Novo ${a}`, cls: a === '9:16' ? 'btn-primary' : '', onClick: () => setProject(newProject(a), true) })),
    ]);
  } else if (act === 'demo') {
    showModal('Carregar o exemplo?', '<p>O projeto atual será substituído pelo exemplo.</p>', [
      { label: 'Cancelar' }, { label: 'Carregar exemplo', cls: 'btn-primary', onClick: () => setProject(demoProject(), true) },
    ]);
  } else if (act === 'save') {
    toast('Preparando o arquivo…');
    const out = JSON.parse(snapshot());
    for (const [id, meta] of Object.entries(out.assets)) {
      const rec = A.get(id);
      if (rec) meta.data = await blobToDataURL(rec.blob);
    }
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), `${fileBase()}.motion.json`);
    toast('Projeto salvo nos seus downloads.');
  } else if (act === 'open') {
    $('#projectInput').click();
  } else if (act === 'png') {
    pause();
    drawWatermark(ctx);
    canvas.toBlob(b => { renderMain(); if (b) download(b, `${fileBase()}-${S.time.toFixed(2)}s.png`); }, 'image/png');
  } else if (act === 'help') {
    showModal('Atalhos', `<div class="keys">
      <kbd>Espaço</kbd><span>Reproduzir / pausar</span>
      <kbd>S / Ctrl+K</kbd><span>Dividir camada no cursor</span>
      <kbd>M</kbd><span>Mutar / ativar som da camada</span>
      <kbd>K</kbd><span>Keyframe em todas as propriedades de transformação</span>
      <kbd>← → ↑ ↓</kbd><span>Mover a camada (Shift: 10 px)</span>
      <kbd>, .</kbd><span>Quadro anterior / próximo</span>
      <kbd>Home</kbd><span>Voltar ao início</span>
      <kbd>Ctrl+D</kbd><span>Duplicar camada</span>
      <kbd>Delete</kbd><span>Excluir camada</span>
      <kbd>Ctrl+Z</kbd><span>Desfazer (Ctrl+Shift+Z refaz)</span>
      <kbd>Shift</kbd><span>Ao girar, prende em 15°</span></div>`, [{ label: 'Fechar', cls: 'btn-primary' }]);
  }
});

$('#projectInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!p || !Array.isArray(p.layers) || !p.width || !p.height) throw new Error('formato');
    setProject(p, true);
    toast('Projeto aberto.');
  } catch {
    toast('Esse arquivo não é um projeto do Motion Editor (.motion.json).');
  }
});

/* ======================= modal e aviso ======================= */
function showModal(title, body, actions = []) {
  $('.modal-card').classList.remove('wide');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  const box = $('#modalActions');
  box.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = () => { a.onClick && a.onClick(); if (!a.keepOpen) hideModal(); };
    box.appendChild(b);
  });
  $('#modal').hidden = false;
  const first = box.querySelector('.btn-primary') || box.querySelector('button');
  first && first.focus();
}
function hideModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ======================= teclado ======================= */
let arrowTimer;
document.addEventListener('keydown', e => {
  if (isTyping(e.target) || !$('#modal').hidden || S.exporting) return;
  const L = selLayer();
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === 'd' && L) { e.preventDefault(); duplicateLayer(L); }
  else if ((e.key.toLowerCase() === 's' || (mod && e.key.toLowerCase() === 'k')) && L) { e.preventDefault(); splitLayer(L); }
  else if (e.key.toLowerCase() === 'm' && L && MEDIA(L.type)) { e.preventDefault(); L.s.muted = !L.s.muted; commit(); renderTimeline(); renderPanel(); refreshTime(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && L) { e.preventDefault(); deleteLayer(L); }
  else if (e.key === 'Home') setTime(0);
  else if (e.key === ',') setTime(S.time - 1 / P().fps);
  else if (e.key === '.') setTime(S.time + 1 / P().fps);
  else if (e.key.toLowerCase() === 'k' && L && VISUAL(L.type)) {
    TRANSFORM.forEach(pr => { if (kfIndex(L, pr) < 0) upsertKf(L, pr, S.time, val(L, pr)); });
    commit(); renderTimeline(); refreshTime();
  } else if (e.key.startsWith('Arrow') && L && VISUAL(L.type)) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') setProp(L, 'x', val(L, 'x') - d);
    if (e.key === 'ArrowRight') setProp(L, 'x', val(L, 'x') + d);
    if (e.key === 'ArrowUp') setProp(L, 'y', val(L, 'y') - d);
    if (e.key === 'ArrowDown') setProp(L, 'y', val(L, 'y') + d);
    refreshTime(); clearTimeout(arrowTimer); arrowTimer = setTimeout(() => { commit(); renderTimeline(); }, 400);
  } else if (e.key === 'Escape') select(null);
});

/* ======================= instalar (PWA) ======================= */
const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; toast('App instalado.'); });
if (!inFrame && !standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) $('#btnInstall').hidden = false;
$('#btnInstall').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $('#btnInstall').hidden = true; return; }
  showModal('Instalar no iPhone', '<p>No Safari, toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>. O Motion abre como um app, em tela cheia.</p>', [{ label: 'Entendi', cls: 'btn-primary' }]);
};
if ('serviceWorker' in navigator && !inFrame && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ======================= início ======================= */
setProject(loadSaved() || demoProject());
loadLicense();
new ResizeObserver(() => fitStage()).observe($('#stage'));
window.addEventListener('resize', () => renderTimeline());
if (document.fonts) {
  Promise.all(FONTS.map(f => document.fonts.load(`700 40px "${f}"`).catch(() => {}))).then(() => refreshTime());
  document.fonts.ready.then(() => refreshTime());
}
window.__motion = { S, A, P, byId, select, setTime, setParent, makeLayer, addLayer, splitLayer, freezeFrame, registerAsset, commit };
})();
