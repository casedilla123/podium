// One audience member: interest, state, and a procedural seated posture.
// Posture is a handful of angles eased toward per-state targets; the crowd
// turns them into instance matrices.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Seat } from '../scene/room';
import { classify, type MemberState } from './attention';

export const BODY = {
  hipHeight: 0.48,
  torso: 0.75,
  neck: 0.13,
  headRadius: 0.13,
  shoulderX: 0.22,
  shoulderDrop: 0.15,
  arm: 0.5,
};

export type AmbientSound = 'cough' | 'whisper' | 'creak';

export interface Pose {
  lean: number; // + forward, - slumped back
  headPitch: number; // + looks down
  headYaw: number; // + turns to the member's left
  lift: number; // small vertical jolt for the "caught" moment
  armLift: number; // arm raised forward from hanging straight down
  armIn: number; // arms turned in toward the middle
}

const deg = THREE.MathUtils.degToRad;

export class Member {
  interest: number = CONFIG.attention.startInterest;
  state: MemberState = 'neutral';
  readonly pose: Pose = { lean: 0, headPitch: 0, headYaw: 0, lift: 0, armLift: 0.9, armIn: 0.25 };
  /** Called when this member makes an audible ambient sound. */
  onSound: ((kind: AmbientSound) => void) | null = null;
  private readonly target: Pose = { ...this.pose };
  /** Pitch that points the head at the speaker's eyes. */
  private readonly lookAtSpeakerPitch: number;
  private caughtUntil = -1;
  private glanceYaw = 0;
  private glancePitch = 0;
  private glanceUntil = 0;
  private nextAmbient: number;
  private nodUntil = 0;

  constructor(
    readonly seat: Seat,
    readonly personality: number,
    speakerEye: THREE.Vector3,
    private readonly rng: () => number,
  ) {
    const headY = seat.position.y + BODY.hipHeight + BODY.torso + BODY.neck;
    const dist = Math.hypot(seat.position.x - speakerEye.x, seat.position.z - speakerEye.z);
    this.lookAtSpeakerPitch = -Math.atan2(speakerEye.y - headY, dist);
    this.nextAmbient = rng() * CONFIG.audience.ambientMaxGap;
    this.reset(this.interest);
  }

  reset(interest: number): void {
    this.interest = interest;
    this.state = classify(interest, 'neutral', CONFIG.attention);
    this.caughtUntil = -1;
  }

  get isCaught(): boolean {
    return this.caughtUntil > 0;
  }

  /** Called after the attention step with this member's gaze credit. */
  update(dt: number, time: number, credit: number, live: boolean): void {
    const A = CONFIG.audience;
    this.state = classify(this.interest, this.state, CONFIG.attention);

    // The "caught" moment: looked at while low, snap upright and hold it while interest recovers.
    if (live && credit > 0.3 && this.interest < A.caughtBelow && time > this.caughtUntil) {
      this.caughtUntil = time + A.caughtHold;
      this.pose.lift = 0.06;
      if (this.rng() < 0.5) this.onSound?.('creak');
    }
    const caught = time < this.caughtUntil;
    if (!caught) this.caughtUntil = -1;

    // Ambient life: glances, fidgets, nods, whispers, coughs on random timers.
    if (time > this.nextAmbient) {
      this.nextAmbient = time + A.ambientMinGap + this.rng() * (A.ambientMaxGap - A.ambientMinGap);
      const side = this.rng() < 0.5 ? -1 : 1;
      switch (this.state) {
        case 'engaged':
          if (this.rng() < 0.6) this.nodUntil = time + 1.2;
          break;
        case 'neutral':
          this.glance(time, side * deg(15 + this.rng() * 25), deg(-5 + this.rng() * 10), 1.5);
          if (live && this.rng() < A.coughChance) this.onSound?.('cough');
          break;
        case 'drifting':
          // Check the clock behind them, or whisper to a neighbour.
          if (this.rng() < 0.5) {
            this.glance(time, side * deg(55 + this.rng() * 20), deg(-20), 2.5);
            if (live && this.rng() < 0.3) this.onSound?.('creak');
          } else {
            this.glance(time, side * deg(70), deg(5), 3);
            if (live) this.onSound?.('whisper');
          }
          if (live && this.rng() < A.coughChance) this.onSound?.('cough');
          break;
        case 'checkedOut':
          if (this.rng() < 0.3) this.glance(time, side * deg(20), deg(-10), 1.2); // yawn
          break;
      }
    }
    const glancing = time < this.glanceUntil;

    const t = this.target;
    if (caught || this.state === 'engaged') {
      Object.assign(t, { lean: deg(8), headPitch: this.lookAtSpeakerPitch, headYaw: 0, armLift: deg(55), armIn: deg(14) });
    } else if (this.state === 'neutral') {
      Object.assign(t, { lean: 0, headPitch: this.lookAtSpeakerPitch + deg(4), headYaw: 0, armLift: deg(48), armIn: deg(10) });
    } else if (this.state === 'drifting') {
      // Slumped back, arms crossed, head turned a little away.
      Object.assign(t, { lean: deg(-14), headPitch: deg(10), headYaw: deg(15) * (this.seat.col % 2 ? 1 : -1), armLift: deg(72), armIn: deg(44) });
    } else {
      // Hunched over a phone held in both hands.
      Object.assign(t, { lean: deg(16), headPitch: deg(45), headYaw: 0, armLift: deg(78), armIn: deg(26) });
    }
    if (glancing && !caught) {
      t.headYaw = this.glanceYaw;
      t.headPitch = this.glancePitch;
    }
    if (!caught && this.state === 'engaged' && time < this.nodUntil) {
      t.headPitch += deg(9) * Math.max(0, Math.sin((this.nodUntil - time) * Math.PI * 2.5));
    }
    t.headYaw = THREE.MathUtils.clamp(t.headYaw, -deg(A.headFollowMaxYawDeg), deg(A.headFollowMaxYawDeg));

    // Ease toward the target; the caught snap is much faster.
    const tau = (caught ? A.caughtSnapTime : A.postureTime) / 3;
    const k = 1 - Math.exp(-dt / (tau * this.personality));
    const p = this.pose;
    p.lean += (t.lean - p.lean) * k;
    p.headPitch += (t.headPitch - p.headPitch) * k;
    p.headYaw += (t.headYaw - p.headYaw) * k;
    p.armLift += (t.armLift - p.armLift) * k;
    p.armIn += (t.armIn - p.armIn) * k;
    p.lift += (0 - p.lift) * (1 - Math.exp(-dt / 0.15));
  }

  private glance(time: number, yaw: number, pitch: number, seconds: number): void {
    this.glanceYaw = yaw;
    this.glancePitch = pitch;
    this.glanceUntil = time + seconds;
  }
}
