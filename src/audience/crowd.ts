// Seats members, steps the attention model, and draws everyone with a few
// instanced meshes (one draw call per body part for the whole room).

import * as THREE from 'three';
import { CONFIG, type Mood } from '../config';
import { seatNeighbors, type Seat } from '../scene/room';
import { gazeCredit, mulberry32, stepRoom, type MemberState } from './attention';
import { BODY, Member } from './member';

const STATE_COLOR: Record<MemberState, THREE.Color> = {
  engaged: new THREE.Color(0x3fb68b),
  neutral: new THREE.Color(0x8a8f9c),
  drifting: new THREE.Color(0xd99a3d),
  checkedOut: new THREE.Color(0xa8484a),
};
const SKIN = [0xf1c7a5, 0xd9a07a, 0xb07a52, 0x8a5a3c, 0x5e3b27].map((c) => new THREE.Color(c));
const WHITE = new THREE.Color(0xffffff);

export class Crowd {
  readonly group = new THREE.Group();
  readonly members: Member[];
  /** World positions of each head, refreshed every frame, used for the gaze test. */
  readonly headPositions: THREE.Vector3[];
  readonly credits: number[];
  mood: Mood = 'neutral';
  showBars = false;
  showCredit = false;

  private readonly neighbors: number[][];
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly faces: THREE.InstancedMesh;
  private readonly phones: THREE.InstancedMesh;
  private readonly bars: THREE.InstancedMesh;
  private readonly skin: THREE.Color[];

  constructor(seats: readonly Seat[], seed = 1) {
    const rng = mulberry32(seed);
    const A = CONFIG.attention;
    this.members = seats.map(
      (s) => new Member(s, A.personalityMin + rng() * (A.personalityMax - A.personalityMin), mulberry32(seed * 97 + s.index)),
    );
    this.neighbors = seatNeighbors(seats);
    this.headPositions = seats.map(() => new THREE.Vector3());
    this.credits = seats.map(() => 0);
    this.skin = seats.map(() => SKIN[Math.floor(rng() * SKIN.length)]);

    const n = seats.length;
    const lambert = () => new THREE.MeshLambertMaterial();
    const torsoLen = BODY.torso - 0.4;
    this.bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, torsoLen, 4, 10), lambert(), n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(BODY.headRadius, 14, 10), lambert(), n);
    // A dark visor band so head direction reads from across the room.
    this.faces = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.17, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x1b1d24 }),
      n,
    );
    this.phones = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.15, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x8fd4ff }),
      n,
    );
    this.bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }),
      n,
    );
    this.bars.renderOrder = 900;
    // Create instance colours up front so materials compile with them.
    for (let i = 0; i < n; i++) {
      this.bodies.setColorAt(i, WHITE);
      this.heads.setColorAt(i, WHITE);
      this.bars.setColorAt(i, WHITE);
    }
    for (const m of [this.bodies, this.heads, this.faces, this.phones, this.bars]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.update(0, 0, 1, false);
  }

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  reset(): void {
    for (const m of this.members) m.reset(CONFIG.attention.startInterest);
  }

  /** Meshes the reticle can rest on. */
  get depthMeshes(): THREE.Object3D[] {
    return [this.bodies, this.heads];
  }

  averageInterest(): number {
    return this.members.reduce((a, m) => a + m.interest, 0) / this.members.length;
  }

  countIn(state: MemberState): number {
    return this.members.filter((m) => m.state === state).length;
  }

  /** Gaze credit for every member from the head's view direction. */
  computeCredits(eye: THREE.Vector3, forward: THREE.Vector3): readonly number[] {
    const cone = CONFIG.gaze.creditConeDeg;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.members.length; i++) {
      v.subVectors(this.headPositions[i], eye).normalize();
      const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v.dot(forward), -1, 1)));
      this.credits[i] = gazeCredit(angle, cone);
    }
    return this.credits;
  }

  /**
   * Step attention (only while `live`, i.e. during a talk) and animate.
   * roomFactor is the voice x notes decay multiplier.
   */
  update(dt: number, time: number, roomFactor: number, live: boolean): void {
    if (live) {
      const next = stepRoom(
        this.members.map((m) => m.interest),
        this.credits,
        this.neighbors,
        this.members.map((m) => m.personality),
        dt,
        CONFIG.attention.moods[this.mood],
        roomFactor,
      );
      next.forEach((v, i) => (this.members[i].interest = v));
    }
    this.members.forEach((m, i) => m.update(dt, time, live ? this.credits[i] : 0, live));
    this.writeInstances(time);
  }

  private writeInstances(time: number): void {
    const base = new THREE.Matrix4();
    const torso = new THREE.Matrix4();
    const head = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const color = new THREE.Color();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

    this.members.forEach((m, i) => {
      const s = m.seat;
      const p = m.pose;
      const breathe = 0.008 * Math.sin(time * 1.6 + i * 1.7);
      pos.copy(s.position).setY(s.position.y + BODY.hipHeight + p.lift + breathe);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      base.compose(pos, q, one);

      // Torso: lean about the hips.
      torso.copy(base).multiply(tmp.makeRotationX(p.lean));
      this.bodies.setMatrixAt(i, tmp.copy(torso).multiply(new THREE.Matrix4().makeTranslation(0, BODY.torso / 2, 0)));

      // Head: on top of the leaned torso, then yaw and pitch.
      head
        .copy(torso)
        .multiply(tmp.makeTranslation(0, BODY.torso + BODY.neck, 0))
        .multiply(tmp.makeRotationFromEuler(e.set(p.headPitch, p.headYaw, 0, 'YXZ')));
      this.heads.setMatrixAt(i, head);
      this.headPositions[i].setFromMatrixPosition(head);
      this.faces.setMatrixAt(i, tmp.copy(head).multiply(new THREE.Matrix4().makeTranslation(0, 0.02, BODY.headRadius * 0.85)));

      // Phone in hand only once checked out.
      if (m.state === 'checkedOut' && !m.isCaught) {
        this.phones.setMatrixAt(
          i,
          tmp.copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0.32, 0.3)).multiply(new THREE.Matrix4().makeRotationX(-1.0)),
        );
      } else this.phones.setMatrixAt(i, hidden);

      // Colours: body by state, head by skin tone (tinted white when getting gaze credit in debug).
      this.bodies.setColorAt(i, STATE_COLOR[m.state]);
      color.copy(this.skin[i]);
      if (this.showCredit && this.credits[i] > 0) color.lerp(WHITE, 0.4 + 0.6 * this.credits[i]);
      this.heads.setColorAt(i, color);

      // Interest bar above the head (debug).
      if (this.showBars) {
        const w = 0.5 * m.interest + 0.02;
        tmp.compose(
          new THREE.Vector3().copy(this.headPositions[i]).setY(this.headPositions[i].y + 0.32),
          q,
          new THREE.Vector3(w, 0.06, 0.02),
        );
        this.bars.setMatrixAt(i, tmp);
        this.bars.setColorAt(i, color.setHSL(0.33 * m.interest, 0.8, 0.5));
      } else this.bars.setMatrixAt(i, hidden);
    });

    for (const mesh of [this.bodies, this.heads, this.faces, this.phones, this.bars]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
