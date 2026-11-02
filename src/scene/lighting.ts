// Warm key light on the speaker, soft ambient fill, dimmable house. No shadows:
// the budget allows one shadow-casting light at most and we haven't needed it.

import * as THREE from 'three';
import { CONFIG, type VenueSpec } from '../config';

export interface Lighting {
  group: THREE.Group;
  /** 1 = house lights up, CONFIG.lighting.houseDim = dimmed for the talk. */
  setHouseTarget(level: number): void;
  update(dt: number): void;
}

export function buildLighting(venue: VenueSpec): Lighting {
  const group = new THREE.Group();
  const H = venue.hall;

  const ambient = new THREE.HemisphereLight(0xfff1dc, 0x2a2226, 1.1);
  group.add(ambient);

  // Overhead fill on the audience so faces read from the front.
  const houseFill = new THREE.DirectionalLight(0xffe2c0, 1.1);
  houseFill.position.set(0, H.height, 2);
  houseFill.target.position.set(0, 0, H.back * 0.6);
  group.add(houseFill, houseFill.target);

  // Warm key light on the speaker's area.
  const key = new THREE.SpotLight(0xffc98a, 30, H.height + 10, THREE.MathUtils.degToRad(35), 0.6, 1.5);
  key.position.set(0, H.height - 0.3, -3);
  key.target.position.set(0, venue.stageHeight, 0);
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
