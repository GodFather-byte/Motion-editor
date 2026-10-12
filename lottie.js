/* Lottie JSON e dotLottie: carregamento sob demanda e render por quadro.
   O player fica pausado; o relógio é sempre o da timeline do Motion. */
'use strict';
(() => {
  const BASE = 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.81.0/dist/';
  const MAX_FILE = 20 * 1024 * 1024;
  let library = null;
  let attempt = 0;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  async function getPlayer() {
    if (!library) library = import(BASE + 'index.js' + (attempt ? `?retry=${attempt}` : '')).then(({ DotLottie }) => {
      DotLottie.setWasmUrl(BASE + 'dotlottie-player.wasm');
      return DotLottie;
    }).catch(err => { library = null; attempt++; throw new Error('Não consegui carregar o Lottie. Confira a conexão e tente novamente.', { cause: err }); });
    return library;
  }

  function readJSON(bytes) {
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('Esse JSON não contém uma animação Lottie válida.'); }
    if (!data || !Array.isArray(data.layers) || ![data.w, data.h, data.fr, data.ip, data.op].every(finite) ||
      data.w <= 0 || data.h <= 0 || data.w > 8192 || data.h > 8192 || data.fr <= 0 || data.fr > 240 || data.op <= data.ip) {
      throw new Error('Escolha um JSON Lottie com tamanho, quadros e duração válidos.');
    }
    if (Array.isArray(data.assets) && data.assets.some(a => a?.p && !String(a.p).startsWith('data:image/'))) {
      throw new Error('Esse Lottie usa imagens externas. Exporte com imagens embutidas ou escolha um arquivo .lottie.');
    }
    return data;
  }

  // Confere o tamanho descompactado antes de entregar o ZIP ao player no celular.
  function checkArchive(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
    }
    if (end < 0) throw new Error('O arquivo .lottie está incompleto ou não é válido.');
    const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true), size = view.getUint32(end + 12, true);
    if (!count || count > 256 || offset + size > end || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) {
      throw new Error('Esse pacote dotLottie é grande demais ou usa um formato não suportado.');
    }
    let pos = offset, total = 0, manifest = false;
    for (let i = 0; i < count; i++) {
      if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50) throw new Error('O pacote dotLottie está corrompido.');
      const nameSize = view.getUint16(pos + 28, true), extraSize = view.getUint16(pos + 30, true), commentSize = view.getUint16(pos + 32, true);
      const next = pos + 46 + nameSize + extraSize + commentSize;
      total += view.getUint32(pos + 24, true);
      if (next > end || total > 60 * 1024 * 1024 || view.getUint16(pos + 8, true) & 1) throw new Error('Esse pacote dotLottie excede 60 MB descompactado ou está protegido.');
      if (new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameSize)) === 'manifest.json') manifest = true;
      pos = next;
    }
    if (!manifest) throw new Error('Esse ZIP não é um arquivo dotLottie: falta o manifesto.');
  }

  function info(player, id = '', name = '') {
    const { width, height } = player.animationSize();
    const duration = player.duration, frames = player.totalFrames;
    if (![width, height, duration, frames].every(finite) || width <= 0 || height <= 0 || width > 8192 || height > 8192 || duration <= 0 || duration > 600 || frames < 1) {
      throw new Error('A animação deve ter até 10 minutos e dimensões de até 8192 px.');
    }
    return { id, name: String(name || id || 'Animação').slice(0, 80), w: width, h: height, duration, frames };
  }

  async function load(blob) {
    if (!blob.size || blob.size > MAX_FILE) throw new Error('Escolha um Lottie ou dotLottie de até 20 MB.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zipped = bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
    const data = zipped ? (checkArchive(bytes), bytes.buffer) : readJSON(bytes);
    const DotLottie = await getPlayer();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const player = new DotLottie({ canvas, data, autoplay: false, loop: false, useFrameInterpolation: false,
      renderConfig: { autoResize: false, devicePixelRatio: 1, freezeOnOffscreen: false } });
    try {
      await new Promise((resolve, reject) => {
        const done = () => { clearTimeout(timer); player.removeEventListener('load', done); player.removeEventListener('loadError', fail); resolve(); };
        const fail = () => { clearTimeout(timer); player.removeEventListener('load', done); player.removeEventListener('loadError', fail); reject(new Error('Não consegui ler essa animação. Confira o arquivo Lottie ou dotLottie.')); };
        const timer = setTimeout(fail, 30000);
        player.addEventListener('load', done); player.addEventListener('loadError', fail);
        if (player.isLoaded) done();
      });
      const entries = player.manifest?.animations;
      if (entries && (!Array.isArray(entries) || entries.length > 50)) throw new Error('Escolha um pacote com até 50 animações.');
      const defaultId = player.activeAnimationId || entries?.[0]?.id || '';
      const animations = entries?.length ? entries.map(entry => {
        player.loadAnimation(entry.id);
        if (player.activeAnimationId !== entry.id) throw new Error('O pacote contém uma animação que não pôde ser aberta.');
        return info(player, entry.id, entry.name);
      }) : [info(player)];
      if (defaultId) player.loadAnimation(defaultId);
      const selected = animations.find(a => a.id === defaultId) || animations[0];
      player.setFrame(0);
      return { player, canvas, animations, defaultId: selected.id, w: selected.w, h: selected.h,
        duration: selected.duration, frames: selected.frames, format: zipped ? 'dotLottie' : 'Lottie JSON' };
    } catch (err) { if (!player.isReady) { library = null; attempt++; } player.destroy(); throw err; }
  }

  const sourceInfo = (rec, s) => rec?.animations?.find(a => a.id === (s.animationId || rec.defaultId)) || rec?.animations?.[0];

  function render(rec, s, local, scale = 1) {
    const animation = sourceInfo(rec, s);
    if (!animation || !rec.player.isLoaded) return null;
    if (animation.id && rec.player.activeAnimationId !== animation.id) rec.player.loadAnimation(animation.id);
    // Escala vetorial acompanha o tamanho de saída; limita o canvas intermediário.
    const desired = Math.max(s.w / animation.w, s.h / animation.h) * Math.max(0.01, scale);
    const factor = Math.min(desired, 4096 / Math.max(animation.w, animation.h), Math.sqrt(8 * 1024 * 1024 / (animation.w * animation.h)));
    const w = Math.max(1, Math.round(animation.w * factor)), h = Math.max(1, Math.round(animation.h * factor));
    if (rec.canvas.width !== w || rec.canvas.height !== h) { rec.canvas.width = w; rec.canvas.height = h; rec.player.resize(); }
    const time = Math.max(0, (s.trimIn || 0) + local * clamp(Number(s.speed) || 1, 0.25, 4));
    const sourceTime = s.loop ? time % animation.duration : Math.min(time, animation.duration);
    let frame = clamp(sourceTime / animation.duration * animation.frames, 0, Math.max(0, animation.frames - 1));
    if (s.reverse) frame = animation.frames - 1 - frame;
    rec.player.setFrame(Math.round(frame));
    return rec.canvas;
  }

  window.MotionLottie = { load, render, sourceInfo };
})();
