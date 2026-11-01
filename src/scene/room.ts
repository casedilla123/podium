// Lecture hall built from simple shapes. The speaker stands at the origin on a
// low stage facing -Z; the audience sits in 4 curved, stepped rows in front.

import * as THREE from 'three';
import { CONFIG } from '../config';

export type Section = 'front-left' | 'front-center' | 'front-right' | 'back-left' | 'back-center' | 'back-right';
export const SECTIONS: readonly Section[] = [
  'front-left',
  'front-center',
  'front-right',
  'back-left',
  'back-center',
  'back-right',
];

export interface Seat {
  index: number;
  row: number;
  /** Position in the row, 0 = speaker's left. */
  col: number;
  /** Floor point under the seat. */
  position: THREE.Vector3;
  /** Yaw that makes +Z local face the speaker. */
  yaw: number;
  /** Azimuth from straight ahead, degrees; negative = speaker's left. */
  azimuthDeg: number;
  section: Section;
}

export interface Room {
  group: THREE.Group;
  seats: Seat[];
  /** Meshes the reticle can rest on so it sits at the right depth. */
  depthMeshes: THREE.Object3D[];
  /** Anchor on the slanted podium top for the timer + notes panel. */
  podiumTop: THREE.Object3D;
  update(now: Date): void;
}

const R = CONFIG.room;
const EYE_Y = R.stageHeight + R.eyeHeight;
export { EYE_Y };

const PALETTE = {
  floor: 0x3a2f2a,
  wall: 0x4a4e5a,
  ceiling: 0x4a4440,
  stage: 0x5b4636,
  platform: 0x332b27,
  seat: 0x7a2e2e,
  podium: 0x6b4f3a,
  screen: 0xd9dde3,
  clockFace: 0xf2efe6,
  clockHand: 0x1a1a1a,
};

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

function sectionFor(row: number, azimuthDeg: number): Section {
  const depth = row < 2 ? 'front' : 'back';
  const side = azimuthDeg < -20 ? 'left' : azimuthDeg > 20 ? 'right' : 'center';
  return `${depth}-${side}` as Section;
}

/** Flat annular sector in the XZ plane, extruded upward to `height`. Azimuth 0 points at -Z. */
function rowPlatform(inner: number, outer: number, halfSpanRad: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const steps = 24;
  // Shape space (x, y) maps to world (x, -y) after rotateX(-90°), so y = r cos(phi) puts it at -Z.
  for (let s = 0; s <= steps; s++) {
    const a = -halfSpanRad + (2 * halfSpanRad * s) / steps;
    const p = [outer * Math.sin(a), outer * Math.cos(a)] as const;
    if (s === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  }
  for (let s = steps; s >= 0; s--) {
    const a = -halfSpanRad + (2 * halfSpanRad * s) / steps;
    shape.lineTo(inner * Math.sin(a), inner * Math.cos(a));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildRoom(): Room {
  const group = new THREE.Group();
  const depthMeshes: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T, depth = true): T => {
    group.add(o);
    if (depth) depthMeshes.push(o);
    return o;
  };

  const width = R.hallWidth;
  const length = R.hallFront - R.hallBack;
  const midZ = (R.hallFront + R.hallBack) / 2;

  // Shell: floor, ceiling, walls.
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(width, length), mat(PALETTE.floor)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = midZ;

  // Faces down, so the lights barely reach it: a faint glow keeps it from reading as a black void.
  const ceiling = add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshLambertMaterial({ color: PALETTE.ceiling, emissive: 0x2e2a27 }),
    ),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, R.hallHeight, midZ);

  const walls = add(
    new THREE.Mesh(
      // Slightly taller than the hall so its top and bottom hide behind the ceiling and floor.
      new THREE.BoxGeometry(width, R.hallHeight + 0.2, length),
      new THREE.MeshLambertMaterial({ color: PALETTE.wall, side: THREE.BackSide }),
    ),
  );
  walls.position.set(0, R.hallHeight / 2, midZ);

  // Stage the speaker stands on.
  const stageDepth = R.hallFront + 1.8;
  const stage = add(new THREE.Mesh(new THREE.BoxGeometry(10, R.stageHeight, stageDepth), mat(PALETTE.stage)));
  stage.position.set(0, R.stageHeight / 2, R.hallFront - stageDepth / 2);

  // Projector screen behind the speaker; room for a slides feature later.
  const screen = add(new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), mat(PALETTE.screen)));
  screen.position.set(0, 3.6, R.hallFront - 0.02);
  screen.rotation.y = Math.PI;

  // Podium with a slanted top that faces the speaker.
  const podiumH = 1.05;
  const podium = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, podiumH, 0.45), mat(PALETTE.podium)));
  podium.position.set(0, R.stageHeight + podiumH / 2, -0.58);
  const top = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.5), mat(PALETTE.podium)));
  top.position.set(0, R.stageHeight + podiumH + 0.05, -0.55);
  top.rotation.x = 0.45;
  const podiumTop = new THREE.Object3D();
  podiumTop.position.set(0, 0.025, 0);
  podiumTop.rotation.x = -Math.PI / 2;
  top.add(podiumTop);

  // Stepped, curved rows and the seats on them.
  const seats: Seat[] = [];
  const seatOffsets: THREE.Matrix4[] = [];
  const toRad = THREE.MathUtils.degToRad;
  R.rowRadii.forEach((radius, row) => {
    const floorY = row * R.rowRise;
    const half = toRad(R.rowHalfSpanDeg[row]);
    if (row > 0) {
      add(new THREE.Mesh(rowPlatform(radius - 0.65, radius + 0.65, half + 0.12, floorY), mat(PALETTE.platform)));
    }
    const n = R.seatsPerRow[row];
    for (let col = 0; col < n; col++) {
      const a = -half + (2 * half * col) / (n - 1);
      const position = new THREE.Vector3(radius * Math.sin(a), floorY, -radius * Math.cos(a));
      const yaw = Math.atan2(-position.x, -position.z);
      const azimuthDeg = THREE.MathUtils.radToDeg(a);
      seats.push({ index: seats.length, row, col, position, yaw, azimuthDeg, section: sectionFor(row, azimuthDeg) });
      seatOffsets.push(
        new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), new THREE.Vector3(1, 1, 1)),
      );
    }
  });

  // Chairs as two instanced meshes: one draw call each for all 30.
  const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.48).translate(0, 0.44, 0);
  const backGeo = new THREE.BoxGeometry(0.5, 0.6, 0.06).translate(0, 0.72, -0.24);
  for (const geo of [seatGeo, backGeo]) {
    const inst = new THREE.InstancedMesh(geo, mat(PALETTE.seat), seats.length);
    seatOffsets.forEach((m, i) => inst.setMatrixAt(i, m));
    add(inst, false);
  }

  // Wall clock on the back wall, showing real time.
  const clock = new THREE.Group();
  clock.position.set(0, 4.4, R.hallBack + 0.03);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: PALETTE.clockFace }));
  clock.add(face);
  const handMat = new THREE.MeshBasicMaterial({ color: PALETTE.clockHand });
  const hourHand = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.22).translate(0, 0.11, 0.005), handMat);
  const minuteHand = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.34).translate(0, 0.17, 0.006), handMat);
  clock.add(hourHand, minuteHand);
  add(clock, false);

  return {
    group,
    seats,
    depthMeshes,
    podiumTop,
    update(now: Date) {
      const m = now.getMinutes() + now.getSeconds() / 60;
      const h = (now.getHours() % 12) + m / 60;
      minuteHand.rotation.z = (-m / 60) * Math.PI * 2;
      hourHand.rotation.z = (-h / 12) * Math.PI * 2;
    },
  };
}

/** Indices of the seats beside each seat in its row. */
export function seatNeighbors(seats: readonly Seat[]): number[][] {
  return seats.map((s) =>
    seats.filter((o) => o.row === s.row && Math.abs(o.col - s.col) === 1).map((o) => o.index),
  );
}
