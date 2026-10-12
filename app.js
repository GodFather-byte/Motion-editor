/* Motion Editor — editor de motion graphics no navegador.
   Sem dependências: canvas 2D para render, MediaRecorder para exportar vídeo. */
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
};
const PROPS = {
  x: { label: 'Posição X', step: 1 },
  y: { label: 'Posição Y', step: 1 },
  scale: { label: 'Escala %', min: 0, max: 400, step: 1 },
  rotation: { label: 'Rotação °', min: -720, max: 720, step: 1 },
  opacity: { label: 'Opacidade %', min: 0, max: 100, step: 1 },
  blur: { label: 'Desfoque', min: 0, max: 80, step: 0.5 },
  glow: { label: 'Brilho', min: 0, max: 150, step: 1 },
};
const TRANSFORM = ['x', 'y', 'scale', 'rotation', 'opacity'];
const TEXT_ANIMS = {
  none: 'Nenhuma', typewriter: 'Máquina de escrever', rise: 'Subir letra por letra',
  pop: 'Estourar letras', fade: 'Aparecer letra por letra', wave: 'Onda (contínua)',
};
const TYPE_NAMES = { text: 'Texto', rect: 'Retângulo', ellipse: 'Círculo', star: 'Estrela', image: 'Imagem' };
const STORE_KEY = 'motion-editor:v1';
const TL_PAD = 12;

/* ======================= estado ======================= */
const S = {
  project: null,
  time: 0,
  playing: false,
  sel: null,          // id da camada selecionada
  selKf: null,        // { id, t } keyframe selecionado
  pps: 120,           // pixels por segundo na linha do tempo
  undo: [], redo: [],
  exporting: false,
  bounds: new Map(),  // id -> {w,h} medido no último render
  images: new Map(),  // assetId -> HTMLImageElement
  view: 1,            // escala do preview (px de tela por px do projeto)
};

const app = $('#app');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
const P = () => S.project;
const selLayer = () => (S.sel ? P().layers.find(l => l.id === S.sel) || null : null);
const snap = t => Math.round(t * P().fps) / P().fps;

/* ======================= modelo ======================= */
function newProject(aspect = '9:16') {
  const [w, h] = ASPECTS[aspect];
  return { v: 1, name: 'Projeto sem título', aspect, width: w, height: h, fps: 30, duration: 5, background: '#14122a', layers: [], assets: {} };
}

function makeLayer(type, extra = {}) {
  const p = P();
  const count = p.layers.filter(l => l.type === type).length + 1;
  const glowColor = '#ffb547';
  const base = {
    id: uid(), type, name: `${TYPE_NAMES[type]} ${count}`,
    start: 0, end: p.duration, visible: true,
    p: { x: p.width / 2, y: p.height / 2, scale: 100, rotation: 0, opacity: 100, blur: 0, glow: 0 },
    kf: {},
    s: {},
  };
  const m = Math.min(p.width, p.height);
  if (type === 'text') base.s = { text: 'Seu texto', font: 'Montserrat', size: Math.round(m * 0.11), weight: 900, color: '#ffffff', align: 'center', stroke: 0, strokeColor: '#000000', glowColor, anim: 'none' };
  if (type === 'rect') base.s = { w: Math.round(m * 0.4), h: Math.round(m * 0.4), radius: 28, fill: '#ff8f6b', glowColor: '#ff8f6b' };
  if (type === 'ellipse') base.s = { w: Math.round(m * 0.36), h: Math.round(m * 0.36), fill: '#b89cff', glowColor: '#b89cff' };
  if (type === 'star') base.s = { w: Math.round(m * 0.4), points: 5, inner: 0.45, fill: '#ffb547', glowColor };
  if (type === 'image') base.s = { asset: null, w: 400, h: 400, glowColor: '#ffffff' };
  Object.assign(base.s, extra.s || {});
  Object.assign(base.p, extra.p || {});
  if (extra.name) base.name = extra.name;
  if (extra.start != null) base.start = extra.start;
  if (extra.end != null) base.end = extra.end;
  if (extra.kf) base.kf = extra.kf;
  return base;
}

/* valor de uma propriedade animável no tempo t */
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
      return a.v + (b.v - a.v) * (EASES[a.e] || EASES.linear)(u);
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

/* edição respeita keyframes: se a propriedade já é animada, grava keyframe no tempo atual */
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
  } else {
    upsertKf(L, prop, S.time, val(L, prop));
  }
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

function drawText(c, L, local) {
  const s = L.s;
  c.font = `${s.weight} ${s.size}px "${s.font}", sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = s.color;
  const lines = String(s.text || ' ').split('\n');
  const lh = s.size * 1.15;
  const widths = lines.map(l => c.measureText(l).width);
  const bw = Math.max(s.size * 0.5, ...widths), bh = lh * lines.length;
  const str = (t, x, y) => {
    if (s.stroke > 0) {
      c.lineWidth = s.stroke * 2; c.lineJoin = 'round'; c.strokeStyle = s.strokeColor;
      c.strokeText(t, x, y);
    }
    c.fillText(t, x, y);
  };
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
      let a = 1, dy = 0, sc = 1;
      if (s.anim === 'typewriter') { if (local < i * 0.06) continue; }
      else if (s.anim === 'rise') { const u = clamp((local - i * 0.035) / 0.45, 0, 1); const e = EASES.easeOut(u); a = e; dy = (1 - e) * s.size * 0.6; }
      else if (s.anim === 'pop') { const u = clamp((local - i * 0.05) / 0.4, 0, 1); sc = EASES.back(u); a = u > 0 ? 1 : 0; }
      else if (s.anim === 'fade') { a = clamp((local - i * 0.05) / 0.3, 0, 1); }
      else if (s.anim === 'wave') { dy = Math.sin(local * 5 - i * 0.55) * s.size * 0.14; }
      if (a <= 0 || sc <= 0) continue;
      c.save();
      c.globalAlpha *= a;
      c.translate(cx + cw / 2, ly + dy);
      if (sc !== 1) c.scale(sc, sc);
      str(ch, -cw / 2, 0);
      c.restore();
    }
  });
  return { w: bw, h: bh };
}

function drawShape(c, L, local) {
  const s = L.s;
  if (L.type === 'text') return drawText(c, L, local);
  if (L.type === 'rect') {
    c.fillStyle = s.fill;
    c.beginPath();
    const r = clamp(s.radius, 0, Math.min(s.w, s.h) / 2);
    if (c.roundRect) c.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, r); else c.rect(-s.w / 2, -s.h / 2, s.w, s.h);
    c.fill();
    return { w: s.w, h: s.h };
  }
  if (L.type === 'ellipse') {
    c.fillStyle = s.fill;
    c.beginPath(); c.ellipse(0, 0, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); c.fill();
    return { w: s.w, h: s.h };
  }
  if (L.type === 'star') {
    c.fillStyle = s.fill;
    starPath(c, s.w / 2, Math.round(s.points), s.inner); c.fill();
    return { w: s.w, h: s.w };
  }
  if (L.type === 'image') {
    const img = S.images.get(s.asset);
    if (img && img.complete && img.naturalWidth) c.drawImage(img, -s.w / 2, -s.h / 2, s.w, s.h);
    else { c.fillStyle = '#2b2f45'; c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h); }
    return { w: s.w, h: s.h };
  }
  return { w: 0, h: 0 };
}

function drawLayer(c, L, t) {
  const op = clamp(val(L, 'opacity', t), 0, 100) / 100;
  const sc = val(L, 'scale', t) / 100;
  if (op <= 0 || sc <= 0) { S.bounds.delete(L.id); return; }
  const blur = Math.max(0, val(L, 'blur', t));
  const glow = Math.max(0, val(L, 'glow', t));
  const passes = glow > 0 ? 2 : 1;
  let b = { w: 0, h: 0 };
  for (let pass = 0; pass < passes; pass++) {
    c.save();
    c.translate(val(L, 'x', t), val(L, 'y', t));
    c.rotate(val(L, 'rotation', t) * Math.PI / 180);
    c.scale(sc, sc);
    c.globalAlpha = op;
    if (blur > 0) c.filter = `blur(${blur}px)`;
    if (glow > 0) { c.shadowColor = L.s.glowColor || '#ffffff'; c.shadowBlur = glow * sc; }
    b = drawShape(c, L, t - L.start);
    c.restore();
  }
  S.bounds.set(L.id, b);
}

function renderFrame(c, t) {
  const p = P();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.filter = 'none'; c.shadowBlur = 0;
  c.fillStyle = p.background;
  c.fillRect(0, 0, p.width, p.height);
  for (let i = p.layers.length - 1; i >= 0; i--) {
    const L = p.layers[i];
    if (!L.visible || t < L.start || t > L.end) { S.bounds.delete(L.id); continue; }
    drawLayer(c, L, t);
  }
}

const renderMain = (t = S.time) => renderFrame(ctx, t);

/* moldura de seleção com alças (só no preview, nunca no vídeo) */
function handlesOf(L) {
  const b = S.bounds.get(L.id);
  if (!b) return null;
  const sc = val(L, 'scale') / 100, rot = val(L, 'rotation') * Math.PI / 180;
  const cx = val(L, 'x'), cy = val(L, 'y');
  const tr = (lx, ly) => ({ x: cx + (lx * Math.cos(rot) - ly * Math.sin(rot)) * sc, y: cy + (lx * Math.sin(rot) + ly * Math.cos(rot)) * sc });
  const hw = b.w / 2, hh = b.h / 2;
  const ext = 28 / (S.view * sc);
  return {
    corners: [tr(-hw, -hh), tr(hw, -hh), tr(hw, hh), tr(-hw, hh)],
    scale: tr(hw, hh),
    rotate: tr(0, -hh - ext),
    top: tr(0, -hh),
    center: { x: cx, y: cy },
  };
}

function drawOverlay() {
  const dpr = window.devicePixelRatio || 1;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const L = selLayer();
  if (!L || S.exporting || !L.visible) return;
  const h = handlesOf(L);
  if (!h) return;
  const k = S.view * dpr;
  const m = pt => [pt.x * k, pt.y * k];
  octx.lineWidth = 1.5 * dpr;
  octx.strokeStyle = '#6fd8ff';
  octx.beginPath();
  h.corners.forEach((pt, i) => (i ? octx.lineTo(...m(pt)) : octx.moveTo(...m(pt))));
  octx.closePath(); octx.stroke();
  octx.beginPath(); octx.moveTo(...m(h.top)); octx.lineTo(...m(h.rotate)); octx.stroke();
  const dot = (pt, r, fill) => { octx.beginPath(); octx.arc(...m(pt), r * dpr, 0, Math.PI * 2); octx.fillStyle = fill; octx.fill(); octx.stroke(); };
  dot(h.rotate, 6, '#0e0f14');
  dot(h.scale, 7, '#6fd8ff');
}

/* ======================= preview: tamanho e interação ======================= */
function fitStage() {
  const p = P();
  const stage = $('#stage');
  const cs = getComputedStyle(stage);
  const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const r = Math.max(0.01, Math.min(aw / p.width, ah / p.height));
  const cw = Math.floor(p.width * r), ch = Math.floor(p.height * r);
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== p.width || canvas.height !== p.height) { canvas.width = p.width; canvas.height = p.height; }
  canvas.style.width = overlay.style.width = cw + 'px';
  canvas.style.height = overlay.style.height = ch + 'px';
  overlay.width = Math.round(cw * dpr); overlay.height = Math.round(ch * dpr);
  S.view = cw / p.width;
  renderMain(); drawOverlay();
}

function toProject(e) {
  const r = overlay.getBoundingClientRect();
  return { x: (e.clientX - r.left) / S.view, y: (e.clientY - r.top) / S.view };
}

function hitTest(pt) {
  const p = P();
  for (const L of p.layers) {
    if (!L.visible || S.time < L.start || S.time > L.end) continue;
    const b = S.bounds.get(L.id);
    if (!b) continue;
    const sc = val(L, 'scale') / 100, rot = -val(L, 'rotation') * Math.PI / 180;
    const dx = pt.x - val(L, 'x'), dy = pt.y - val(L, 'y');
    const lx = (dx * Math.cos(rot) - dy * Math.sin(rot)) / sc;
    const ly = (dx * Math.sin(rot) + dy * Math.cos(rot)) / sc;
    const pad = 10 / (S.view * sc);
    if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad) return L;
  }
  return null;
}

let drag = null;
overlay.addEventListener('pointerdown', e => {
  if (S.exporting) return;
  const pt = toProject(e);
  const near = (a, r = 16) => a && Math.hypot((a.x - pt.x) * S.view, (a.y - pt.y) * S.view) <= r;
  let L = selLayer();
  const h = L && L.visible ? handlesOf(L) : null;
  if (h && near(h.scale, 18)) {
    drag = { mode: 'scale', L, c: h.center, d0: Math.hypot(pt.x - h.center.x, pt.y - h.center.y) || 1, v0: val(L, 'scale') };
  } else if (h && near(h.rotate, 18)) {
    drag = { mode: 'rotate', L, c: h.center, a0: Math.atan2(pt.y - h.center.y, pt.x - h.center.x), v0: val(L, 'rotation') };
  } else {
    L = hitTest(pt);
    if (L !== selLayer()) select(L ? L.id : null);
    if (!L) return;
    drag = { mode: 'move', L, p0: pt, x0: val(L, 'x'), y0: val(L, 'y') };
  }
  if (S.playing) pause();
  drag.moved = false;
  overlay.setPointerCapture(e.pointerId);
});
overlay.addEventListener('pointermove', e => {
  if (!drag) return;
  const pt = toProject(e), L = drag.L;
  if (drag.mode === 'move') {
    let nx = drag.x0 + pt.x - drag.p0.x, ny = drag.y0 + pt.y - drag.p0.y;
    const p = P(), tol = 8 / S.view;
    if (Math.abs(nx - p.width / 2) < tol) nx = p.width / 2;   // ímã no centro
    if (Math.abs(ny - p.height / 2) < tol) ny = p.height / 2;
    setProp(L, 'x', Math.round(nx)); setProp(L, 'y', Math.round(ny));
  } else if (drag.mode === 'scale') {
    const d = Math.hypot(pt.x - drag.c.x, pt.y - drag.c.y);
    setProp(L, 'scale', Math.round(drag.v0 * d / drag.d0));
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
  if (drag.moved) { commit(); renderTimeline(); }
  drag = null;
};
overlay.addEventListener('pointerup', endDrag);
overlay.addEventListener('pointercancel', endDrag);

/* ======================= tempo e reprodução ======================= */
function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
function refreshTime() {
  renderMain(); drawOverlay(); updatePlayhead();
  $('#timecode').textContent = fmtTime(S.time);
  syncPanel();
}
function setTime(t) { S.time = clamp(snap(t), 0, P().duration); refreshTime(); }

function play() {
  if (S.playing || S.exporting) return;
  S.playing = true; app.classList.add('playing');
  if (S.time >= P().duration - 1e-3) S.time = 0;
  let last = performance.now();
  const loop = now => {
    if (!S.playing) return;
    S.time += (now - last) / 1000; last = now;
    if (S.time >= P().duration) S.time = 0;
    refreshTime(); followPlayhead();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function pause() {
  S.playing = false; app.classList.remove('playing');
  S.time = clamp(snap(S.time), 0, P().duration);
  refreshTime();
}
$('#btnPlay').onclick = () => (S.playing ? pause() : play());
$('#btnStart').onclick = () => { pause(); setTime(0); $('#tlScroll').scrollLeft = 0; };

/* ======================= linha do tempo ======================= */
const labelW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--label-w')) || 112;
const tx = t => TL_PAD + t * S.pps;

function renderTimeline() {
  const p = P();
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
  $('#tlRows').innerHTML = p.layers.map(L => {
    const kfs = kfTimes(L).map(t => `<button class="kf${S.selKf && S.selKf.id === L.id && Math.abs(S.selKf.t - t) < 1e-4 ? ' sel' : ''}" data-kf-t="${t}" style="left:${tx(t)}px" aria-label="Keyframe em ${t.toFixed(2)}s"></button>`).join('');
    return `<div class="tl-row${L.id === S.sel ? ' sel' : ''}${L.visible ? '' : ' off'}" data-id="${L.id}">
      <div class="tl-label"><button class="eye" data-eye aria-label="${L.visible ? 'Ocultar' : 'Mostrar'} camada">${L.visible ? eyeOn : eyeOff}</button><i class="type-dot ${L.type}"></i><span class="name">${esc(L.name)}</span></div>
      <div class="tl-track" style="width:${trackW}px">
        <div class="clip" style="left:${tx(L.start)}px;width:${(L.end - L.start) * S.pps}px"><span class="h l"></span><span class="h r"></span></div>
        ${kfs}
      </div></div>`;
  }).join('') || `<div class="tl-row"><div class="tl-label" style="color:var(--muted)">Vazio</div><div class="tl-track" style="width:${trackW}px"></div></div>`;
  updatePlayhead();
}

function updatePlayhead() { $('#playhead').style.left = labelW() + tx(S.time) + 'px'; }
function followPlayhead() {
  const sc = $('#tlScroll'), x = labelW() + tx(S.time);
  if (x > sc.scrollLeft + sc.clientWidth - 30 || x < sc.scrollLeft + labelW()) sc.scrollLeft = x - labelW() - 20;
}

/* régua: arrastar para percorrer o tempo */
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
  const L = P().layers.find(l => l.id === row.dataset.id);
  if (e.target.closest('[data-eye]')) { L.visible = !L.visible; commit(); renderTimeline(); refreshTime(); return; }
  if (e.target.closest('.tl-label')) { select(L.id); return; }
  if (e.target.classList.contains('tl-track')) {
    if (S.playing) pause();
    setTime((e.clientX - e.target.getBoundingClientRect().left - TL_PAD) / S.pps);
  }
});

rows.addEventListener('pointerdown', e => {
  const row = e.target.closest('.tl-row[data-id]');
  if (!row || S.exporting) return;
  const L = P().layers.find(l => l.id === row.dataset.id);
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
    };
    return;
  }

  // arrastar o bloco da camada (mover ou aparar as pontas)
  const mode = e.target.classList.contains('l') ? 'l' : e.target.classList.contains('r') ? 'r' : 'move';
  const s0 = L.start, e0 = L.end, dur = P().duration;
  if (L.id !== S.sel) select(L.id);
  const clip = row.querySelector('.clip');
  const kfEls = $$('.kf', row).map(el => ({ el, t: +el.dataset.kfT }));
  let dt = 0;
  target.onpointermove = ev => {
    dt = (ev.clientX - x0) / S.pps;
    if (mode === 'move') { dt = clamp(snap(dt), -s0, dur - e0); L.start = s0 + dt; L.end = e0 + dt; kfEls.forEach(k => (k.el.style.left = tx(k.t + dt) + 'px')); }
    else if (mode === 'l') L.start = clamp(snap(s0 + dt), 0, L.end - 0.1);
    else L.end = clamp(snap(e0 + dt), L.start + 0.1, dur);
    clip.style.left = tx(L.start) + 'px';
    clip.style.width = (L.end - L.start) * S.pps + 'px';
    renderMain(); drawOverlay();
  };
  target.onpointerup = target.onpointercancel = () => {
    target.onpointermove = target.onpointerup = target.onpointercancel = null;
    if (mode === 'move' && dt) {
      for (const prop of Object.keys(L.kf)) L.kf[prop].forEach(k => (k.t = round(k.t + dt, 4)));
    }
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
    <input type="number" id="s-${key}" data-s="${key}" step="${step}"><span></span></div>`;
const colorRow = (key, label) => `<div class="row plain"><label for="s-${key}">${label}</label><input type="color" id="s-${key}" data-s="${key}"></div>`;
const selectRow = (key, label, opts) =>
  `<div class="row plain"><label for="s-${key}">${label}</label><select id="s-${key}" data-s="${key}">${Object.entries(opts).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></div>`;

function renderPanel() {
  const scroll = panel.scrollTop;
  const L = selLayer();
  panel.innerHTML = L ? layerPanel(L) : projectPanel();
  panel.scrollTop = scroll;
  syncPanel(true);
}

function projectPanel() {
  const p = P();
  return `
  <div class="sec"><h3>Projeto</h3>
    <div class="row plain"><label>Formato</label><div class="seg">${Object.keys(ASPECTS).map(a => `<button data-aspect="${a}" class="${p.aspect === a ? 'on' : ''}">${a}</button>`).join('')}</div></div>
    <div class="row plain"><label for="pj-duration">Duração (s)</label><input class="field" type="number" id="pj-duration" data-proj="duration" min="0.5" max="120" step="0.5"></div>
    <div class="row plain"><label for="pj-fps">Quadros/s</label><select class="field" id="pj-fps" data-proj="fps"><option>24</option><option>30</option><option>60</option></select></div>
    <div class="row plain"><label for="pj-bg">Fundo</label><input type="color" id="pj-bg" data-proj="background"></div>
  </div>
  <div class="sec"><h3>Como usar</h3>
    <p class="hint">Adicione texto, formas ou imagens com os botões abaixo do preview. Toque numa camada para editar e arraste no preview para mover. A alça azul do canto muda o tamanho e a bolinha de cima gira.</p>
    <p class="hint">Para animar, mova o cursor da linha do tempo e toque no losango ao lado de uma propriedade. Cada losango é um keyframe. Ou use uma animação pronta.</p>
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
      ${colorRow('color', 'Cor')}
      <div class="row plain"><label>Alinhar</label><div class="seg">${['left', 'center', 'right'].map(a => `<button data-align="${a}" class="${s.align === a ? 'on' : ''}">${{ left: 'Esq.', center: 'Centro', right: 'Dir.' }[a]}</button>`).join('')}</div></div>
      ${numRow('stroke', 'Contorno', 0, 40)}
      ${colorRow('strokeColor', 'Cor contorno')}
      ${selectRow('anim', 'Animação', TEXT_ANIMS)}`;
  } else if (L.type === 'rect') {
    content = numRow('w', 'Largura', 1, 4000) + numRow('h', 'Altura', 1, 4000) + numRow('radius', 'Cantos', 0, 1000) + colorRow('fill', 'Cor');
  } else if (L.type === 'ellipse') {
    content = numRow('w', 'Largura', 1, 4000) + numRow('h', 'Altura', 1, 4000) + colorRow('fill', 'Cor');
  } else if (L.type === 'star') {
    content = numRow('w', 'Tamanho', 1, 4000) + numRow('points', 'Pontas', 3, 16) + numRow('inner', 'Recorte', 0.1, 0.95, 0.01) + colorRow('fill', 'Cor');
  } else if (L.type === 'image') {
    content = numRow('w', 'Largura', 1, 6000) + numRow('h', 'Altura', 1, 6000) +
      `<div class="actions"><button class="btn btn-small" data-act="replace-image">Trocar imagem</button><button class="btn btn-small" data-act="image-ratio">Proporção original</button></div>`;
  }

  const times = kfTimes(L);
  const kfSel = S.selKf && S.selKf.id === L.id && times.some(t => Math.abs(t - S.selKf.t) < 1e-4) ? S.selKf.t : null;
  let kfBox = '';
  if (kfSel != null) {
    const first = Object.values(L.kf).flat().find(k => Math.abs(k.t - kfSel) < 0.5 / P().fps);
    kfBox = `<div class="sec kf-box"><h3>Keyframe em ${kfSel.toFixed(2)}s</h3>
      <div class="row plain"><label for="kf-ease">Curva</label><select class="field" id="kf-ease" data-kfease>${Object.entries(EASE_LABELS).map(([v, t]) => `<option value="${v}"${first && first.e === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <p class="hint">A curva define como o movimento vai deste keyframe até o próximo.</p>
      <div class="actions"><button class="btn btn-small btn-danger" data-act="kf-delete">Excluir keyframe</button><button class="btn btn-small" data-act="kf-deselect">Fechar</button></div></div>`;
  }

  return `
  <div class="sec"><div class="panel-title"><i class="type-dot ${L.type}"></i><input class="field" id="layer-name" data-name value="${esc(L.name)}" aria-label="Nome da camada"></div></div>
  ${kfBox}
  <div class="sec"><h3>${TYPE_NAMES[L.type]}</h3>${content}</div>
  <div class="sec"><h3>Transformação <button class="btn btn-small" data-act="kf-all" title="Keyframe em todas (tecla K)">◆ Todas</button></h3>${TRANSFORM.map(propRow).join('')}</div>
  <div class="sec"><h3>Efeitos</h3>${propRow('blur')}${propRow('glow')}${colorRow('glowColor', 'Cor do brilho')}</div>
  <div class="sec"><h3>Animações prontas</h3>
    <div class="presets">
      <button data-preset="zoomIn">Entrar com zoom</button>
      <button data-preset="slideLeft">Deslizar da esquerda</button>
      <button data-preset="riseIn">Subir e aparecer</button>
      <button data-preset="drop">Cair quicando</button>
      <button data-preset="blurIn">Surgir do desfoque</button>
      <button data-preset="pulse">Pulsar</button>
      <button data-preset="spin">Girar 360°</button>
      <button data-preset="fadeOut">Sumir no final</button>
    </div>
    <button class="btn btn-small" data-preset="clear">Remover animações</button>
  </div>
  <div class="sec"><h3>Tempo na tela</h3>
    <div class="pair"><label class="hint" for="t-start">Começa (s)<input class="field" type="number" id="t-start" data-time="start" step="0.1" min="0"></label>
    <label class="hint" for="t-end">Termina (s)<input class="field" type="number" id="t-end" data-time="end" step="0.1" min="0"></label></div>
  </div>
  <div class="sec"><h3>Camada</h3>
    <div class="actions">
      <button class="btn btn-small" data-act="dup">Duplicar</button>
      <button class="btn btn-small" data-act="up">Trazer pra frente</button>
      <button class="btn btn-small" data-act="down">Mandar pra trás</button>
      <button class="btn btn-small btn-danger" data-act="del">Excluir</button>
    </div>
  </div>`;
}

/* atualiza os valores do painel sem recriar (mantém foco) */
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
    $$('[data-s]', panel).forEach(el => { if (el !== active) el.value = L.s[el.dataset.s]; });
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
    const num = el.type === 'number' || el.type === 'range';
    const v = num ? parseFloat(el.value) : el.value;
    if (num && Number.isNaN(v)) return;
    L.s[el.dataset.s] = v;
    $$(`[data-s="${el.dataset.s}"]`, panel).forEach(o => { if (o !== el) o.value = v; });
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
  if (el.dataset.proj === 'duration') {
    const d = clamp(parseFloat(el.value) || p.duration, 0.5, 120);
    const old = p.duration;
    p.duration = d;
    for (const l of p.layers) {
      if (Math.abs(l.end - old) < 1e-6) l.end = d;
      l.end = clamp(l.end, 0.1, d); l.start = clamp(l.start, 0, l.end - 0.1);
    }
    S.time = clamp(S.time, 0, d);
    commit(); renderTimeline(); renderPanel(); refreshTime();
    return;
  }
  if (el.dataset.proj === 'fps') { p.fps = +el.value; commit(); return; }
  if (el.dataset.time && L) {
    const v = parseFloat(el.value);
    if (!Number.isNaN(v)) {
      if (el.dataset.time === 'start') L.start = clamp(snap(v), 0, L.end - 0.1);
      else L.end = clamp(snap(v), L.start + 0.1, p.duration);
    }
    commit(); renderTimeline(); syncPanel(true); refreshTime();
    return;
  }
  if (el.dataset.kfease !== undefined && L && S.selKf) {
    for (const arr of Object.values(L.kf)) arr.forEach(k => { if (Math.abs(k.t - S.selKf.t) < 0.5 / p.fps) k.e = el.value; });
    commit(); refreshTime();
    return;
  }
  if (el.dataset.name !== undefined) { commit(); renderTimeline(); return; }
  commit();
});

panel.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const L = selLayer(), p = P();
  if (b.dataset.kf && L) {
    toggleKf(L, b.dataset.kf);
    commit(); renderTimeline(); refreshTime();
  } else if (b.dataset.aspect) {
    setAspect(b.dataset.aspect);
  } else if (b.dataset.align && L) {
    L.s.align = b.dataset.align; commit(); renderPanel(); refreshTime();
  } else if (b.dataset.preset && L) {
    applyPreset(L, b.dataset.preset);
    commit(); renderTimeline(); renderPanel(); refreshTime();
    if (b.dataset.preset !== 'clear') {
      // pula para um ponto onde a animação já aparece
      const showAt = { fadeOut: L.end - 0.6, spin: L.start + 0.5, pulse: L.start + 0.25 }[b.dataset.preset] ?? L.start + 1;
      setTime(clamp(showAt, L.start, L.end));
      toast('Animação aplicada. Dê play para ver.');
    }
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
    } else if (act === 'dup' && L) duplicateLayer(L);
    else if (act === 'del' && L) deleteLayer(L);
    else if ((act === 'up' || act === 'down') && L) moveLayer(L, act === 'up' ? -1 : 1);
    else if (act === 'replace-image') { pendingImageFor = L.id; $('#imageInput').click(); }
    else if (act === 'image-ratio' && L) {
      const img = S.images.get(L.s.asset);
      if (img && img.naturalWidth) { L.s.h = Math.round(L.s.w * img.naturalHeight / img.naturalWidth); commit(); syncPanel(true); refreshTime(); }
    }
  }
});

/* ======================= animações prontas ======================= */
function applyPreset(L, name) {
  const p = P(), s = L.start, e = L.end;
  const base = prop => (isAnimated(L, prop) ? val(L, prop, e) : L.p[prop]);
  const reset = prop => { const v = base(prop); delete L.kf[prop]; L.p[prop] = v; return v; };
  const add = (prop, t, v, ease) => upsertKf(L, prop, clamp(t, s, e), v, ease);
  if (name === 'clear') {
    for (const prop of Object.keys(L.kf)) { L.p[prop] = val(L, prop); }
    L.kf = {};
    return;
  }
  if (name === 'zoomIn') {
    const sc = reset('scale'), op = reset('opacity');
    add('scale', s, 0, 'back'); add('scale', s + 0.6, sc || 100);
    add('opacity', s, 0, 'easeOut'); add('opacity', s + 0.3, op || 100);
  } else if (name === 'slideLeft') {
    const x = reset('x');
    add('x', s, x - p.width * 0.75, 'back'); add('x', s + 0.7, x);
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
  } else if (name === 'pulse') {
    const sc = reset('scale') || 100;
    let i = 0;
    for (let t = s; t <= e + 1e-6; t = round(t + 0.5, 4)) add('scale', t, i++ % 2 ? sc * 1.12 : sc, 'easeInOut');
  } else if (name === 'spin') {
    const r = reset('rotation');
    add('rotation', s, r, 'linear'); add('rotation', e, r + 360, 'linear');
  } else if (name === 'fadeOut') {
    const op = isAnimated(L, 'opacity') ? val(L, 'opacity', Math.max(s, e - 0.5)) : L.p.opacity;
    add('opacity', Math.max(s, e - 0.5), op, 'easeIn'); add('opacity', e, 0);
  }
}

/* ======================= camadas ======================= */
function select(id) {
  if (S.sel !== id) S.selKf = null;
  S.sel = id;
  renderTimeline(); renderPanel(); drawOverlay();
}

function addLayer(L) {
  const p = P();
  L.start = clamp(snap(S.time), 0, Math.max(0, p.duration - 0.5));
  if (L.start > 0 && p.duration - L.start < 1) L.start = 0;
  L.end = p.duration;
  p.layers.unshift(L);
  commit();
  select(L.id);
  refreshTime();
}

function duplicateLayer(L) {
  const c = JSON.parse(JSON.stringify(L));
  c.id = uid(); c.name = L.name + ' cópia';
  c.p.x += 30; c.p.y += 30;
  const p = P();
  p.layers.splice(p.layers.indexOf(L), 0, c);
  commit(); select(c.id); refreshTime();
}

function deleteLayer(L) {
  const p = P();
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
    L.p.x *= fx; L.p.y *= fy;
    (L.kf.x || []).forEach(k => (k.v *= fx));
    (L.kf.y || []).forEach(k => (k.v *= fy));
  }
  Object.assign(p, { aspect, width: w, height: h });
  commit(); fitStage(); renderPanel(); refreshTime();
}

/* adicionar */
let pendingImageFor = null;
$$('[data-add]').forEach(b => b.addEventListener('click', () => {
  const type = b.dataset.add;
  if (type === 'image') { pendingImageFor = null; $('#imageInput').click(); return; }
  addLayer(makeLayer(type));
}));

$('#imageInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = await loadImageFile(file);
    const id = uid();
    P().assets[id] = data;
    const img = await ensureImage(id);
    const p = P();
    const fit = Math.min(p.width * 0.7 / img.naturalWidth, p.height * 0.5 / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * fit), h = Math.round(img.naturalHeight * fit);
    const existing = pendingImageFor && p.layers.find(l => l.id === pendingImageFor);
    if (existing) {
      existing.s.asset = id; existing.s.h = Math.round(existing.s.w * img.naturalHeight / img.naturalWidth);
      commit(); renderPanel(); refreshTime();
    } else {
      addLayer(makeLayer('image', { name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Imagem', s: { asset: id, w, h } }));
    }
  } catch {
    toast('Não consegui abrir essa imagem. Tente um arquivo PNG, JPG ou WEBP.');
  }
});

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 2048;
        if (img.naturalWidth <= max && img.naturalHeight <= max && file.size < 3e6) return resolve(fr.result);
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', 0.9));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

function ensureImage(id) {
  if (S.images.has(id)) {
    const img = S.images.get(id);
    return img.complete ? Promise.resolve(img) : new Promise(r => img.addEventListener('load', () => r(img), { once: true }));
  }
  const img = new Image();
  S.images.set(id, img);
  return new Promise((resolve, reject) => {
    img.onload = () => { resolve(img); renderMain(); };
    img.onerror = reject;
    img.src = P().assets[id];
  });
}
const ensureAllImages = () => Object.keys(P().assets || {}).forEach(id => ensureImage(id).catch(() => {}));

/* ======================= desfazer / salvar ======================= */
function snapshot() { const { assets, ...rest } = P(); return JSON.stringify(rest); }
function commit() {
  const snap = snapshot();
  if (S.undo[S.undo.length - 1] === snap) return;
  S.undo.push(snap);
  if (S.undo.length > 100) S.undo.shift();
  S.redo = [];
  updateUndoBtns();
  scheduleSave();
}
function restore(json) {
  const assets = P().assets;
  S.project = Object.assign(JSON.parse(json), { assets });
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

let saveTimer = null, warnedQuota = false;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(P())); }
    catch {
      try { localStorage.setItem(STORE_KEY, snapshot()); } catch { /* armazenamento indisponível */ }
      if (!warnedQuota && Object.keys(P().assets).length) {
        warnedQuota = true;
        toast('As imagens são grandes demais para o salvamento automático. Use Menu → Salvar projeto.');
      }
    }
  }, 600);
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.layers)) return null;
    p.assets = p.assets || {};
    return p;
  } catch { return null; }
}

function setProject(p) {
  S.project = p; S.sel = null; S.selKf = null; S.time = 0;
  S.undo = [snapshot()]; S.redo = [];
  S.images.clear();
  ensureAllImages();
  $('#projectName').value = p.name;
  fitStage(); renderTimeline(); renderPanel(); refreshTime(); updateUndoBtns(); scheduleSave();
}

$('#projectName').addEventListener('change', e => { P().name = e.target.value.trim() || 'Projeto sem título'; e.target.value = P().name; commit(); });

/* ======================= exemplo inicial ======================= */
function demoProject() {
  const p = newProject('9:16');
  p.name = 'Exemplo: abertura';
  p.duration = 6;
  S.project = p;
  const kf = (pairs, e = 'easeInOut') => pairs.map(([t, v, ee]) => ({ t, v, e: ee || e }));
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
      s: { w: 220, fill: '#ffb547', glowColor: '#ffb547' },
      kf: { rotation: kf([[0, 0, 'linear'], [6, 360]]), scale: kf([[1, 0, 'back'], [1.6, 100], [5.4, 100, 'easeIn'], [6, 0]]) },
    }),
    makeLayer('ellipse', {
      name: 'Luz azul', p: { y: 560, opacity: 45, blur: 70 },
      s: { w: 820, h: 820, fill: '#4c7dff' },
      kf: { x: kf([[0, 160], [6, 920]]) },
    }),
    makeLayer('ellipse', {
      name: 'Luz coral', p: { y: 1420, opacity: 40, blur: 80 },
      s: { w: 760, h: 760, fill: '#ff6b4a' },
      kf: { x: kf([[0, 940], [6, 160]]) },
    }),
  ];
  p.layers.forEach(L => { if (L.start === 0 && L.name === 'Subtítulo') L.start = 0.7; });
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

async function exportVideo(forceMime) {
  if (S.exporting) return;
  if (!window.MediaRecorder || !canvas.captureStream) {
    showModal('Exportação indisponível', '<p>Este navegador não grava vídeo a partir do canvas. Use o Chrome, Edge ou Firefox atualizados, ou o Safari 14.1+.</p>', [{ label: 'Entendi', cls: 'btn-primary' }]);
    return;
  }
  pause();
  const p = P();
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = forceMime || types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  let cancelled = false;
  showModal('Gerando vídeo…', `<p>Mantenha esta aba aberta e visível. O vídeo é gravado em tempo real (${p.duration}s).</p><div class="progress"><div id="expBar"></div></div>`,
    [{ label: 'Cancelar', keepOpen: true, onClick: () => { cancelled = true; } }]);

  S.exporting = true; drawOverlay();
  const stream = canvas.captureStream(p.fps);
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : { videoBitsPerSecond: 12e6 }); }
  catch { rec = new MediaRecorder(stream); }
  const chunks = [];
  rec.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => (rec.onstop = r));
  renderMain(0);
  await wait(60);
  rec.start(250);
  const t0 = performance.now();
  await new Promise(resolve => {
    const step = () => {
      if (cancelled) return resolve();
      const t = (performance.now() - t0) / 1000;
      if (t >= p.duration) { renderMain(p.duration - 1e-4); return resolve(); }
      renderMain(t);
      const bar = $('#expBar');
      if (bar) bar.style.width = (t / p.duration * 100).toFixed(1) + '%';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await wait(200);
  rec.stop();
  await stopped;
  stream.getTracks().forEach(t => t.stop());
  S.exporting = false;
  refreshTime();
  if (cancelled) { hideModal(); toast('Exportação cancelada.'); return; }

  const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
  if (blob.size < 1024 && ext === 'mp4') {
    // alguns navegadores dizem aceitar MP4 mas não gravam nada: tenta de novo em WEBM
    hideModal();
    return exportVideo(MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm');
  }
  if (blob.size < 1024) {
    showModal('O vídeo saiu vazio', '<p>O navegador não entregou nenhum quadro. Mantenha a aba visível durante a exportação e tente de novo, de preferência no Chrome.</p>', [{ label: 'Fechar', cls: 'btn-primary' }]);
    return;
  }
  const url = URL.createObjectURL(blob);
  const name = `${fileBase()}.${ext}`;
  const file = new File([blob], name, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  showModal('Vídeo pronto', `<video src="${url}" controls playsinline loop></video><p>${ext.toUpperCase()} · ${blob.size > 1048576 ? (blob.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(blob.size / 1024)) + ' KB'} · ${p.width}×${p.height}${ext === 'webm' ? '. Seu navegador gera WEBM; para MP4 use o Chrome recente ou o Safari.' : ''}</p>`, [
    ...(canShare ? [{ label: 'Compartilhar', keepOpen: true, onClick: () => navigator.share({ files: [file], title: P().name }).catch(() => {}) }] : []),
    { label: 'Baixar vídeo', cls: 'btn-primary', keepOpen: true, onClick: () => download(blob, name) },
    { label: 'Fechar', onClick: () => URL.revokeObjectURL(url) },
  ]);
}
$('#btnExport').onclick = () => exportVideo();

/* ======================= menu ======================= */
const menu = $('#menu');
$('#btnMenu').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', e => {
  const b = e.target.closest('[data-menu]');
  if (!b) return;
  menu.hidden = true;
  const act = b.dataset.menu;
  if (act === 'new') {
    showModal('Começar um projeto novo?', '<p>O projeto atual será substituído. Se quiser guardar, use Salvar projeto antes.</p>', [
      { label: 'Cancelar' },
      ...Object.keys(ASPECTS).map(a => ({ label: `Novo ${a}`, cls: a === '9:16' ? 'btn-primary' : '', onClick: () => setProject(newProject(a)) })),
    ]);
  } else if (act === 'demo') {
    showModal('Carregar o exemplo?', '<p>O projeto atual será substituído pelo exemplo.</p>', [
      { label: 'Cancelar' }, { label: 'Carregar exemplo', cls: 'btn-primary', onClick: () => setProject(demoProject()) },
    ]);
  } else if (act === 'save') {
    download(new Blob([JSON.stringify(P())], { type: 'application/json' }), `${fileBase()}.motion.json`);
    toast('Projeto salvo nos seus downloads.');
  } else if (act === 'open') {
    $('#projectInput').click();
  } else if (act === 'png') {
    pause();
    canvas.toBlob(b => b && download(b, `${fileBase()}-${S.time.toFixed(2)}s.png`), 'image/png');
  } else if (act === 'help') {
    showModal('Atalhos', `<div class="keys">
      <kbd>Espaço</kbd><span>Reproduzir / pausar</span>
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
    p.assets = p.assets || {};
    setProject(p);
    toast('Projeto aberto.');
  } catch {
    toast('Esse arquivo não é um projeto do Motion Editor (.motion.json).');
  }
});

/* ======================= modal e aviso ======================= */
function showModal(title, body, actions = []) {
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
document.addEventListener('keydown', e => {
  if (isTyping(e.target) || !$('#modal').hidden || S.exporting) return;
  const L = selLayer();
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === 'd' && L) { e.preventDefault(); duplicateLayer(L); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && L) { e.preventDefault(); deleteLayer(L); }
  else if (e.key === 'Home') { setTime(0); }
  else if (e.key === ',') { setTime(S.time - 1 / P().fps); }
  else if (e.key === '.') { setTime(S.time + 1 / P().fps); }
  else if (e.key.toLowerCase() === 'k' && L) {
    TRANSFORM.forEach(pr => { if (kfIndex(L, pr) < 0) upsertKf(L, pr, S.time, val(L, pr)); });
    commit(); renderTimeline(); refreshTime();
  } else if (e.key.startsWith('Arrow') && L) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') setProp(L, 'x', val(L, 'x') - d);
    if (e.key === 'ArrowRight') setProp(L, 'x', val(L, 'x') + d);
    if (e.key === 'ArrowUp') setProp(L, 'y', val(L, 'y') - d);
    if (e.key === 'ArrowDown') setProp(L, 'y', val(L, 'y') + d);
    refreshTime(); clearTimeout(arrowTimer); arrowTimer = setTimeout(() => { commit(); renderTimeline(); }, 400);
  } else if (e.key === 'Escape') { select(null); }
});
let arrowTimer;

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
new ResizeObserver(() => fitStage()).observe($('#stage'));
window.addEventListener('resize', () => { renderTimeline(); });
if (document.fonts) {
  Promise.all(FONTS.map(f => document.fonts.load(`700 40px "${f}"`).catch(() => {}))).then(() => refreshTime());
  document.fonts.ready.then(() => refreshTime());
}
window.__motion = S; // facilita depuração no console
})();
