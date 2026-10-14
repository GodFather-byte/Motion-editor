(function (root) {
  'use strict';
  const VOICE_PRESET = Object.freeze({
    highpass: 80, presence: 3000, presenceGain: 4, presenceQ: 1,
    threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25
  });
  function voiceChain(context, source, destination, enabled = true) {
    if (!enabled) { source.connect(destination); return []; }
    const hp = context.createBiquadFilter(), presence = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    hp.type = 'highpass'; hp.frequency.value = VOICE_PRESET.highpass;
    presence.type = 'peaking'; presence.frequency.value = VOICE_PRESET.presence;
    presence.Q.value = VOICE_PRESET.presenceQ; presence.gain.value = VOICE_PRESET.presenceGain;
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) compressor[key].value = VOICE_PRESET[key];
    source.connect(hp); hp.connect(presence); presence.connect(compressor); compressor.connect(destination);
    return [hp, presence, compressor];
  }
  function encodeWav(buffer) {
    const channels = buffer.numberOfChannels, length = buffer.length * channels * 2;
    const bytes = new ArrayBuffer(44 + length), view = new DataView(bytes);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + length, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length, true);
    const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
    for (let i = 0, pos = 44; i < buffer.length; i++) for (let c = 0; c < channels; c++, pos += 2) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(pos, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }
  const wordsOf = text => String(text).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  function alignWords(script, spoken, from = 0) {
    let cursor = from;
    for (const word of wordsOf(spoken)) {
      const end = Math.min(script.length, cursor + 12);
      for (let i = cursor; i < end; i++) if (script[i] === word) { cursor = i + 1; break; }
    }
    return cursor;
  }
  function recorderMime(kind = 'video') {
    const types = kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] :
      ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return types.find(type => root.MediaRecorder?.isTypeSupported(type)) || '';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { VOICE_PRESET, voiceChain, encodeWav, wordsOf, alignWords };
  if (!root.document) return;
  const B = root.MotionWorkstationBridge;
  if (!B) return;
  const $ = selector => document.querySelector(selector);
  const uid = () => crypto.randomUUID();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value, min, max, fallback = 0) => Number.isFinite(+value) ? Math.max(min, Math.min(max, +value)) : fallback;
  const opfsSupported = !!navigator.storage?.getDirectory;
  let epoch = 0, project = null, active = 'video', home = document.documentElement.dataset.view !== 'editor';
  let audioRuntime = null, capture = null, recognition = null, aiBusy = false;
  let pixelImages = new Map(), pixelDrag = null, lastSavedCapture = null;
  let audioPickToken = null, pixelPickToken = null, replacePickToken = null;
  const urls = new Set();
  const objectURL = blob => { const url = URL.createObjectURL(blob); urls.add(url); return url; };
  const releaseURL = url => { if (url) { URL.revokeObjectURL(url); urls.delete(url); } };
  const token = () => ({ project: B.project(), epoch });
  const valid = t => t.project === B.project() && t.epoch === epoch && !home;
  function requireToken(t) { if (!valid(t)) throw new Error('A operação foi cancelada: projeto ou módulo mudou.'); }
  function state() {
    const p = B.project();
    if (!p.workstation) p.workstation = {};
    const s = p.workstation;
    s.active ||= 'video'; s.dynamicLink ??= true; s.assets ||= {};
    s.audio ||= { tracks: [], preset: true, monitor: false };
    s.pixel ||= { width: p.width, height: p.height, layers: [], selected: null };
    s.script ||= { request: '', scenes: [{ audio: '', video: '' }], speed: 35, speech: false, webcam: true, screen: false, mic: true };
    return s;
  }
  let messageTimer;
  function status(message, error = false) {
    clearTimeout(messageTimer);
    $('#wsStatus').textContent = message;
    $('#wsStatus').setAttribute('role', error ? 'alert' : 'status');
    messageTimer = setTimeout(() => { $('#wsStatus').textContent = ''; }, error ? 15000 : 6000);
  }
  async function run(button, job) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try { await job(); } catch (error) { status(error.message || 'Não foi possível concluir.', true); }
    finally { if (button?.isConnected) button.disabled = false; unavailable(); }
  }
  function unavailable() {
    document.querySelectorAll('[data-opfs]').forEach(el => { el.disabled = !opfsSupported; });
    document.querySelectorAll('[data-mic]').forEach(el => { el.disabled = !opfsSupported || !navigator.mediaDevices?.getUserMedia || !root.MediaRecorder || !!audioRuntime?.recorder; });
    $('#wsCaptureStart').disabled = !opfsSupported || !root.MediaRecorder || !!capture;
    $('#wsSpeech').disabled = !(root.SpeechRecognition || root.webkitSpeechRecognition);
  }
  document.body.insertAdjacentHTML('beforeend', `
    <header class="ws-top"><strong>CREATOR OS</strong><div class="ws-indicators">
      <span id="wsStorage" title="Armazenamento local">OPFS: ${opfsSupported ? 'local' : 'indisponível'}</span>
      <span id="wsBattery">Bateria: —</span><span id="wsAI">IA: consultando</span>
      <label title="Enviar mídias salvas e atualizar camadas vinculadas automaticamente"><input id="wsDynamic" type="checkbox"> Link</label>
    </div></header>
    <nav class="ws-dock" aria-label="Módulos do projeto">
      <button data-workspace="home">Início</button><button data-workspace="video" aria-pressed="true">Vídeo</button>
      <button data-workspace="audio" aria-pressed="false">Áudio</button><button data-workspace="pixel" aria-pressed="false">Pixel</button>
      <button data-workspace="script" aria-pressed="false">Roteiro</button><button data-workspace="assets" aria-pressed="false">Arquivos</button>
    </nav>
    <p class="ws-status" id="wsStatus" role="status" aria-live="polite"></p>
    <main class="ws-module" id="wsAudio" hidden aria-label="Estúdio de áudio">
      <h1>Estúdio de áudio</h1><p>Faixas independentes, mixagem local e voz pronta para a timeline.</p>
      <div class="ws-toolbar"><button data-action="audio-import" data-opfs>Importar áudio</button>
        <button id="wsAudioRecord" data-action="audio-record" data-mic>Gravar microfone</button>
        <button id="wsAudioStop" data-action="audio-stop" disabled>Parar gravação</button>
        <button data-action="audio-play">Ouvir mix</button><button data-action="audio-pause">Parar mix</button>
        <button data-action="audio-wav" data-opfs>Salvar WAV e enviar</button>
        <button data-action="audio-webm" data-opfs>Salvar WebM e enviar</button></div>
      <div class="ws-toolbar"><label><input id="wsVoice" type="checkbox"> Preset de voz</label>
        <label><input id="wsMonitor" type="checkbox"> Monitorar (use fones)</label></div>
      <p>Voz: passa-altas 80 Hz · presença 3 kHz (+4 dB) · compressor −24 dB / 12:1, knee 30, ataque 3 ms, release 250 ms.</p>
      <canvas id="wsSpectrum" class="ws-visualizer" width="960" height="180" aria-label="Espectro em tempo real"></canvas>
      <canvas id="wsWave" class="ws-visualizer" width="960" height="160" aria-label="Forma de onda em tempo real"></canvas>
      <div id="wsTracks"></div><input type="file" id="wsAudioInput" accept="audio/*" multiple hidden>
    </main>
    <main class="ws-module" id="wsPixel" hidden aria-label="Estúdio Pixel">
      <h1>Pixel · composição transparente</h1>
      <div class="ws-toolbar"><button data-action="pixel-import" data-opfs>Importar imagem</button>
        <button data-action="pixel-frame" data-opfs>Quadro exato do vídeo</button><button data-action="pixel-text">Adicionar texto</button>
        <button data-action="pixel-save" data-opfs>Salvar PNG e enviar overlay</button>
        <label>Largura <input id="wsPixelWidth" type="number" min="1" max="8192"></label>
        <label>Altura <input id="wsPixelHeight" type="number" min="1" max="8192"></label></div>
      <div class="ws-grid"><div class="ws-pixel-wrap"><canvas id="wsPixelCanvas" width="1080" height="1920"></canvas></div>
        <aside class="ws-card"><h2>Camadas (frente primeiro)</h2><div id="wsPixelLayers"></div><div id="wsPixelProps"></div></aside></div>
      <input type="file" id="wsPixelInput" accept="image/*" multiple hidden>
    </main>
    <main class="ws-module" id="wsScript" hidden aria-label="Roteiro e gravação">
      <h1>Roteiro e gravação</h1>
      <textarea id="wsRequest" placeholder="Descreva o vídeo para a IA local" aria-label="Pedido de roteiro"></textarea>
      <div class="ws-toolbar"><button id="wsGenerate" data-action="script-generate">Gerar com IA local</button><button data-action="script-add">Adicionar cena</button></div>
      <p id="wsAIHelp">Sem servidor: o modelo precisa estar disponível neste navegador. Você também pode escrever manualmente.</p>
      <table class="ws-script-table"><thead><tr><th scope="col">Áudio / narração</th><th scope="col">Vídeo / cena</th></tr></thead><tbody id="wsScenes"></tbody></table>
      <div class="ws-toolbar"><label><input id="wsWebcam" type="checkbox"> Webcam</label><label><input id="wsScreen" type="checkbox"> Tela</label>
        <label><input id="wsCaptureMic" type="checkbox"> Microfone</label>
        <label>Rolagem px/s <input id="wsScrollSpeed" type="range" min="0" max="100"></label>
        <label><input id="wsSpeech" type="checkbox"> Acompanhar fala</label>
        <button data-action="script-reset">Reiniciar leitura</button>
        <button id="wsCaptureStart" data-action="capture-start" data-opfs>Iniciar gravação</button>
        <button id="wsCaptureStop" data-action="capture-stop" disabled>Finalizar e salvar</button></div>
      <p>A tela com a webcam é gravada sem o texto do teleprompter. Acompanhamento de fala é opcional e pode usar o serviço de reconhecimento do navegador.</p>
      <div class="ws-capture"><canvas id="wsCaptureCanvas" width="1280" height="720"></canvas><div class="ws-prompter" id="wsPrompter"></div></div>
      <div id="wsCaptureResult" class="ws-toolbar" hidden><span>Deseja abrir na timeline e aplicar o corte automático de silêncios agora?</span><button data-action="capture-send">Enviar à timeline</button><button data-action="capture-silence">Enviar e cortar silêncios</button></div>
    </main>
    <main class="ws-module" id="wsAssets" hidden aria-label="Arquivos compartilhados">
      <h1>Arquivos do projeto</h1><p>OPFS privado deste navegador. Link envia mídias salvas e atualiza vínculos. Fontes de áudio/Pixel ficam no módulo até exportar; gravações de câmera pedem confirmação. Envio manual funciona com Link desligado.</p>
      <div id="wsAssetList" class="ws-library"></div><input id="wsReplaceInput" type="file" hidden>
    </main>`);

  async function directory(parts, create = false) {
    if (!opfsSupported) throw new Error('OPFS indisponível. Use um navegador compatível em HTTPS ou localhost.');
    let dir = await navigator.storage.getDirectory();
    for (const part of parts) {
      if (!/^[\w.-]+$/.test(part) || part === '.' || part === '..') throw new Error('Caminho de arquivo inválido.');
      dir = await dir.getDirectoryHandle(part, { create });
    }
    return dir;
  }
  async function readAsset(asset) {
    const parts = asset.path.split('/'), name = parts.pop();
    if (!/^[\w.-]+$/.test(name) || name === '.' || name === '..') throw new Error('Nome de arquivo inválido.');
    const dir = await directory(parts);
    return (await dir.getFileHandle(name)).getFile();
  }
  async function storageStatus() {
    const label = $('#wsStorage');
    const fallback = `OPFS: ${opfsSupported ? 'local · espaço indisponível' : 'indisponível'}`;
    if (!opfsSupported || !navigator.storage?.estimate) { label.textContent = fallback; return; }
    try {
      const info = await navigator.storage.estimate();
      const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
      const size = value => !known(value) ? '—' : value >= 1073741824 ?
        `${(value / 1073741824).toFixed(1)} GB` : `${(value / 1048576).toFixed(1)} MB`;
      const usage = info?.usage, quota = info?.quota;
      const remaining = known(usage) && known(quota) ? Math.max(0, quota - usage) : undefined;
      label.textContent = `OPFS: ${size(usage)} / ${size(quota)} · livres ${size(remaining)}`;
    } catch (_) { label.textContent = fallback; }
  }
  let storageTimer = null;
  function stopStorageMonitor() {
    clearInterval(storageTimer); storageTimer = null;
  }
  function startStorageMonitor() {
    stopStorageMonitor();
    void storageStatus();
    if (!document.hidden && navigator.storage?.estimate) storageTimer = setInterval(() => void storageStatus(), 10000);
  }
  let sendQueue = Promise.resolve();
  function sendAsset(key, t = token()) {
    const job = sendQueue.then(async () => {
      requireToken(t);
      const asset = state().assets[key];
      if (!asset) throw new Error('Arquivo não encontrado neste projeto.');
      const revision = asset.revision;
      const file = await readAsset(asset);
      requireToken(t);
      if (state().assets[key]?.revision !== revision) throw new Error('O arquivo foi substituído. Envie novamente.');
      const id = await B.send(new File([file], asset.name, { type: asset.mime }), key,
        () => valid(t) && state().assets[key]?.revision === revision, asset);
      requireToken(t);
      status('Arquivo enviado à timeline.');
      return id;
    });
    sendQueue = job.catch(() => {});
    return job;
  }
  let channel = null;
  const sender = uid();
  function publishAsset(type, detail) {
    root.dispatchEvent(new CustomEvent(`workstation:asset-${type}`, { detail: structuredClone(detail) }));
    root.dispatchEvent(new CustomEvent('workstation:asset', { detail: structuredClone({ ...detail, type }) }));
  }
  function shouldAutoSend(asset, t, suppressed = false) {
    return !suppressed && state().dynamicLink &&
      (asset.role !== 'source' || t.project.layers.some(l => l.s.workstationAsset === asset.key));
  }
  async function saveAsset(blob, kind, name, key = uid(), t = token(), options = {}) {
    requireToken(t);
    if (!['audio', 'video', 'image'].includes(kind) || !/^[\w-]+$/.test(key)) throw new Error('Identificador de arquivo inválido.');
    const previous = state().assets[key], revision = uid();
    const extension = name.split('.').pop().replace(/[^\w]/g, '').slice(0, 8) || 'bin';
    const parts = ['creator-workstation', String(t.project.id), kind === 'image' ? 'pixel' : kind === 'video' ? 'video' : 'audio'];
    const dir = await directory(parts, true), filename = `${key}-${revision}.${extension}`;
    requireToken(t);
    let writable;
    try {
      const handle = await dir.getFileHandle(filename, { create: true });
      writable = await handle.createWritable();
      await writable.write(blob); await writable.close(); writable = null;
      requireToken(t);
    } catch (error) {
      try { await writable?.abort(); } catch (_) {}
      try { await dir.removeEntry(filename); } catch (_) {}
      throw error;
    }
    const asset = { key, kind, name, mime: blob.type, size: blob.size, revision, path: [...parts, filename].join('/'), updated: Date.now() };
    asset.role = options.role === 'source' || previous?.role === 'source' ? 'source' : 'media';
    if (Number.isFinite(options.duration) && options.duration > 0) asset.duration = options.duration;
    state().assets[key] = asset;
    B.commit();
    const detail = { sender, projectId: t.project.id, asset, previousRevision: previous?.revision || null, suppressAutoSend: !!options.suppressAutoSend };
    publishAsset('saved', detail);
    channel?.postMessage(detail);
    void storageStatus();
    if (options.send || shouldAutoSend(asset, t, options.suppressAutoSend)) await sendAsset(key, t);
    if (active === 'assets') renderAssets();
    status('Arquivo salvo no OPFS.');
    return key;
  }
  function receiveAsset(event) {
    const detail = event.data;
    if (!detail || detail.sender === sender || detail.projectId !== B.project()?.id || home) return;
    void run(null, async () => {
      const t = token(), asset = detail.asset;
      if (!asset || !['audio', 'video', 'image'].includes(asset.kind) ||
          !/^[\w-]+$/.test(asset.key) || !/^[\w-]+$/.test(asset.revision) ||
          !asset.path?.startsWith(`creator-workstation/${t.project.id}/`) || typeof asset.name !== 'string') return;
      const acceptsRevision = () => {
        const current = state().assets[asset.key];
        if (current?.revision === asset.revision) return false;
        // Não sobrescreve uma edição concorrente que já divergiu da revisão recebida.
        if (current && current.revision !== detail.previousRevision) {
          status('Outro estúdio alterou este arquivo. Reabra o projeto para revisar.', true); return false;
        }
        return true;
      };
      if (!acceptsRevision()) return;
      await readAsset(asset); requireToken(t);
      if (!acceptsRevision()) return;
      state().assets[asset.key] = asset; B.commit();
      publishAsset('received', detail);
      void storageStatus();
      if (shouldAutoSend(asset, t, detail.suppressAutoSend)) await sendAsset(asset.key, t);
      if (active === 'assets') renderAssets();
    });
  }
  function connectAssetChannel() {
    if (channel || !root.BroadcastChannel) return;
    channel = new BroadcastChannel('motion-workstation-assets-v1');
    channel.addEventListener('message', receiveAsset);
  }
  connectAssetChannel();
  function renderAssets() {
    $('#wsAssetList').innerHTML = Object.values(state().assets).map(asset => `
      <article><span>${esc(asset.name)}<br><small>${esc(asset.kind)} · ${esc((asset.size / 1024).toFixed(1))} KB</small></span>
      <div class="ws-toolbar"><button data-send="${esc(asset.key)}" data-opfs>Enviar</button>
      <button data-replace="${esc(asset.key)}" data-opfs>Substituir</button><button data-download="${esc(asset.key)}" data-opfs>Baixar</button></div></article>`).join('') || '<p>Nenhum arquivo salvo neste projeto.</p>';
    unavailable();
  }
  function audioContext() {
    const Context = root.AudioContext || root.webkitAudioContext;
    if (!Context) throw new Error('Web Audio indisponível neste navegador.');
    return new Context();
  }
  function stopStreams(streams) { for (const stream of streams || []) for (const track of stream.getTracks()) track.stop(); }
  function clearAudio() {
    const runtime = audioRuntime; audioRuntime = null;
    if (!runtime) { unavailable(); return; }
    cancelAnimationFrame(runtime.raf);
    clearTimeout(runtime.timer);
    runtime.cancelled = true;
    try { if (runtime.recorder?.state !== 'inactive') runtime.recorder?.stop(); } catch (_) {}
    for (const source of runtime.sources || []) { try { source.stop(); } catch (_) {} }
    stopStreams(runtime.streams);
    void runtime.context?.close().catch(() => {});
    $('#wsAudioStop').disabled = true;
    $('#wsAudioRecord').textContent = 'Gravar microfone';
    unavailable();
  }
  async function decodeTracks(t, context) {
    const tracks = state().audio.tracks.map(track => ({ ...track }));
    return Promise.all(tracks.map(async track => {
      const asset = state().assets[track.asset];
      if (!asset) throw new Error(`Arquivo ausente: ${track.name}`);
      const file = await readAsset(asset), buffer = await context.decodeAudioData(await file.arrayBuffer());
      requireToken(t); return { ...track, buffer };
    }));
  }
  function routeTrack(context, track, destination, preset, sources, baseTime = 0) {
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = track.buffer;
    gain.gain.value = track.muted ? 0 : number(track.gain, 0, 2, 1);
    source.connect(gain); voiceChain(context, gain, destination, preset);
    source.start(baseTime + Math.max(0, +track.start || 0));
    sources.push(source);
  }
  function visualizer(runtime) {
    const spectrum = $('#wsSpectrum'), wave = $('#wsWave'), sc = spectrum.getContext('2d'), wc = wave.getContext('2d');
    const frequencies = new Uint8Array(runtime.analyser.frequencyBinCount), samples = new Uint8Array(runtime.analyser.fftSize);
    const colors = getComputedStyle(document.documentElement), accent = colors.getPropertyValue('--accent'), bg = colors.getPropertyValue('--panel-2');
    const draw = () => {
      if (audioRuntime !== runtime) return;
      runtime.analyser.getByteFrequencyData(frequencies); runtime.analyser.getByteTimeDomainData(samples);
      for (const [ctx, canvas] of [[sc, spectrum], [wc, wave]]) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      sc.fillStyle = accent;
      for (let i = 0; i < 96; i++) {
        const value = frequencies[Math.floor(i * frequencies.length / 96)] / 255;
        sc.fillRect(i * spectrum.width / 96, spectrum.height * (1 - value), spectrum.width / 96 - 2, spectrum.height * value);
      }
      wc.strokeStyle = accent; wc.lineWidth = 2; wc.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = i * wave.width / (samples.length - 1), y = samples[i] / 255 * wave.height;
        if (!i) wc.moveTo(x, y); else wc.lineTo(x, y);
      }
      wc.stroke(); runtime.raf = requestAnimationFrame(draw);
    };
    draw();
  }
  function renderAudio() {
    const audio = state().audio;
    $('#wsVoice').checked = audio.preset; $('#wsMonitor').checked = audio.monitor;
    $('#wsTracks').innerHTML = audio.tracks.map(track => `<div class="ws-track" data-track="${esc(track.id)}">
      <input aria-label="Nome da faixa" data-track-field="name" value="${esc(track.name)}">
      <label>Início (s) <input aria-label="Início da faixa" type="number" min="0" max="3600" step=".1" data-track-field="start" value="${esc(track.start)}"></label>
      <label>Volume <input aria-label="Volume da faixa" type="range" min="0" max="2" step=".01" data-track-field="gain" value="${esc(track.gain)}"></label>
      <label><input type="checkbox" data-track-field="muted" ${track.muted ? 'checked' : ''}> Mudo</label><button data-track-remove="${esc(track.id)}">Remover</button>
      </div>`).join('') || '<p>Importe ou grave uma faixa para começar.</p>';
    unavailable();
  }
  async function importAudio(files, t = token()) {
    requireToken(t);
    for (const file of files) {
      if (!file.type.startsWith('audio/')) throw new Error('Escolha um arquivo de áudio.');
      const context = audioContext();
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer()); requireToken(t);
        const key = await saveAsset(file, 'audio', file.name, uid(), t, { role: 'source' }); requireToken(t);
        state().audio.tracks.push({ id: uid(), asset: key, name: file.name, gain: 1, start: 0, muted: false, duration: buffer.duration });
        B.commit(); renderAudio();
      } finally { await context.close(); }
    }
  }
  async function startAudioRecording() {
    clearAudio();
    const t = token(), context = audioContext(), runtime = { context, streams: [], sources: [], token: t };
    audioRuntime = runtime;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      runtime.streams.push(stream); requireToken(t);
      if (audioRuntime !== runtime) throw new Error('Gravação cancelada.');
      await context.resume(); requireToken(t);
      const source = context.createMediaStreamSource(stream), destination = context.createMediaStreamDestination();
      // Grava a fonte seca. O mesmo preset é aplicado no monitor e uma única vez no mix/exportação.
      source.connect(destination);
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      const monitorGain = context.createGain(); monitorGain.gain.value = state().audio.monitor ? 1 : 0;
      voiceChain(context, source, analyser, state().audio.preset); analyser.connect(monitorGain); monitorGain.connect(context.destination);
      Object.assign(runtime, { analyser, monitorGain, preset: state().audio.preset });
      const mime = recorderMime('audio');
      const recorder = new MediaRecorder(destination.stream, mime ? { mimeType: mime } : {});
      runtime.recorder = recorder; runtime.chunks = []; runtime.started = performance.now();
      recorder.ondataavailable = e => { if (e.data.size) runtime.chunks.push(e.data); };
      recorder.onerror = () => { status('Falha na gravação do microfone.', true); clearAudio(); };
      recorder.onstop = () => { if (!runtime.cancelled) void run(null, () => finalizeAudio(runtime)); };
      recorder.start(250); visualizer(runtime);
      $('#wsAudioRecord').disabled = true; $('#wsAudioStop').disabled = false;
      status('Gravando. Monitor desligado por padrão; use fones para ativar.');
    } catch (error) {
      stopStreams(runtime.streams);
      if (audioRuntime === runtime) clearAudio(); else void context.close().catch(() => {});
      throw error;
    }
  }
  async function finalizeAudio(runtime) {
    const blob = new Blob(runtime.chunks, { type: runtime.recorder.mimeType || 'audio/webm' });
    const duration = (performance.now() - runtime.started) / 1000, t = runtime.token;
    stopStreams(runtime.streams);
    if (audioRuntime === runtime) clearAudio();
    requireToken(t);
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const key = await saveAsset(blob, 'audio', `Microfone-${Date.now()}.${ext}`, uid(), t, { role: 'source' });
    requireToken(t);
    state().audio.tracks.push({ id: uid(), asset: key, name: 'Microfone', gain: 1, start: 0, muted: false, duration });
    B.commit(); renderAudio();
  }
  async function playAudio() {
    clearAudio();
    if (!state().audio.tracks.length) throw new Error('Adicione ao menos uma faixa.');
    const t = token(), context = audioContext(), runtime = { context, streams: [], sources: [] };
    audioRuntime = runtime;
    try {
      const tracks = await decodeTracks(t, context);
      if (audioRuntime !== runtime) throw new Error('Reprodução cancelada.');
      await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048;
      analyser.connect(context.destination); runtime.analyser = analyser;
      // Suspende enquanto agenda, para que todas as faixas comecem no mesmo relógio.
      await context.suspend();
      for (const track of tracks) routeTrack(context, track, analyser, state().audio.preset, runtime.sources, context.currentTime + .02);
      await context.resume(); visualizer(runtime);
      const end = Math.max(...tracks.map(track => track.start + track.buffer.duration));
      runtime.timer = setTimeout(() => { if (audioRuntime === runtime) clearAudio(); }, end * 1000 + 100);
    } catch (error) { if (audioRuntime === runtime) clearAudio(); throw error; }
  }
  async function renderAudioMix(t = token()) {
    const context = audioContext();
    let tracks;
    const preset = state().audio.preset;
    try { tracks = await decodeTracks(t, context); } finally { await context.close(); }
    requireToken(t);
    if (!tracks.length) throw new Error('Adicione ao menos uma faixa.');
    const duration = Math.max(...tracks.map(track => track.start + track.buffer.duration));
    if (duration > 3600) throw new Error('O mix deve ter no máximo uma hora.');
    const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * 48000)), 48000), sources = [];
    for (const track of tracks) routeTrack(offline, track, offline.destination, preset, sources);
    const mix = await offline.startRendering(); requireToken(t);
    return mix;
  }
  async function recordMix(buffer, t) {
    clearAudio();
    const context = audioContext(), destination = context.createMediaStreamDestination();
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
    const runtime = { context, streams: [destination.stream], sources: [source] };
    audioRuntime = runtime;
    try {
      await context.resume(); requireToken(t);
      const mime = recorderMime('audio');
      if (!mime.includes('webm')) throw new Error('Exportação WebM não suportada. Use WAV.');
      const recorder = new MediaRecorder(destination.stream, { mimeType: mime });
      runtime.recorder = recorder;
      return await new Promise((resolve, reject) => {
        const chunks = [];
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = () => reject(new Error('Falha ao codificar o mix.'));
        recorder.onstop = () => runtime.cancelled ? reject(new Error('Exportação cancelada.')) : resolve(new Blob(chunks, { type: mime }));
        source.onended = () => { if (recorder.state !== 'inactive') recorder.stop(); };
        recorder.start(250); source.start();
        status('Codificando WebM em tempo real…');
      });
    } finally { if (audioRuntime === runtime) clearAudio(); }
  }
  async function exportAudio(format) {
    const t = token(), audio = state().audio;
    audio.mixKey ||= uid();
    const key = audio.mixKey, mix = await renderAudioMix(t);
    const blob = format === 'wav' ? encodeWav(mix) : await recordMix(mix, t);
    requireToken(t);
    await saveAsset(blob, 'audio', `Mix.${format}`, key, t, { send: true });
    requireToken(t); state().audio.mixKey = key; B.commit();
  }
  function renderPixel() {
    const pixel = state().pixel;
    $('#wsPixelWidth').value = pixel.width; $('#wsPixelHeight').value = pixel.height;
    $('#wsPixelLayers').innerHTML = pixel.layers.map(layer => `<div class="ws-layer" aria-selected="${layer.id === pixel.selected}">
      <button data-pixel-select="${esc(layer.id)}">${esc(layer.name)}</button><button data-pixel-up="${esc(layer.id)}" aria-label="Trazer para frente">↑</button>
      <button data-pixel-down="${esc(layer.id)}" aria-label="Enviar para trás">↓</button><button data-pixel-remove="${esc(layer.id)}" aria-label="Remover camada">×</button></div>`).join('') || '<p>Adicione imagem, quadro ou texto.</p>';
    const layer = pixel.layers.find(layer => layer.id === pixel.selected);
    const range = (label, field, min, max, step = 1) => `<label>${esc(label)}<input data-pixel-field="${esc(field)}" type="range" min="${esc(min)}" max="${esc(max)}" step="${esc(step)}" value="${esc(layer[field])}"><output>${esc(layer[field])}</output></label>`;
    $('#wsPixelProps').innerHTML = !layer ? '' : `<div class="ws-controls">
      <label>X<input data-pixel-field="x" type="number" value="${esc(layer.x)}"></label><label>Y<input data-pixel-field="y" type="number" value="${esc(layer.y)}"></label>
      <label>Largura<input data-pixel-field="w" type="number" min="1" max="16384" value="${esc(layer.w)}"></label><label>Altura<input data-pixel-field="h" type="number" min="1" max="16384" value="${esc(layer.h)}"></label>
      ${range('Opacidade', 'opacity', 0, 1, .01)}${range('Brilho', 'brightness', 0, 200)}${range('Contraste', 'contrast', 0, 200)}
      ${range('Saturação', 'saturation', 0, 200)}${range('Matiz', 'hue', -180, 180)}
      ${layer.type === 'text' ? `<label>Texto<input data-pixel-field="text" value="${esc(layer.text)}"></label><label>Tamanho<input data-pixel-field="size" type="number" min="1" max="1000" value="${esc(layer.size)}"></label>
      <label>Cor<input data-pixel-field="color" type="color" value="${esc(layer.color)}"></label><label>Cor 2<input data-pixel-field="color2" type="color" value="${esc(layer.color2)}"></label>
      <label>Estilo<select data-pixel-field="style">${['solid', 'stroke', 'neon', 'gradient'].map((style, i) => `<option value="${style}" ${style === layer.style ? 'selected' : ''}>${['Sólido', 'Contorno', 'Neon', 'Degradê'][i]}</option>`).join('')}</select></label>
      ${range('Contorno', 'stroke', 0, 30)}${range('Neon', 'glow', 0, 100)}` : ''}</div>`;
    void run(null, () => drawPixel());
  }
  async function pixelImage(key, t) {
    const asset = state().assets[key];
    if (!asset) throw new Error('Imagem ausente do projeto.');
    const cached = pixelImages.get(key);
    if (cached?.revision === asset.revision) return cached.image;
    const blob = await readAsset(asset), image = await createImageBitmap(blob);
    if (!valid(t)) { image.close(); requireToken(t); }
    const current = pixelImages.get(key);
    if (current?.revision === asset.revision) { image.close(); return current.image; }
    current?.image.close();
    pixelImages.set(key, { image, revision: asset.revision });
    return image;
  }
  let pixelDrawVersion = 0;
  async function drawPixel(out = $('#wsPixelCanvas'), selection = true, t = token()) {
    const pixel = state().pixel, version = ++pixelDrawVersion;
    const layers = pixel.layers.map(layer => ({ ...layer }));
    const images = new Map();
    for (const layer of layers) if (layer.type === 'image') images.set(layer.id, await pixelImage(layer.asset, t));
    requireToken(t);
    if (selection && version !== pixelDrawVersion) return;
    out.width = pixel.width; out.height = pixel.height;
    const c = out.getContext('2d'); c.clearRect(0, 0, out.width, out.height);
    for (const layer of layers.slice().reverse()) {
      c.save(); c.globalAlpha = layer.opacity;
      c.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%) hue-rotate(${layer.hue}deg)`;
      if (layer.type === 'image') c.drawImage(images.get(layer.id), layer.x, layer.y, layer.w, layer.h);
      else {
        c.font = `700 ${layer.size}px sans-serif`; c.textBaseline = 'top'; c.lineJoin = 'round';
        c.fillStyle = layer.color;
        if (layer.style === 'gradient') {
          const gradient = c.createLinearGradient(layer.x, layer.y, layer.x + layer.w, layer.y + layer.h);
          gradient.addColorStop(0, layer.color); gradient.addColorStop(1, layer.color2); c.fillStyle = gradient;
        }
        if (layer.style === 'neon') { c.shadowColor = layer.color; c.shadowBlur = layer.glow; }
        c.strokeStyle = layer.color2; c.lineWidth = layer.stroke;
        for (const [index, text] of layer.text.split('\n').entries()) {
          const y = layer.y + index * layer.size * 1.2;
          if (layer.stroke > 0 || layer.style === 'stroke') c.strokeText(text, layer.x, y, layer.w);
          if (layer.style !== 'stroke') c.fillText(text, layer.x, y, layer.w);
        }
      }
      c.restore();
      if (selection && layer.id === pixel.selected) {
        c.save(); c.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
        c.lineWidth = Math.max(2, pixel.width / 400); c.strokeRect(layer.x, layer.y, layer.w, layer.h); c.restore();
      }
    }
  }
  function basePixel(type, name, w, h, extra = {}) {
    return { id: uid(), type, name, x: 0, y: 0, w, h, opacity: 1, brightness: 100, contrast: 100, saturation: 100, hue: 0, ...extra };
  }
  async function addPixelImage(blob, name, t = token()) {
    const image = await createImageBitmap(blob), w = image.width, h = image.height; image.close(); requireToken(t);
    const key = await saveAsset(blob, 'image', name, uid(), t, { role: 'source' }); requireToken(t);
    const pixel = state().pixel, scale = Math.min(1, pixel.width / w, pixel.height / h);
    const layer = basePixel('image', name, Math.round(w * scale), Math.round(h * scale), { asset: key });
    pixel.layers.unshift(layer); pixel.selected = layer.id; B.commit(); renderPixel();
  }
  async function savePixel() {
    const t = token(), canvas = document.createElement('canvas'), pixel = state().pixel;
    pixel.outputKey ||= uid();
    const key = pixel.outputKey;
    await drawPixel(canvas, false, t); requireToken(t);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG indisponível.')), 'image/png'));
    requireToken(t);
    await saveAsset(blob, 'image', 'Overlay.png', key, t, { send: true });
    requireToken(t); state().pixel.outputKey = key; B.commit();
  }
  function renderScript() {
    const script = state().script;
    $('#wsRequest').value = script.request;
    $('#wsScenes').innerHTML = script.scenes.map((scene, i) => `<tr>
      <td><textarea data-scene="${i}" data-scene-field="audio" aria-label="Áudio da cena ${i + 1}">${esc(scene.audio)}</textarea></td>
      <td><textarea data-scene="${i}" data-scene-field="video" aria-label="Vídeo da cena ${i + 1}">${esc(scene.video)}</textarea>
      <button data-scene-remove="${i}">Remover cena</button></td></tr>`).join('');
    for (const [id, key] of [['wsWebcam', 'webcam'], ['wsScreen', 'screen'], ['wsCaptureMic', 'mic'], ['wsSpeech', 'speech']]) $(`#${id}`).checked = script[key];
    $('#wsScrollSpeed').value = script.speed;
    updatePrompter(); unavailable();
    $('#wsCaptureResult').hidden = !lastSavedCapture;
  }
  let promptWords = [], speechCursor = 0;
  function updatePrompter() {
    const text = state().script.scenes.map(scene => scene.audio).join('\n\n');
    // Um span por palavra normalizada, preservando espaços e pontuação no texto.
    let index = 0;
    $('#wsPrompter').innerHTML = text.split(/([\p{L}\p{N}]+(?:[\u0300-\u036f]+)?)/gu).map(part =>
      wordsOf(part).length ? `<span data-word="${index++}">${esc(part)}</span>` : esc(part).replace(/\n/g, '<br>')).join('');
    promptWords = wordsOf(text); speechCursor = 0; $('#wsPrompter').scrollTop = 0;
  }
  function stopSpeech() {
    const current = recognition; recognition = null;
    try { current?.abort(); } catch (_) {}
  }
  function startSpeech(t) {
    if (!state().script.speech) return;
    const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!Recognition) { status('Acompanhamento de fala indisponível.', true); return; }
    const engine = new Recognition(); recognition = engine; engine.lang = 'pt-BR'; engine.continuous = true; engine.interimResults = true;
    let finalCursor = speechCursor;
    engine.onresult = event => {
      if (!valid(t) || recognition !== engine) return;
      let cursor = finalCursor;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        cursor = alignWords(promptWords, event.results[i][0].transcript, cursor);
        if (event.results[i].isFinal) finalCursor = cursor;
      }
      speechCursor = cursor;
      $('#wsPrompter').querySelectorAll('mark').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
      const span = $(`#wsPrompter [data-word="${Math.max(0, cursor - 1)}"]`);
      if (span && cursor) {
        const mark = document.createElement('mark'); mark.textContent = span.textContent; span.replaceChildren(mark);
        $('#wsPrompter').scrollTo({ top: Math.max(0, span.offsetTop - 30), behavior: 'smooth' });
      }
    };
    engine.onerror = event => { if (recognition === engine) { status(`Acompanhamento de fala: ${event.error}. Rolagem manual disponível.`, true); stopSpeech(); } };
    engine.onend = () => { if (recognition === engine) { recognition = null; status('Acompanhamento de fala encerrado.'); } };
    try { engine.start(); } catch (error) { stopSpeech(); status(error.message, true); }
  }
  async function generateScript() {
    if (aiBusy) return;
    const t = token(), request = $('#wsRequest').value.trim();
    if (!request) throw new Error('Descreva o vídeo primeiro.');
    const job = {};
    state().script.request = request; B.commit(); aiBusy = job;
    try {
      status('Gerando com o modelo local…');
      const result = await root.ChromeAIService.generateScript(request, {
        onDownloadProgress: value => { if (valid(t)) status(`Baixando modelo local: ${Math.round(value * 100)}%`); }
      });
      requireToken(t);
      if (!result) throw new Error(root.ChromeAIService.reason || 'IA local indisponível. Escreva o roteiro manualmente.');
      state().script.scenes = result.scenes; B.commit(); renderScript(); status('Roteiro local pronto para editar.');
    } finally { if (aiBusy === job) aiBusy = false; }
  }
  async function videoElement(stream) {
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    try { await video.play(); return video; } catch (error) { video.srcObject = null; throw error; }
  }
  function clearCapture() {
    stopSpeech();
    const runtime = capture; capture = null;
    if (!runtime) return;
    runtime.cancelled = true; cancelAnimationFrame(runtime.raf);
    try { if (runtime.recorder?.state !== 'inactive') runtime.recorder?.stop(); } catch (_) {}
    stopStreams(runtime.streams); stopStreams(runtime.output ? [runtime.output] : []);
    for (const video of runtime.videos || []) { video.pause(); video.srcObject = null; }
    void runtime.context?.close().catch(() => {});
    $('#wsCaptureStop').disabled = true; unavailable();
  }
  async function startCapture() {
    if (capture) return;
    const t = token(), script = { ...state().script };
    if (!script.webcam && !script.screen) throw new Error('Escolha webcam e/ou tela.');
    if (script.screen && !navigator.mediaDevices?.getDisplayMedia) throw new Error('Captura de tela indisponível neste navegador.');
    if ((script.webcam || script.mic) && !navigator.mediaDevices?.getUserMedia) throw new Error('Webcam/microfone indisponível.');
    const runtime = { token: t, streams: [], videos: [], cancelled: false };
    capture = runtime;
    try {
      // getDisplayMedia precisa ser a primeira chamada, ainda dentro do gesto do usuário.
      if (script.screen) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        runtime.streams.push(stream); requireToken(t);
        if (capture !== runtime) throw new Error('Captura cancelada.');
        runtime.screen = await videoElement(stream); runtime.videos.push(runtime.screen); requireToken(t);
      }
      if (script.webcam || script.mic) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: script.webcam ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : false, audio: script.mic });
        runtime.streams.push(stream); requireToken(t);
        if (capture !== runtime) throw new Error('Captura cancelada.');
        if (script.webcam) { runtime.webcam = await videoElement(stream); runtime.videos.push(runtime.webcam); requireToken(t); }
      }
      const canvas = $('#wsCaptureCanvas'), main = runtime.screen || runtime.webcam;
      const ratio = main.videoWidth / main.videoHeight || 16 / 9;
      canvas.width = Math.max(2, main.videoWidth || 1280); canvas.height = Math.max(2, Math.round(canvas.width / ratio));
      const context = canvas.getContext('2d'), bg = getComputedStyle(document.documentElement).getPropertyValue('--black');
      let previous = performance.now();
      const draw = time => {
        if (capture !== runtime || runtime.cancelled) return;
        context.fillStyle = bg; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(main, 0, 0, canvas.width, canvas.height);
        if (runtime.screen && runtime.webcam) {
          const width = canvas.width * .24, height = width * runtime.webcam.videoHeight / runtime.webcam.videoWidth;
          context.drawImage(runtime.webcam, canvas.width - width - 20, canvas.height - height - 20, width, height);
        }
        if (!recognition) $('#wsPrompter').scrollTop += Math.max(0, Math.min(.1, (time - previous) / 1000)) * state().script.speed;
        previous = time; runtime.raf = requestAnimationFrame(draw);
      };
      draw(previous);
      if (!canvas.captureStream) throw new Error('Gravação de canvas indisponível.');
      runtime.output = canvas.captureStream(30);
      const audioStreams = runtime.streams.filter(stream => stream.getAudioTracks().length);
      if (audioStreams.length) {
        runtime.context = audioContext(); await runtime.context.resume(); requireToken(t);
        const destination = runtime.context.createMediaStreamDestination();
        for (const stream of audioStreams) {
          // Inclui áudio da tela e microfone em uma única faixa do MediaRecorder.
          runtime.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(destination);
        }
        for (const track of destination.stream.getAudioTracks()) runtime.output.addTrack(track);
      }
      requireToken(t);
      const mime = recorderMime('video');
      const recorder = new MediaRecorder(runtime.output, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 });
      runtime.recorder = recorder; runtime.chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) runtime.chunks.push(event.data); };
      recorder.onstop = () => { if (!runtime.cancelled) void run(null, () => finalizeCapture(runtime)); };
      recorder.onerror = () => { status('Falha na gravação. Os dispositivos foram desligados.', true); clearCapture(); };
      for (const stream of runtime.streams) for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (capture === runtime && recorder.state !== 'inactive') recorder.stop();
      }, { once: true });
      runtime.started = performance.now();
      recorder.start(250); startSpeech(t);
      $('#wsCaptureStart').disabled = true; $('#wsCaptureStop').disabled = false; $('#wsCaptureResult').hidden = true;
      status('Gravando tela/webcam. Finalize para salvar no projeto.');
    } catch (error) {
      if (capture === runtime) clearCapture();
      else {
        stopStreams(runtime.streams); stopStreams(runtime.output ? [runtime.output] : []);
        for (const video of runtime.videos) { video.pause(); video.srcObject = null; }
      }
      throw error;
    }
  }
  async function finalizeCapture(runtime) {
    const t = runtime.token, blob = new Blob(runtime.chunks, { type: runtime.recorder.mimeType || 'video/webm' });
    const duration = Math.max(.001, (performance.now() - runtime.started) / 1000);
    if (capture === runtime) clearCapture(); else stopStreams(runtime.streams);
    requireToken(t);
    if (!blob.size) throw new Error('A gravação ficou vazia. Tente novamente.');
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const key = await saveAsset(blob, 'video', `Gravação-${Date.now()}.${ext}`, uid(), t, { duration, suppressAutoSend: true });
    requireToken(t);
    lastSavedCapture = key; state().script.captureKey = key; B.commit(); $('#wsCaptureResult').hidden = false;
    status('Gravação salva. Envie à timeline ou corte os silêncios.');
  }
  function cleanup() {
    epoch++;
    clearAudio(); clearCapture(); stopSpeech();
    root.ChromeAIService?.destroy(); aiBusy = false;
    pixelImages.forEach(entry => entry.image.close()); pixelImages.clear();
    urls.forEach(url => URL.revokeObjectURL(url)); urls.clear();
    pixelDrag = null; lastSavedCapture = null;
  }
  function activate(name, persist = true) {
    if (name === 'home') { cleanup(); B.home(); return; }
    if (!['video', 'audio', 'pixel', 'script', 'assets'].includes(name)) name = 'video';
    if (active !== name) cleanup();
    active = name; document.documentElement.dataset.workspace = name;
    $('#app').removeAttribute('data-sheet'); B.pause();
    document.querySelectorAll('.ws-module').forEach(el => { el.hidden = el.id !== `ws${name[0].toUpperCase() + name.slice(1)}`; });
    document.querySelectorAll('.ws-dock [data-workspace]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.workspace === name)));
    $('#wsDynamic').checked = state().dynamicLink;
    if (persist && state().active !== name) { state().active = name; B.commit(); }
    if (name === 'audio') renderAudio();
    if (name === 'pixel') renderPixel();
    if (name === 'script') { lastSavedCapture = state().script.captureKey || null; renderScript(); }
    if (name === 'assets') renderAssets();
    if (name === 'video') { root.dispatchEvent(new Event('resize')); B.refresh(); }
    unavailable();
  }
  const actions = {
    'audio-import': () => { audioPickToken = token(); $('#wsAudioInput').click(); },
    'audio-record': startAudioRecording,
    'audio-stop': () => { if (audioRuntime?.recorder?.state === 'recording') { audioRuntime.recorder.stop(); stopStreams(audioRuntime.streams); } },
    'audio-play': playAudio, 'audio-pause': clearAudio,
    'audio-wav': () => exportAudio('wav'), 'audio-webm': () => exportAudio('webm'),
    'pixel-import': () => { pixelPickToken = token(); $('#wsPixelInput').click(); },
    'pixel-frame': async () => { const t = token(), blob = await B.frame(); requireToken(t); await addPixelImage(blob, 'Quadro.png', t); },
    'pixel-text': () => {
      const pixel = state().pixel, size = Math.max(24, Math.round(pixel.width / 12));
      const layer = basePixel('text', 'Texto', pixel.width * .8, size * 1.4, {
        x: pixel.width * .1, y: pixel.height * .1, text: 'Seu texto', size, color: '#ffffff', color2: '#121212', style: 'solid', stroke: 0, glow: 20
      });
      pixel.layers.unshift(layer); pixel.selected = layer.id; B.commit(); renderPixel();
    },
    'pixel-save': savePixel, 'script-generate': generateScript,
    'script-add': () => { state().script.scenes.push({ audio: '', video: '' }); B.commit(); renderScript(); },
    'script-reset': updatePrompter,
    'capture-start': startCapture,
    'capture-stop': () => { if (capture?.recorder?.state === 'recording') { capture.recorder.stop(); stopStreams(capture.streams); } },
    'capture-send': async () => {
      if (!lastSavedCapture) return;
      const t = token(), id = await sendAsset(lastSavedCapture, t); requireToken(t);
      root.__motion.select(id); activate('video');
    },
    'capture-silence': async () => {
      if (!lastSavedCapture) return;
      const t = token(), id = await sendAsset(lastSavedCapture, t); requireToken(t);
      root.__motion.select(id); activate('video'); B.silence();
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || home) return;
    if (button.dataset.workspace) { activate(button.dataset.workspace); return; }
    if (button.dataset.action && actions[button.dataset.action]) { void run(button, actions[button.dataset.action]); return; }
    if (button.dataset.send) { void run(button, () => sendAsset(button.dataset.send)); return; }
    if (button.dataset.replace) {
      const asset = state().assets[button.dataset.replace], input = $('#wsReplaceInput');
      replacePickToken = token();
      input.dataset.key = asset.key; input.accept = `${asset.kind}/*`; input.click(); return;
    }
    if (button.dataset.download) {
      void run(button, async () => {
        const t = token(), asset = state().assets[button.dataset.download], file = await readAsset(asset); requireToken(t);
        const link = document.createElement('a'), url = objectURL(file); link.href = url; link.download = asset.name; link.click();
        setTimeout(() => releaseURL(url), 10000);
      }); return;
    }
    if (button.dataset.trackRemove) {
      clearAudio(); state().audio.tracks = state().audio.tracks.filter(track => track.id !== button.dataset.trackRemove); B.commit(); renderAudio(); return;
    }
    if (button.dataset.sceneRemove !== undefined) {
      state().script.scenes.splice(+button.dataset.sceneRemove, 1); B.commit(); renderScript(); return;
    }
    const pixel = state().pixel;
    if (button.dataset.pixelSelect) { pixel.selected = button.dataset.pixelSelect; B.commit(); renderPixel(); return; }
    for (const [key, delta] of [['pixelUp', -1], ['pixelDown', 1], ['pixelRemove', 0]]) {
      if (!button.dataset[key]) continue;
      const index = pixel.layers.findIndex(layer => layer.id === button.dataset[key]); if (index < 0) return;
      if (!delta) { pixel.layers.splice(index, 1); if (pixel.selected === button.dataset[key]) pixel.selected = null; }
      else {
        const next = Math.max(0, Math.min(pixel.layers.length - 1, index + delta));
        const [layer] = pixel.layers.splice(index, 1); pixel.layers.splice(next, 0, layer);
      }
      B.commit(); renderPixel(); return;
    }
  });
  $('#wsAudioInput').onchange = event => {
    const files = [...event.target.files], t = audioPickToken || token(); audioPickToken = null;
    event.target.value = ''; void run(null, () => importAudio(files, t));
  };
  $('#wsPixelInput').onchange = event => {
    const files = [...event.target.files], t = pixelPickToken || token(); pixelPickToken = null; event.target.value = '';
    void run(null, async () => { for (const file of files) { requireToken(t); await addPixelImage(file, file.name, t); } });
  };
  $('#wsReplaceInput').onchange = event => {
    const file = event.target.files[0], key = event.target.dataset.key, t = replacePickToken || token(); replacePickToken = null; event.target.value = '';
    if (!file) return;
    void run(null, async () => {
      requireToken(t);
      const asset = state().assets[key];
      if (!asset || file.type.split('/')[0] !== asset.kind) throw new Error('Escolha o mesmo tipo de mídia.');
      await saveAsset(file, asset.kind, file.name, key, t);
    });
  };
  $('#wsDynamic').onchange = event => { state().dynamicLink = event.target.checked; B.commit(); };
  $('#wsVoice').onchange = event => { state().audio.preset = event.target.checked; clearAudio(); B.commit(); };
  $('#wsMonitor').onchange = event => {
    state().audio.monitor = event.target.checked;
    if (audioRuntime?.monitorGain) audioRuntime.monitorGain.gain.value = event.target.checked ? 1 : 0;
    B.commit();
  };
  $('#wsRequest').oninput = event => { state().script.request = event.target.value; B.commit(); };
  for (const [id, key] of [['wsWebcam', 'webcam'], ['wsScreen', 'screen'], ['wsCaptureMic', 'mic'], ['wsSpeech', 'speech'], ['wsScrollSpeed', 'speed']]) {
    $(`#${id}`).onchange = event => {
      state().script[key] = key === 'speed' ? +event.target.value : event.target.checked; B.commit();
      if (key === 'speech' && capture) { stopSpeech(); if (event.target.checked) startSpeech(token()); }
    };
  }
  $('#wsScenes').addEventListener('input', event => {
    const el = event.target;
    if (el.dataset.scene === undefined) return;
    const scene = state().script.scenes[+el.dataset.scene];
    if (scene) { scene[el.dataset.sceneField] = el.value; B.commit(); updatePrompter(); }
  });
  $('#wsTracks').addEventListener('change', event => {
    const el = event.target, track = state().audio.tracks.find(track => track.id === el.closest('[data-track]')?.dataset.track);
    if (!track || !el.dataset.trackField) return;
    const field = el.dataset.trackField;
    track[field] = field === 'name' ? el.value : field === 'muted' ? el.checked : number(el.value, 0, field === 'gain' ? 2 : 3600);
    clearAudio(); B.commit();
  });
  for (const [id, field] of [['wsPixelWidth', 'width'], ['wsPixelHeight', 'height']]) $(`#${id}`).onchange = event => {
    state().pixel[field] = Math.round(number(event.target.value, 1, 8192, 1080)); B.commit(); renderPixel();
  };
  $('#wsPixelProps').addEventListener('input', event => {
    const el = event.target, field = el.dataset.pixelField, pixel = state().pixel, layer = pixel.layers.find(layer => layer.id === pixel.selected);
    if (!field || !layer) return;
    layer[field] = ['text', 'color', 'color2', 'style'].includes(field) ? el.value :
      number(el.value, ['w', 'h', 'size'].includes(field) ? 1 : field === 'x' || field === 'y' ? -16384 : field === 'hue' ? -180 : 0,
        ['w', 'h', 'x', 'y'].includes(field) ? 16384 : field === 'opacity' ? 1 : 1000);
    if (el.nextElementSibling?.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.value;
    void run(null, () => drawPixel());
  });
  $('#wsPixelProps').addEventListener('change', () => B.commit());
  const pixelCanvas = $('#wsPixelCanvas');
  const point = event => {
    const rect = pixelCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * pixelCanvas.width / rect.width, y: (event.clientY - rect.top) * pixelCanvas.height / rect.height };
  };
  pixelCanvas.onpointerdown = event => {
    if (event.button !== 0) return;
    const pixel = state().pixel, p = point(event), layer = pixel.layers.find(layer => p.x >= layer.x && p.x <= layer.x + layer.w && p.y >= layer.y && p.y <= layer.y + layer.h);
    if (!layer) { pixel.selected = null; renderPixel(); return; }
    pixel.selected = layer.id; pixelDrag = { id: event.pointerId, layer, start: p, x: layer.x, y: layer.y };
    pixelCanvas.setPointerCapture(event.pointerId); renderPixel();
  };
  pixelCanvas.onpointermove = event => {
    if (!pixelDrag || pixelDrag.id !== event.pointerId) return;
    const p = point(event), { layer, start, x, y } = pixelDrag;
    layer.x = Math.round(x + p.x - start.x); layer.y = Math.round(y + p.y - start.y);
    void run(null, () => drawPixel());
  };
  const endPixel = event => {
    if (!pixelDrag || pixelDrag.id !== event.pointerId) return;
    if (event.type === 'pointercancel') { pixelDrag.layer.x = pixelDrag.x; pixelDrag.layer.y = pixelDrag.y; }
    pixelDrag = null; B.commit(); renderPixel();
  };
  pixelCanvas.onpointerup = endPixel; pixelCanvas.onpointercancel = endPixel;
  root.addEventListener('motion:project', event => {
    if (event.detail.reason === 'commit') return;
    cleanup(); project = B.project();
    if (!home) activate(state().active, false);
  });
  root.addEventListener('motion:view', event => {
    home = event.detail.home;
    if (home) { cleanup(); document.documentElement.removeAttribute('data-workspace'); }
    else { project = B.project(); activate(state().active, false); }
  });
  // O editor possui atalhos globais: digitar ou arrastar nos módulos não pode alterar a timeline escondida.
  document.addEventListener('keydown', event => {
    if (home || active === 'video') return;
    event.stopImmediatePropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); B.save();
    } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault(); $('#btnUndo').click();
    } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || event.shiftKey && event.key.toLowerCase() === 'z')) {
      event.preventDefault(); $('#btnRedo').click();
    }
  }, true);
  root.addEventListener('pagehide', () => { cleanup(); stopStorageMonitor(); channel?.close(); channel = null; });
  root.addEventListener('pageshow', () => { startStorageMonitor(); connectAssetChannel(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopStorageMonitor(); clearAudio(); if (capture?.recorder?.state === 'recording') capture.recorder.stop();
    } else { startStorageMonitor(); unavailable(); }
  });
  startStorageMonitor();
  navigator.getBattery?.().then(battery => {
    const update = () => { $('#wsBattery').textContent = `${battery.charging ? '⚡' : 'Bateria'} ${Math.round(battery.level * 100)}%`; };
    update(); battery.addEventListener('levelchange', update); battery.addEventListener('chargingchange', update);
  }).catch(() => {});
  root.ChromeAIService.checkAvailability().then(availability => {
    $('#wsAI').textContent = availability === 'available' ? 'IA: local' : availability === 'after-download' ? 'IA: baixar modelo' : availability === 'downloading' ? 'IA: baixando' : 'IA: indisponível';
    $('#wsGenerate').disabled = availability === 'unavailable';
    if (availability === 'unavailable') $('#wsAIHelp').textContent = 'IA local indisponível neste navegador. Escreva o roteiro manualmente; nenhuma resposta é simulada.';
  });
  project = B.project();
  if (project && !home) activate(state().active, false);
  unavailable();
  const subscriptions = new Map();
  const snapshot = section => structuredClone(section ? state()[section] : state());
  const projectInfo = () => {
    const p = B.project();
    return p ? Object.freeze({ id: p.id, name: p.name, width: p.width, height: p.height, duration: p.duration }) : null;
  };
  root.WorkstationShell = Object.freeze({
    activate, getProject: projectInfo, getState: () => snapshot(), refreshStorage: storageStatus,
    setDynamicLink(enabled) {
      state().dynamicLink = !!enabled; $('#wsDynamic').checked = !!enabled; B.commit();
    }
  });
  root.ProjectAssetBus = Object.freeze({
    getProject: projectInfo,
    list: () => structuredClone(Object.values(state().assets)),
    get: key => structuredClone(state().assets[key] || null),
    save: (blob, kind, name, options = {}) => saveAsset(blob, kind, name, options.key, token(), options),
    send: key => sendAsset(key),
    async read(key) {
      const t = token(), asset = state().assets[key];
      if (!asset) throw new Error('Arquivo não encontrado neste projeto.');
      const file = await readAsset(asset); requireToken(t); return file;
    },
    subscribe(listener, { replay = true } = {}) {
      if (typeof listener !== 'function') throw new TypeError('O assinante deve ser uma função.');
      root.ProjectAssetBus.unsubscribe(listener);
      const handler = event => {
        if (event.detail.projectId === B.project()?.id) listener(structuredClone(event.detail));
      };
      subscriptions.set(listener, handler); root.addEventListener('workstation:asset', handler);
      if (replay) for (const asset of Object.values(state().assets)) listener(structuredClone({
        type: 'existing', sender, projectId: B.project().id, asset
      }));
      return () => {
        if (subscriptions.get(listener) === handler) root.ProjectAssetBus.unsubscribe(listener);
      };
    },
    unsubscribe(listener) {
      const handler = subscriptions.get(listener);
      if (handler) root.removeEventListener('workstation:asset', handler);
      subscriptions.delete(listener);
    }
  });
  root.AudioLabModule = Object.freeze({
    getProject: projectInfo, getState: () => snapshot('audio'),
    importFiles: files => importAudio(files), play: playAudio, stop: clearAudio,
    startRecording: startAudioRecording, stopRecording: actions['audio-stop'],
    renderMix: () => renderAudioMix(), exportMix: exportAudio, voiceChain, encodeWav
  });
  root.PixelStudioModule = Object.freeze({
    getProject: projectInfo, getState: () => snapshot('pixel'),
    importImage: (blob, name = 'Imagem.png') => addPixelImage(blob, name),
    addText: actions['pixel-text'], importFrame: actions['pixel-frame'],
    render: () => drawPixel(), saveOverlay: savePixel
  });
  root.AIScriptCamModule = Object.freeze({
    getProject: projectInfo, getState: () => snapshot('script'),
    generateScript, startCapture, stopCapture: actions['capture-stop'],
    sendCapture: actions['capture-send'], sendAndCutCapture: actions['capture-silence'],
    resetPrompter: updatePrompter
  });
  root.CreatorWorkstation = { state, activate, saveAsset, sendAsset, readAsset, renderAudioMix, drawPixel, encodeWav, voiceChain, alignWords, recorderMime };
})(typeof globalThis !== 'undefined' ? globalThis : this);
