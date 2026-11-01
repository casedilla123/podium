// Screen tap / Cardboard button (a touch on the screen), tap-and-hold to
// recenter, and drag deltas for debug look. One pointer at a time.

import { CONFIG } from '../config';

export interface TapHandlers {
  onTap(): void;
  onHold(): void;
  onDrag(dxPx: number, dyPx: number): void;
}

export function attachTap(el: HTMLElement, h: TapHandlers): () => void {
  const I = CONFIG.input;
  let id: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let lastX = 0;
  let lastY = 0;
  let t0 = 0;
  let dragging = false;
  let held = false;
  let holdTimer = 0;

  const down = (e: PointerEvent) => {
    if (id !== null) return;
    id = e.pointerId;
    x0 = lastX = e.clientX;
    y0 = lastY = e.clientY;
    t0 = performance.now();
    dragging = false;
    held = false;
    el.setPointerCapture(e.pointerId);
    holdTimer = window.setTimeout(() => {
      if (!dragging) {
        held = true;
        h.onHold();
      }
    }, I.recenterHoldMs);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    if (!dragging && Math.hypot(e.clientX - x0, e.clientY - y0) > I.tapMaxMovePx) {
      dragging = true;
      clearTimeout(holdTimer);
    }
    if (dragging) h.onDrag(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    clearTimeout(holdTimer);
    if (!dragging && !held && performance.now() - t0 < I.tapMaxMs) h.onTap();
  };

  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    clearTimeout(holdTimer);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}
