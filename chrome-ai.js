(function (root) {
  'use strict';

  const jobs = new Set();
  const sessions = new Set();
  const disposed = new WeakSet();
  let generation = 0;
  let reason = '';

  function fail(message) {
    reason = message;
    return null;
  }

  function dispose(session) {
    if (!session || disposed.has(session)) return;
    disposed.add(session);
    sessions.delete(session);
    try {
      Promise.resolve(session.destroy?.()).catch(() => {});
    } catch (_) {}
  }

  function begin() {
    const job = { generation, controller: new AbortController() };
    jobs.add(job);
    reason = '';
    return job;
  }

  function alive(job) {
    return job.generation === generation && !job.controller.signal.aborted;
  }

  async function create(api, options, job) {
    if (!api || typeof api.create !== 'function' || !alive(job)) return null;
    const session = await api.create({ ...options, signal: job.controller.signal });
    if (!alive(job)) {
      dispose(session);
      return null;
    }
    if (session) sessions.add(session);
    return session;
  }

  function monitor(options = {}) {
    return (download) => {
      download.addEventListener('downloadprogress', (event) => {
        const loaded = Number(event.loaded);
        const total = Number(event.total);
        if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
        const pct = Math.max(0, Math.min(1, loaded / total));
        for (const callback of new Set([service.onDownloadProgress, options.onDownloadProgress])) {
          if (typeof callback !== 'function') continue;
          try { callback.call(service, pct); } catch (_) {}
        }
      });
    };
  }

  /** Adapta availability/create das APIs modernas e capabilities legadas; null se ausentes. */
  function getAPI(name = 'LanguageModel') {
    const host = root.self || root;
    const names = {
      LanguageModel: 'languageModel',
      Summarizer: 'summarizer',
      Translator: 'translator',
      LanguageDetector: 'languageDetector'
    };
    const canonical = Object.keys(names).find((key) => key === name || names[key] === name);
    if (!canonical) return null;
    const api = host[canonical] || host.ai?.[names[canonical]];
    if (!api) return null;
    return {
      async availability(options = {}) {
        const state = typeof api.availability === 'function'
          ? await api.availability(options)
          : (await api.capabilities?.(options))?.available;
        if (state === 'available' || state === 'readily') return 'available';
        if (state === 'downloadable' || state === 'after-download') return 'after-download';
        if (state === 'downloading') return 'downloading';
        return 'unavailable';
      },
      create(options = {}) {
        return typeof api.create === 'function' ? api.create(options) : null;
      }
    };
  }

  /** Consulta disponibilidade e normaliza os estados modernos e legados. */
  async function checkAvailability(name = 'LanguageModel', options = {}) {
    try {
      const api = getAPI(name);
      if (!api) return 'unavailable';
      return await api.availability(options);
    } catch (_) {
      return 'unavailable';
    }
  }

  function parseJSON(text) {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text); } catch (_) {}
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '{' && text[start] !== '[') continue;
      const stack = [];
      let quoted = false;
      let escaped = false;
      for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === '{' || char === '[') stack.push(char);
        else if (char === '}' || char === ']') {
          if (stack.pop() !== (char === '}' ? '{' : '[')) break;
          if (!stack.length) {
            try { return JSON.parse(text.slice(start, i + 1)); } catch (_) { break; }
          }
        }
      }
    }
    return null;
  }

  function unsupported(error) {
    return error?.name === 'NotSupportedError' || error?.name === 'TypeError';
  }

  async function jsonPrompt(session, prompt, schema, job) {
    let text;
    try {
      text = await session.prompt(prompt, {
        responseConstraint: schema,
        signal: job.controller.signal
      });
    } catch (error) {
      if (!unsupported(error) || !alive(job)) throw error;
      text = await session.prompt(prompt, { signal: job.controller.signal });
    }
    return alive(job) ? parseJSON(text) : null;
  }

  function segmentsOf(transcript) {
    return Array.isArray(transcript) ? transcript : transcript?.segments || [];
  }

  function nonempty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  const timestampPattern = '^(?:[0-9]{2,}:)?[0-5][0-9]:[0-5][0-9]$';

  function chapterTime(value) {
    if (typeof value === 'number') {
      return value >= 0 && Number.isSafeInteger(Math.floor(value)) ? value : NaN;
    }
    if (typeof value !== 'string' || !new RegExp(timestampPattern).test(value)) return NaN;
    const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    return Number.isSafeInteger(seconds) ? seconds : NaN;
  }

  function formatChapterTime(seconds) {
    const whole = Math.floor(seconds);
    const parts = [Math.floor(whole / 60) % 60, whole % 60];
    if (whole >= 3600) parts.unshift(Math.floor(whole / 3600));
    return parts.map((part) => String(part).padStart(2, '0')).join(':');
  }

  const metadataSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['titles', 'description', 'tags', 'chapters'],
    properties: {
      titles: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      chapters: {
        type: 'array',
        items: {
          type: 'object', required: ['time', 'title'], additionalProperties: false,
          properties: { time: { type: 'string', pattern: timestampPattern }, title: { type: 'string' } }
        }
      }
    }
  };

  /** Captura um quadro JPEG e o descreve; falhas retornam null e definem reason em pt-BR. */
  async function analyzeVideoFrame(video, promptText, options = {}) {
    if (promptText && typeof promptText === 'object') {
      options = promptText;
      promptText = options.prompt;
    }
    if (typeof promptText !== 'string') promptText = 'Descreva este quadro em português do Brasil.';
    const job = begin();
    let session;
    try {
      if (!getAPI()) return fail('IA do navegador indisponível.');
      const canvas = root.document?.createElement('canvas');
      if (!canvas) return fail('Captura de imagem indisponível.');
      canvas.width = video.videoWidth || video.width;
      canvas.height = video.videoHeight || video.height;
      if (!(canvas.width > 0 && canvas.height > 0)) return fail('O vídeo ainda não tem um quadro disponível.');
      const context = canvas.getContext('2d');
      if (!context) return fail('Captura de imagem indisponível.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob || !alive(job)) return fail('Não foi possível capturar o quadro.');
      session = await create(getAPI(), {
        expectedInputs: [{ type: 'image' }, { type: 'text' }],
        monitor: monitor(options)
      }, job);
      if (!session) return fail('Análise de imagem indisponível.');
      const text = await session.prompt([{
        role: 'user',
        content: [
          { type: 'image', value: blob },
          { type: 'text', value: promptText }
        ]
      }], { signal: job.controller.signal });
      return alive(job) && nonempty(text) ? text : fail('Não foi possível analisar o quadro.');
    } catch (_) {
      return fail('Não foi possível analisar o quadro com a IA do navegador.');
    } finally {
      dispose(session);
      jobs.delete(job);
    }
  }

  /** Gera JSON validado com cinco títulos, descrição, tags e capítulos temporizados. */
  async function generateVideoMetadata(transcriptText, options = {}) {
    const job = begin();
    let session;
    try {
      session = await create(getAPI(), { monitor: monitor(options) }, job);
      if (!session) return fail('IA do navegador indisponível.');
      const data = await jsonPrompt(session,
        'Gere metadados em português do Brasil. Retorne somente JSON com exatamente cinco titles, ' +
        'description, tags e chapters [{time: "00:00", title}]. time deve ser uma string ' +
        'no formato MM:SS ou HH:MM:SS, com minutos e segundos de 00 a 59. Transcrição:\n' +
        JSON.stringify(transcriptText),
        metadataSchema, job);
      if (!data || !Array.isArray(data.titles) || data.titles.length !== 5 ||
          !data.titles.every(nonempty) || !nonempty(data.description) ||
          !Array.isArray(data.tags) || !data.tags.every(nonempty) ||
          !Array.isArray(data.chapters)) return fail('Metadados inválidos retornados pela IA.');
      let previous = -1;
      for (const chapter of data.chapters) {
        const time = chapterTime(chapter?.time);
        if (!Number.isFinite(time) || time < previous || !nonempty(chapter?.title)) {
          return fail('Capítulos inválidos retornados pela IA.');
        }
        previous = time;
        if (typeof chapter.time === 'number') chapter.time = formatChapterTime(time);
      }
      return data;
    } catch (_) {
      return fail('Não foi possível gerar os metadados.');
    } finally {
      dispose(session);
      jobs.delete(job);
    }
  }

  /** Sugere cortes ordenados, finitos e limitados ao intervalo da transcrição. */
  async function suggestSmartCuts(transcript, options = {}) {
    const valid = segmentsOf(transcript).filter((item) =>
      Number.isFinite(item?.start) && Number.isFinite(item?.end) &&
      item.start >= 0 && item.start < item.end);
    if (!valid.length) return fail('Transcrição sem tempos válidos.');
    const min = Math.min(...valid.map((item) => item.start));
    const max = Math.max(...valid.map((item) => item.end));
    const job = begin();
    let session;
    try {
      session = await create(getAPI(), { monitor: monitor(options) }, job);
      if (!session) return fail('IA do navegador indisponível.');
      const data = await jsonPrompt(session,
        'Sugira trechos para manter. Retorne somente JSON [{start, end, reason}], com tempos em segundos ' +
        'positivos e reason como justificativa em texto. Transcrição:\n' +
        JSON.stringify(transcript), {
          type: 'array', items: {
            type: 'object', required: ['start', 'end', 'reason'], additionalProperties: false,
            properties: { start: { type: 'number' }, end: { type: 'number' }, reason: { type: 'string' } }
          }
        }, job);
      const cuts = Array.isArray(data) ? data : data?.cuts;
      if (!Array.isArray(cuts)) return fail('Cortes inválidos retornados pela IA.');
      return cuts.filter((cut) => Number.isFinite(cut?.start) && Number.isFinite(cut?.end) &&
        typeof cut.reason === 'string' &&
        cut.start >= 0 && cut.end > 0 && cut.start < cut.end)
        .map((cut) => ({ start: Math.max(min, cut.start), end: Math.min(max, cut.end), reason: cut.reason }))
        .filter((cut) => cut.start < cut.end)
        .sort((a, b) => a.start - b.start || a.end - b.end);
    } catch (_) {
      return fail('Não foi possível sugerir os cortes.');
    } finally {
      dispose(session);
      jobs.delete(job);
    }
  }

  /** Traduz legendas para um novo array preservando os tempos e demais campos. */
  async function translateSubtitles(subtitles, targetLanguage, options = {}) {
    if (!Array.isArray(subtitles) || !nonempty(targetLanguage) ||
        !subtitles.every((item) => typeof item?.text === 'string')) return fail('Legendas ou idioma inválidos.');
    const job = begin();
    let detector;
    let translator;
    let model;
    try {
      let sourceLanguage = options.sourceLanguage || 'pt';
      if (!options.sourceLanguage && getAPI('LanguageDetector') && subtitles.length) {
        try {
          detector = await create(getAPI('LanguageDetector'), { monitor: monitor(options) }, job);
          const detection = await detector?.detect(subtitles.map((item) => item.text).join('\n'),
            { signal: job.controller.signal });
          if (nonempty(detection?.[0]?.detectedLanguage)) sourceLanguage = detection[0].detectedLanguage;
        } catch (_) {}
      }
      if (!alive(job)) return fail('Tradução cancelada.');
      try {
        translator = await create(getAPI('Translator'), {
          sourceLanguage, targetLanguage, monitor: monitor(options)
        }, job);
      } catch (_) {}
      const result = [];
      for (const subtitle of subtitles) {
        if (!alive(job)) return fail('Tradução cancelada.');
        let text;
        if (!subtitle.text.trim()) text = subtitle.text;
        else if (translator) {
          try {
            text = await translator.translate(subtitle.text, { signal: job.controller.signal });
          } catch (_) {
            dispose(translator);
            translator = null;
          }
        }
        if (text === undefined) {
          if (!model) model = await create(getAPI(), { monitor: monitor(options) }, job);
          if (!model) return fail('Tradução indisponível neste navegador.');
          text = await model.prompt(
            `Traduza de ${sourceLanguage} para ${targetLanguage}. Retorne somente a tradução:\n${subtitle.text}`,
            { signal: job.controller.signal });
        }
        if (typeof text !== 'string' || !alive(job)) return fail('Não foi possível traduzir as legendas.');
        result.push({ ...subtitle, text });
      }
      return alive(job) ? result : fail('Tradução cancelada.');
    } catch (_) {
      return fail('Não foi possível traduzir as legendas.');
    } finally {
      dispose(detector);
      dispose(translator);
      dispose(model);
      jobs.delete(job);
    }
  }

  /** Cancela operações e destrói sessões atuais e sessões que ainda estão sendo criadas. */
  function destroy() {
    generation++;
    for (const job of jobs) job.controller.abort();
    for (const session of sessions) dispose(session);
    reason = 'Operação cancelada.';
  }

  const service = {
    getAPI, checkAvailability, availability: checkAvailability, analyzeVideoFrame,
    generateVideoMetadata, generateMetadata: generateVideoMetadata,
    suggestSmartCuts, translateSubtitles, destroy,
    /** Callback público substituível; recebe a fração baixada entre 0 e 1. */
    onDownloadProgress(pct) {},
    get reason() { return reason; }
  };
  root.ChromeAIService = service;
  if (typeof module !== 'undefined' && module.exports) module.exports = service;
})(typeof globalThis !== 'undefined' ? globalThis : this);
