(function (root) {
  'use strict';

  let wantsLock = false;
  let lock = null;
  let pending = null;
  let pendingVersion = 0;
  let version = 0;
  let listening = false;
  let consuming = null;

  async function releaseSentinel(sentinel) {
    try { await sentinel?.release(); } catch (_) {}
  }

  function visible() {
    return !root.document || root.document.visibilityState !== 'hidden';
  }

  async function requestLock() {
    if (!wantsLock || !visible() || !root.navigator?.wakeLock?.request) return false;
    if (lock && !lock.released) return true;
    if (pending) {
      if (pendingVersion === version) return pending;
      await pending;
      return requestLock();
    }
    const current = version;
    const request = (async () => {
      let sentinel;
      try {
        sentinel = await root.navigator.wakeLock.request('screen');
        if (!wantsLock || !visible() || version !== current) {
          await releaseSentinel(sentinel);
          return false;
        }
        lock = sentinel;
        sentinel.addEventListener?.('release', () => {
          if (lock === sentinel) lock = null;
        }, { once: true });
        return !sentinel.released;
      } catch (_) {
        return false;
      }
    })();
    pending = request;
    pendingVersion = current;
    try {
      return await request;
    } finally {
      if (pending === request) pending = null;
      if (version !== current && wantsLock && visible()) void requestLock();
    }
  }

  function onVisibility() {
    if (visible()) {
      if (wantsLock) void requestLock();
    } else {
      version++;
      const previous = lock;
      lock = null;
      void releaseSentinel(previous);
    }
  }

  /** Solicita bloqueio de tela; reativa ao voltar à aba enquanto o usuário o desejar. */
  async function enableWakeLock() {
    wantsLock = true;
    if (!listening && root.document?.addEventListener) {
      root.document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
    return requestLock();
  }

  /** Desativa o bloqueio, inclusive se uma solicitação ainda estiver pendente. */
  async function releaseWakeLock() {
    wantsLock = false;
    version++;
    const previous = lock;
    lock = null;
    const request = pending;
    await releaseSentinel(previous);
    if (request) await request;
  }

  function validId(fileId) {
    return typeof fileId === 'string' && fileId.trim().length > 0 &&
      fileId !== '.' && fileId !== '..' && !/[/\\\u0000-\u001f]/.test(fileId);
  }

  /** Informa se o navegador oferece armazenamento OPFS assíncrono. */
  function isSupported() {
    return typeof root.navigator?.storage?.getDirectory === 'function';
  }

  async function mediaDirectory(create) {
    if (!isSupported()) return null;
    const directory = await root.navigator.storage.getDirectory();
    return directory.getDirectoryHandle('media', { create });
  }

  /** Salva um Blob no OPFS com id sem caminhos; retorna false em caso de falha. */
  async function save(fileId, blob) {
    if (!validId(fileId) || typeof root.Blob !== 'function' || !(blob instanceof root.Blob)) return false;
    let writable;
    try {
      const directory = await mediaDirectory(true);
      if (!directory) return false;
      const file = await directory.getFileHandle(fileId, { create: true });
      if (typeof file.createWritable !== 'function') return false;
      writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (_) {
      try { await writable?.abort?.(); } catch (_) {}
      return false;
    }
  }

  /** Carrega mídia como URL de objeto; o chamador deve revogá-la após o uso. */
  async function load(fileId) {
    if (!validId(fileId)) return null;
    try {
      const directory = await mediaDirectory(false);
      if (!directory) return null;
      const handle = await directory.getFileHandle(fileId);
      return root.URL.createObjectURL(await handle.getFile());
    } catch (_) {
      return null;
    }
  }

  /** Exclui um id do OPFS e retorna se a remoção foi concluída. */
  async function deleteMedia(fileId) {
    if (!validId(fileId)) return false;
    try {
      const directory = await mediaDirectory(false);
      if (!directory) return false;
      await directory.removeEntry(fileId);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Lista apenas os ids dos arquivos na pasta media; indisponibilidade retorna []. */
  async function list() {
    try {
      const directory = await mediaDirectory(false);
      if (!directory) return [];
      const ids = [];
      for await (const [id, handle] of directory.entries()) {
        if (handle.kind === 'file' && validId(id)) ids.push(id);
      }
      return ids.sort();
    } catch (_) {
      return [];
    }
  }

  /** Vibra em snap, success ou longpress; retorna false quando não há suporte. */
  function haptic(type = 'snap') {
    const patterns = { snap: 10, success: [15, 30, 15], longpress: 5 };
    if (!Object.prototype.hasOwnProperty.call(patterns, type)) return false;
    try {
      return Boolean(root.navigator?.vibrate?.(patterns[type]));
    } catch (_) {
      return false;
    }
  }

  /** Entrega arquivos compartilhados ao callback e apaga apenas as entregas bem-sucedidas. */
  async function consumeSharedMedia(onFile) {
    if (typeof onFile !== 'function' || !root.caches?.open || typeof root.File !== 'function') return 0;
    if (consuming) return consuming;
    consuming = (async () => {
      let count = 0;
      try {
        const cache = await root.caches.open('shared-media');
        for (const request of await cache.keys()) {
          try {
            const response = await cache.match(request);
            if (!response) continue;
            const encoded = response.headers.get('filename') || response.headers.get('X-Filename') ||
              response.headers.get('X-File-Name');
            const filename = encoded ? decodeURIComponent(encoded) : 'midia';
            const blob = await response.blob();
            const file = new root.File([blob], filename, {
              type: blob.type || response.headers.get('Content-Type') || ''
            });
            const result = await onFile(file);
            if (result === false) continue;
            if (await cache.delete(request)) count++;
          } catch (_) {}
        }
      } catch (_) {}
      return count;
    })();
    try {
      return await consuming;
    } finally {
      consuming = null;
    }
  }

  const service = {
    wakeLock: { enable: enableWakeLock, release: releaseWakeLock },
    opfs: { save, load, delete: deleteMedia, list, isSupported },
    enableWakeLock, releaseWakeLock, haptic, consumeSharedMedia,
    saveMediaToOPFS: save, loadMediaFromOPFS: load, deleteMediaFromOPFS: deleteMedia,
    listMediaInOPFS: list, isSupported, triggerHaptic: haptic
  };
  root.MobilePWAIntegration = service;
  if (typeof module !== 'undefined' && module.exports) module.exports = service;
})(typeof globalThis !== 'undefined' ? globalThis : this);
