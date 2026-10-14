(function (root) {
  'use strict';

  /** Controlador de toque com escala, estado e alterações fornecidos pelo editor. */
  class TimelineTouchEngine {
    /** Instala os eventos na área fornecida, sem interceptar mouse ou keyframes. */
    constructor(element, options) {
      this.element = element;
      this.options = options;
      this.pointers = new Map();
      this.isDraggingClip = false;
      this.snapped = false;
      this.frame = 0;
      this.oldTouchAction = element.style.touchAction;
      element.style.touchAction = 'none';
      this.handlers = {
        pointerdown: e => this.down(e), pointermove: e => this.move(e),
        pointerup: e => this.up(e), pointercancel: e => this.up(e, true),
        lostpointercapture: e => this.up(e, true),
        click: e => {
          if (this.suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); this.suppressClick = false; }
        }
      };
      for (const [name, handler] of Object.entries(this.handlers)) element.addEventListener(name, handler, true);
    }

    /** Escolhe o ponto mais próximo e vibra somente ao entrar em snap. */
    calculateSnap(targetTime, snapPoints, thresholdPx = 10) {
      const threshold = thresholdPx / this.options.getScale();
      let point = null, distance = Infinity;
      for (const candidate of snapPoints || []) {
        const time = typeof candidate === 'number' ? candidate : candidate?.time;
        if (!Number.isFinite(time)) continue;
        const d = Math.abs(time - targetTime);
        if (d <= threshold && d < distance) { distance = d; point = candidate; }
      }
      const snapped = point !== null;
      if (snapped && !this.snapped) root.MobilePWAIntegration?.triggerHaptic('snap');
      this.snapped = snapped;
      return { time: snapped ? (typeof point === 'number' ? point : point.time) : targetTime, snapped, point };
    }

    /** Inicia scroll, corte, agulha ou espera de toque longo. */
    down(e) {
      if (!this.pointers.size) this.suppressClick = false;
      if (e.pointerType === 'mouse' || this.options.disabled?.() ||
          e.target.closest('.tl-label, .kf, button, input')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      try { this.element.setPointerCapture?.(e.pointerId); } catch {}
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      clearTimeout(this.timer);
      if (this.pointers.size === 2) {
        this.flush();
        if (this.isDraggingClip || this.gesture?.mode === 'trim') this.options.onEnd?.(true);
        this.isDraggingClip = false;
        const [a, b] = [...this.pointers.values()];
        const mid = (a.x + b.x) / 2 - this.element.getBoundingClientRect().left;
        const scale = this.options.getScale();
        this.gesture = { mode: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale,
          time: (this.options.getScroll() + mid - (this.options.getOrigin?.() || 0)) / scale };
        this.suppressClick = true;
      } else if (this.pointers.size === 1) {
        const clip = e.target.closest('.clip'), handle = e.target.closest('.tl-trim');
        const id = clip?.closest('[data-id]')?.dataset.id;
        const info = id && this.options.getClip?.(id);
        this.gesture = { mode: handle ? 'trim' : e.target.closest('#tlTicks, #playhead') ? 'playhead' : 'scroll',
          x: e.clientX, y: e.clientY, scroll: this.options.getScroll(), id, info,
          side: handle?.classList.contains('left') ? 'left' : 'right' };
        if (handle) { this.options.onBegin?.(id); this.suppressClick = true; }
        else if (clip && info) this.timer = setTimeout(() => {
          if (this.pointers.size !== 1 || !this.gesture) return;
          this.isDraggingClip = true; this.gesture.mode = 'drag';
          this.options.onBegin?.(id);
          root.MobilePWAIntegration?.triggerHaptic('longpress');
          this.suppressClick = true;
        }, 250);
        if (this.gesture.mode === 'playhead') this.schedule();
      }
    }

    /** Guarda o último movimento para processá-lo no próximo quadro. */
    move(e) {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gesture?.mode !== 'pinch' && Math.hypot(e.clientX - this.gesture.x, e.clientY - this.gesture.y) > 8) {
        clearTimeout(this.timer); this.suppressClick = true;
      }
      this.schedule();
    }

    /** Agenda no máximo uma atualização por quadro. */
    schedule() {
      if (!this.frame) this.frame = root.requestAnimationFrame(() => { this.frame = 0; this.update(); });
    }

    /** Aplica o último quadro pendente antes de encerrar ou trocar o gesto. */
    flush() {
      if (this.frame) { root.cancelAnimationFrame(this.frame); this.frame = 0; this.update(); }
    }

    /** Processa pinça, scroll, arraste, trim ou agulha via callbacks injetados. */
    update() {
      const g = this.gesture, o = this.options;
      if (!g || !this.pointers.size) return;
      if (g.mode === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const scale = Math.max(o.minScale || 20, Math.min(o.maxScale || 400,
          g.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.distance));
        const mid = (a.x + b.x) / 2 - this.element.getBoundingClientRect().left;
        o.setScale(scale);
        o.setScroll(g.time * scale + (o.getOrigin?.() || 0) - mid);
        return;
      }
      const p = [...this.pointers.values()][0], scale = o.getScale();
      const delta = (p.x - g.x + o.getScroll() - g.scroll) / scale;
      const points = o.snapPoints?.(g.id) || [];
      if (g.mode === 'scroll') o.setScroll(g.scroll + g.x - p.x);
      else if (g.mode === 'drag') o.onClipMove?.(g.id, this.calculateSnap(g.info.start + delta, points).time);
      else if (g.mode === 'trim') o.onTrim?.(g.id, g.side,
        this.calculateSnap((g.side === 'left' ? g.info.start : g.info.end) + delta, points).time);
      else if (g.mode === 'playhead') {
        const time = (p.x - this.element.getBoundingClientRect().left + o.getScroll() - (o.getOrigin?.() || 0)) / scale;
        o.onPlayhead?.(this.calculateSnap(time, points).time);
      }
    }

    /** Encerra o gesto e solicita restauração quando o ponteiro é cancelado. */
    up(e, cancelled = false) {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      clearTimeout(this.timer);
      if (!cancelled) { this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.flush(); }
      else if (this.frame) { root.cancelAnimationFrame(this.frame); this.frame = 0; }
      if (this.isDraggingClip || this.gesture?.mode === 'trim') this.options.onEnd?.(cancelled);
      this.pointers.delete(e.pointerId);
      if (this.element.hasPointerCapture?.(e.pointerId)) this.element.releasePointerCapture(e.pointerId);
      this.isDraggingClip = false; this.snapped = false;
      if (this.pointers.size) {
        const p = [...this.pointers.values()][0];
        this.gesture = { mode: 'scroll', x: p.x, y: p.y, scroll: this.options.getScroll() };
      } else this.gesture = null;
    }

    /** Remove listeners, captura, timers e restaura o comportamento da área. */
    destroy() {
      clearTimeout(this.timer);
      if (this.frame) root.cancelAnimationFrame(this.frame);
      if (this.isDraggingClip || this.gesture?.mode === 'trim') this.options.onEnd?.(true);
      for (const id of this.pointers.keys()) if (this.element.hasPointerCapture?.(id)) this.element.releasePointerCapture(id);
      for (const [name, handler] of Object.entries(this.handlers)) this.element.removeEventListener(name, handler, true);
      this.pointers.clear();
      this.element.style.touchAction = this.oldTouchAction;
    }
  }
  root.TimelineTouchEngine = TimelineTouchEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = TimelineTouchEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
