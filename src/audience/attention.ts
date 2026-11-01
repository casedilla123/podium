// Pure interest model. No three.js, no DOM: everything here is unit tested.
//
// One step, per member:
//   I' = clamp01( I + dt * [ g*L - d*p*v + k*(N - I) ] )
// I interest, L gaze credit, g gain, d mood decay, p personality,
// v room decay factor (voice x notes), k neighbour pull, N neighbours' average.

import type { MoodParams } from '../config';

export type MemberState = 'engaged' | 'neutral' | 'drifting' | 'checkedOut';

export interface StateThresholds {
  engagedAbove: number;
  neutralAbove: number;
  driftingAbove: number;
  hysteresis: number;
}

export interface VoiceInput {
  /** False when there is no audio information yet (no mic): factor stays neutral. */
  active: boolean;
  speaking: boolean;
  /** Length of the current silence, 0 while speaking. */
  silenceSeconds: number;
  /** Speaking, but well under the calibrated level. */
  quiet: boolean;
}

export interface VoiceFactors {
  deadAirSeconds: number;
  deadAirFactor: number;
  quietFactor: number;
  speakingFactor: number;
  neutralFactor: number;
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Gaze credit 0..1: 1 at the centre of view, smoothly falling to 0 at the cone edge. */
export function gazeCredit(angleDeg: number, coneDeg: number): number {
  if (angleDeg >= coneDeg) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * angleDeg) / coneDeg));
}

/** Multiplier on decay from how the speaker sounds. */
export function voiceFactor(v: VoiceInput, f: VoiceFactors): number {
  if (!v.active) return f.neutralFactor;
  if (!v.speaking) return v.silenceSeconds > f.deadAirSeconds ? f.deadAirFactor : f.neutralFactor;
  return v.quiet ? f.quietFactor : f.speakingFactor;
}

/** Multiplier on decay from reading notes: kicks in after a grace period of continuous looking down. */
export function notesFactor(notesStretchSeconds: number, graceSeconds: number, factor: number): number {
  return notesStretchSeconds > graceSeconds ? factor : 1;
}

export function stepInterest(
  interest: number,
  dt: number,
  credit: number,
  mood: MoodParams,
  personality: number,
  roomFactor: number,
  neighborAvg: number,
): number {
  const rate =
    mood.gain * credit - mood.decay * personality * roomFactor + mood.neighborPull * (neighborAvg - interest);
  return clamp01(interest + dt * rate);
}

/**
 * Advance every member one step. Neighbour averages use the interest values
 * from before this step, so update order doesn't matter.
 */
export function stepRoom(
  interest: readonly number[],
  credit: readonly number[],
  neighbors: readonly (readonly number[])[],
  personality: readonly number[],
  dt: number,
  mood: MoodParams,
  roomFactor: number,
): number[] {
  const next = new Array<number>(interest.length);
  for (let i = 0; i < interest.length; i++) {
    const ns = neighbors[i];
    let avg = interest[i];
    if (ns.length > 0) {
      avg = 0;
      for (const n of ns) avg += interest[n];
      avg /= ns.length;
    }
    next[i] = stepInterest(interest[i], dt, credit[i], mood, personality[i], roomFactor, avg);
  }
  return next;
}

const RANK: Record<MemberState, number> = { checkedOut: 0, drifting: 1, neutral: 2, engaged: 3 };

function rawState(i: number, t: StateThresholds): MemberState {
  if (i > t.engagedAbove) return 'engaged';
  if (i > t.neutralAbove) return 'neutral';
  if (i > t.driftingAbove) return 'drifting';
  return 'checkedOut';
}

/**
 * State with hysteresis: a member only changes state once interest clears the
 * boundary by the hysteresis margin, so values near a threshold don't flicker.
 */
export function classify(interest: number, prev: MemberState, t: StateThresholds): MemberState {
  const up = rawState(interest - t.hysteresis, t);
  const down = rawState(interest + t.hysteresis, t);
  if (RANK[up] > RANK[prev]) return up;
  if (RANK[down] < RANK[prev]) return down;
  return prev;
}

/** Deterministic PRNG so crowd personalities are reproducible in tests and between runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
