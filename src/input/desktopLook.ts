// Mouse-look (and touch-drag look when a phone has no motion sensor) for debug mode.

import * as THREE from 'three';
import { CONFIG } from '../config';

const MAX_PITCH = THREE.MathUtils.degToRad(85);

export class DesktopLook {
  yaw = 0;
  pitch = 0;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  drag(dxPx: number, dyPx: number): void {
    const k = THREE.MathUtils.degToRad(CONFIG.input.mouseLookDegPerPx);
    this.yaw += dxPx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dyPx * k, -MAX_PITCH, MAX_PITCH);
  }

  recenter(): void {
    this.yaw = 0;
    this.pitch = 0;
  }

  update(out: THREE.Quaternion): void {
    this.euler.set(this.pitch, this.yaw, 0, 'YXZ');
    out.setFromEuler(this.euler);
  }
}
