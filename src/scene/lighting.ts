// Warm key light on the stage, soft ambient fill, dim house. No shadows yet:
// the budget allows one shadow-casting light at most and we spend it later if at all.

import * as THREE from 'three';
import { CONFIG } from '../config';

export interface Lighting {
  group: THREE.Group;
  /** 1 = house lights up, CONFIG.lighting.houseDim = dimmed for the talk. */
  setHouseTarget(level: number): void;
  update(dt: number): void;
}

export function buildLighting(): Lighting {
  const group = new THREE.Group();

  const ambient = new THREE.HemisphereLight(0xfff1dc, 0x2a2226, 1.1);
  group.add(ambient);

  // Overhead fill on the audience so faces read from the stage.
  const houseFill = new THREE.DirectionalLight(0xffe2c0, 1.1);
  houseFill.position.set(0, 6, 2);
  houseFill.target.position.set(0, 0, -6);
  group.add(houseFill, houseFill.target);

  // Warm key light on the stage and podium.
  const key = new THREE.SpotLight(0xffc98a, 30, 14, THREE.MathUtils.degToRad(35), 0.6, 1.5);
  key.position.set(0, 6, -3);
  key.target.position.set(0, 0.5, 0);
  group.add(key, key.target);

  const base = { ambient: ambient.intensity, fill: houseFill.intensity };
  let level: number = CONFIG.lighting.houseUp;
  let target = level;

  return {
    group,
    setHouseTarget(t) {
      target = t;
    },
    update(dt) {
      const k = 1 - Math.exp(-dt / (CONFIG.lighting.dimSeconds / 3));
      level += (target - level) * k;
      ambient.intensity = base.ambient * level;
      houseFill.intensity = base.fill * level;
    },
  };
}
