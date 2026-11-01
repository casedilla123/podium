// Performance overlay (P), key help, and an on-screen error log for phones
// without a Mac attached to Safari's Web Inspector.

import type * as THREE from 'three';
import { CONFIG } from '../config';

export class Hud {
  private readonly perf = document.getElementById('perf')!;
  private readonly log = document.getElementById('log')!;
  private frames = 0;
  private acc = 0;
  private worstMs = 0;
  visible = false;

  constructor() {
    const show = (msg: string) => {
      this.log.hidden = false;
      const line = document.createElement('div');
      line.textContent = msg;
      this.log.append(line);
      while (this.log.childElementCount > 6) this.log.firstElementChild?.remove();
    };
    window.addEventListener('error', (e) => show(`Error: ${e.message}`));
    window.addEventListener('unhandledrejection', (e) => show(`Promise: ${String(e.reason)}`));
  }

  toggle(): void {
    this.visible = !this.visible;
    this.perf.hidden = !this.visible;
  }

  /** Call once per frame after rendering; renderer.info must not auto-reset. */
  update(dt: number, renderer: THREE.WebGLRenderer, extra: string): void {
    this.frames++;
    this.acc += dt;
    this.worstMs = Math.max(this.worstMs, dt * 1000);
    if (this.acc < 0.5) return;
    const fps = this.frames / this.acc;
    if (this.visible) {
      const info = renderer.info.render;
      const B = CONFIG.budget;
      const eyes = document.body.classList.contains('stereo') ? 2 : 1;
      const calls = Math.round(info.calls / eyes);
      const flag = (bad: boolean) => (bad ? ' ⚠' : '');
      this.perf.textContent = [
        `${fps.toFixed(0)} fps${flag(fps < B.minFps)}  worst ${this.worstMs.toFixed(0)} ms`,
        `${calls} draws/eye${flag(calls > B.drawCallsPerEye)}  ${(info.triangles / 1000).toFixed(0)}k tris${flag(info.triangles > B.trianglesInView)}`,
        `pixel ratio ${renderer.getPixelRatio().toFixed(2)}`,
        extra,
      ].join('\n');
    }
    this.frames = 0;
    this.acc = 0;
    this.worstMs = 0;
  }
}
