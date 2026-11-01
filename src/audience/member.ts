// One audience member: interest, state, and a procedural seated posture.
// Posture is a handful of angles eased toward per-state targets; the crowd
// turns them into instance matrices.

import * as THREE from 'three';
import { CONFIG } from '../config';
import { EYE_Y, type Seat } from '../scene/room';
import { classify, type MemberState } from './attention';

export const BODY = {
  hipHeight: 0.48,
  torso: 0.75,
  neck: 0.13,
  headRadius: 0.13,
};

interface Pose {
  lean: number; // + forward, - slumped back
  headPitch: number; // + looks down
  headYaw: number; // + turns to the member's left
  lift: number; // small vertical jolt for the "caught" moment
}

const deg = THREE.MathUtils.degToRad;

export class Member {
  interest: number = CONFIG.attention.startInterest;
  state: MemberState = 'neutral';
  readonly pose: Pose = { lean: 0, headPitch: 0, headYaw: 0, lift: 0 };
  private readonly target: Pose = { lean: 0, headPitch: 0, headYaw: 0, lift: 0 };
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
    private readonly rng: () => number,
  ) {
    const headY = seat.position.y + BODY.hipHeight + BODY.torso + BODY.neck;
    const dist = Math.hypot(seat.position.x, seat.position.z);
    this.lookAtSpeakerPitch = -Math.atan2(EYE_Y - headY, dist);
    this.nextAmbient = rng() * CONFIG.audience.ambientMaxGap;
    this.state = classify(this.interest, 'neutral', CONFIG.attention);
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
    const prev = this.state;
    this.state = classify(this.interest, prev, CONFIG.attention);

    // The "caught" moment: looked at while low, snap upright and hold it while interest recovers.
    if (live && credit > 0.3 && this.interest < A.caughtBelow && time > this.caughtUntil) {
      this.caughtUntil = time + 2.2;
      this.pose.lift = 0.06;
    }
    const caught = time < this.caughtUntil;
    if (!caught) this.caughtUntil = -1;

    // Ambient life: glances, fidgets, nods on random timers.
    if (time > this.nextAmbient) {
      this.nextAmbient = time + A.ambientMinGap + this.rng() * (A.ambientMaxGap - A.ambientMinGap);
      const side = this.rng() < 0.5 ? -1 : 1;
      switch (this.state) {
        case 'engaged':
          if (this.rng() < 0.6) this.nodUntil = time + 1.2;
          break;
        case 'neutral':
          this.glance(time, side * deg(15 + this.rng() * 25), deg(-5 + this.rng() * 10), 1.5);
          break;
        case 'drifting':
          // Check the clock behind them, or whisper to a neighbour.
          if (this.rng() < 0.5) this.glance(time, side * deg(55 + this.rng() * 20), deg(-20), 2.5);
          else this.glance(time, side * deg(70), deg(5), 3);
          break;
        case 'checkedOut':
          if (this.rng() < 0.3) this.glance(time, side * deg(20), deg(-10), 1.2); // yawn
          break;
      }
    }
    const glancing = time < this.glanceUntil;

    const t = this.target;
    if (caught || this.state === 'engaged') {
      t.lean = deg(8);
      t.headPitch = this.lookAtSpeakerPitch;
      t.headYaw = 0;
    } else if (this.state === 'neutral') {
      t.lean = 0;
      t.headPitch = this.lookAtSpeakerPitch + deg(4);
      t.headYaw = 0;
    } else if (this.state === 'drifting') {
      t.lean = deg(-14);
      t.headPitch = deg(10);
      t.headYaw = deg(15) * (this.seat.col % 2 ? 1 : -1);
    } else {
      t.lean = deg(16);
      t.headPitch = deg(45); // down at a phone
      t.headYaw = 0;
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
    p.lift += (0 - p.lift) * (1 - Math.exp(-dt / 0.15));
  }

  private glance(time: number, yaw: number, pitch: number, seconds: number): void {
    this.glanceYaw = yaw;
    this.glancePitch = pitch;
    this.glanceUntil = time + seconds;
  }
}
