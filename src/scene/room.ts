// Venues built from simple shapes. The speaker is at the origin facing -Z;
// the audience sits in curved, stepped rows in front. One builder covers every
// venue in config.ts so each extra room is a few numbers, not new code.

import * as THREE from 'three';
import type { VenueSpec } from '../config';

export type Section = 'front-left' | 'front-center' | 'front-right' | 'back-left' | 'back-center' | 'back-right';
export const SECTIONS: readonly Section[] = [
  'front-left',
  'front-center',
  'front-right',
  'back-left',
  'back-center',
  'back-right',
];

/** Human label; single-row venues drop the front/back part. */
export function sectionLabel(s: Section, singleRow: boolean): string {
  const [depth, side] = s.split('-');
  const sideName = side === 'center' ? 'centre' : side;
  return singleRow ? sideName[0].toUpperCase() + sideName.slice(1) : `${depth[0].toUpperCase()}${depth.slice(1)}-${sideName}`;
}

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
  venue: VenueSpec;
  group: THREE.Group;
  seats: Seat[];
  /** World position of the speaker's eyes. Never changes during a run. */
  eye: THREE.Vector3;
  /** Meshes the reticle can rest on so it sits at the right depth. */
  depthMeshes: THREE.Object3D[];
  /** Where the timer panel sits: podium top, or the table in front of you. */
  readingAnchor: THREE.Object3D;
  update(now: Date): void;
  dispose(): void;
}

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

export function sectionFor(row: number, rowCount: number, azimuthDeg: number, maxHalfSpanDeg: number): Section {
  const depth = rowCount > 1 && row >= rowCount / 2 ? 'back' : 'front';
  const third = maxHalfSpanDeg / 3;
  const side = azimuthDeg < -third ? 'left' : azimuthDeg > third ? 'right' : 'center';
  return `${depth}-${side}` as Section;
}

/** Seat layout for a venue, without any three.js meshes. */
export function layoutSeats(venue: VenueSpec): Seat[] {
  const seats: Seat[] = [];
  const maxHalf = Math.max(...venue.rows.map((r) => r.halfSpanDeg));
  venue.rows.forEach((spec, row) => {
    const floorY = row * venue.rowRise;
    const half = THREE.MathUtils.degToRad(spec.halfSpanDeg);
    for (let col = 0; col < spec.seats; col++) {
      const a = spec.seats === 1 ? 0 : -half + (2 * half * col) / (spec.seats - 1);
      const position = new THREE.Vector3(spec.radius * Math.sin(a), floorY, -spec.radius * Math.cos(a));
      const azimuthDeg = THREE.MathUtils.radToDeg(a);
      seats.push({
        index: seats.length,
        row,
        col,
        position,
        yaw: Math.atan2(-position.x, -position.z),
        azimuthDeg,
        section: sectionFor(row, venue.rows.length, azimuthDeg, maxHalf),
      });
    }
  });
  return seats;
}

/** Indices of the seats beside each seat in its row. */
export function seatNeighbors(seats: readonly Seat[]): number[][] {
  return seats.map((s) => seats.filter((o) => o.row === s.row && Math.abs(o.col - s.col) === 1).map((o) => o.index));
}

/** Flat annular sector, extruded upward to `height`. Azimuth 0 points at -Z. */
function rowPlatform(inner: number, outer: number, halfSpanRad: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const steps = 24;
  // Shape space (x, y) maps to world (x, -y) after rotateX(-90°), so y = r cos(phi) puts it at -Z.
  for (let s = 0; s <= steps; s++) {
    const a = -halfSpanRad + (2 * halfSpanRad * s) / steps;
    if (s === 0) shape.moveTo(outer * Math.sin(a), outer * Math.cos(a));
    else shape.lineTo(outer * Math.sin(a), outer * Math.cos(a));
  }
  for (let s = steps; s >= 0; s--) {
    const a = -halfSpanRad + (2 * halfSpanRad * s) / steps;
    shape.lineTo(inner * Math.sin(a), inner * Math.cos(a));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildRoom(venue: VenueSpec): Room {
  const group = new THREE.Group();
  const depthMeshes: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T, depth = true): T => {
    group.add(o);
    if (depth) depthMeshes.push(o);
    return o;
  };
  const P = venue.palette;
  const H = venue.hall;
  const length = H.front - H.back;
  const midZ = (H.front + H.back) / 2;

  // Shell: floor, ceiling, walls.
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(H.width, length), mat(P.floor)));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = midZ;

  // Faces down, so the lights barely reach it: a faint glow keeps it from reading as a black void.
  const ceiling = add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(H.width, length),
      new THREE.MeshLambertMaterial({ color: 0x4a4440, emissive: 0x2e2a27 }),
    ),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H.height, midZ);

  const walls = add(
    new THREE.Mesh(
      // Slightly taller than the room so its top and bottom hide behind the ceiling and floor.
      new THREE.BoxGeometry(H.width, H.height + 0.2, length),
      new THREE.MeshLambertMaterial({ color: P.wall, side: THREE.BackSide }),
    ),
  );
  walls.position.set(0, H.height / 2, midZ);

  // Stage the speaker stands on.
  const firstRow = venue.rows[0].radius;
  if (venue.stageHeight > 0) {
    const edge = -firstRow * 0.5;
    const depth = H.front - edge;
    const stage = add(
      new THREE.Mesh(new THREE.BoxGeometry(Math.min(H.width - 2, 12), venue.stageHeight, depth), mat(P.stage)),
    );
    stage.position.set(0, venue.stageHeight / 2, H.front - depth / 2);
  }

  // Projector screen or whiteboard behind the speaker.
  const board = add(
    new THREE.Mesh(
      venue.screen ? new THREE.PlaneGeometry(4.2, 2.4) : new THREE.PlaneGeometry(3.6, 1.2),
      new THREE.MeshLambertMaterial({ color: venue.screen ? 0xd9dde3 : 0xf4f4f0 }),
    ),
  );
  board.position.set(0, venue.screen ? venue.stageHeight + 3.1 : 1.6, H.front - 0.02);
  board.rotation.y = Math.PI;

  // Reading anchor: podium top, or the near edge of the interview table.
  const readingAnchor = new THREE.Object3D();
  if (venue.podium) {
    const podiumH = 1.05;
    const podium = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, podiumH, 0.45), mat(0x6b4f3a)));
    podium.position.set(0, venue.stageHeight + podiumH / 2, -0.58);
    const top = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.5), mat(0x6b4f3a)));
    top.position.set(0, venue.stageHeight + podiumH + 0.05, -0.55);
    top.rotation.x = 0.45; // tilts toward the speaker
    readingAnchor.position.set(0, 0.025, 0);
    readingAnchor.rotation.x = -Math.PI / 2;
    top.add(readingAnchor);
  }
  if (venue.table) {
    const tableH = 0.74;
    const table = add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.2), mat(0x8a6a4c)));
    table.position.set(0, tableH, -1.05);
    const legGeo = new THREE.BoxGeometry(0.06, tableH, 0.06);
    for (const [x, z] of [[-1.3, -0.5], [1.3, -0.5], [-1.3, -1.6], [1.3, -1.6]]) {
      const leg = add(new THREE.Mesh(legGeo, mat(0x3a3a3a)), false);
      leg.position.set(x, tableH / 2, z);
    }
    readingAnchor.position.set(0, tableH + 0.03, -0.62);
    readingAnchor.rotation.x = -Math.PI / 2;
    group.add(readingAnchor);
    // A framed picture on the back wall so the office isn't bare.
    const art = add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), mat(0x6d8fa8)));
    art.position.set(-1.8, 1.7, H.back + 0.02);
  }

  // Stepped, curved rows and the seats on them.
  const seats = layoutSeats(venue);
  venue.rows.forEach((spec, row) => {
    if (row === 0 || venue.rowRise === 0) return;
    const half = THREE.MathUtils.degToRad(spec.halfSpanDeg) + 0.12;
    const gap = (spec.radius - venue.rows[row - 1].radius) / 2;
    add(new THREE.Mesh(rowPlatform(spec.radius - gap, spec.radius + gap, half, row * venue.rowRise), mat(0x2f2925)));
  });

  // Chairs as two instanced meshes: one draw call each for the whole room.
  const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.48).translate(0, 0.44, 0);
  const backGeo = new THREE.BoxGeometry(0.5, 0.6, 0.06).translate(0, 0.72, -0.24);
  const one = new THREE.Vector3(1, 1, 1);
  for (const geo of [seatGeo, backGeo]) {
    const inst = new THREE.InstancedMesh(geo, mat(P.seat), seats.length);
    seats.forEach((s, i) =>
      inst.setMatrixAt(
        i,
        new THREE.Matrix4().compose(s.position, new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw), one),
      ),
    );
    add(inst, false);
  }

  // Wall clock on the back wall, above the last row, showing real time.
  const lastRowHead = (venue.rows.length - 1) * venue.rowRise + 1.4;
  const clock = new THREE.Group();
  clock.position.set(0, Math.min(H.height - 0.7, Math.max(lastRowHead + 1.2, 2.3)), H.back + 0.03);
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshBasicMaterial({ color: 0xf2efe6 })));
  const handMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const hourHand = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.2).translate(0, 0.1, 0.005), handMat);
  const minuteHand = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.32).translate(0, 0.16, 0.006), handMat);
  clock.add(hourHand, minuteHand);
  add(clock, false);

  return {
    venue,
    group,
    seats,
    eye: new THREE.Vector3(0, venue.stageHeight + venue.eyeHeight, 0),
    depthMeshes,
    readingAnchor,
    update(now: Date) {
      const m = now.getMinutes() + now.getSeconds() / 60;
      const h = (now.getHours() % 12) + m / 60;
      minuteHand.rotation.z = (-m / 60) * Math.PI * 2;
      hourHand.rotation.z = (-h / 12) * Math.PI * 2;
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
    },
  };
}
