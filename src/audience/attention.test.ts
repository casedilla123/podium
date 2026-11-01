import { describe, expect, it } from 'vitest';
import { CONFIG, type Mood } from '../config';
import {
  classify,
  gazeCredit,
  mulberry32,
  notesFactor,
  stepInterest,
  stepRoom,
  voiceFactor,
  type MemberState,
} from './attention';

const A = CONFIG.attention;
const DT = 1 / 60;

/** Seconds until an ignored, average member in a uniformly ignored row falls below `below`. */
function secondsToFall(mood: Mood, below: number, roomFactor = 1): number {
  let i: number = A.startInterest;
  let t = 0;
  while (i >= below && t < 600) {
    i = stepInterest(i, DT, 0, A.moods[mood], 1, roomFactor, i);
    t += DT;
  }
  return t;
}

describe('gazeCredit', () => {
  it('is 1 at the centre, 0 at and beyond the cone edge', () => {
    expect(gazeCredit(0, 12)).toBeCloseTo(1);
    expect(gazeCredit(12, 12)).toBe(0);
    expect(gazeCredit(40, 12)).toBe(0);
  });
  it('falls off monotonically', () => {
    let prev = 1.01;
    for (let a = 0; a < 12; a += 0.5) {
      const c = gazeCredit(a, 12);
      expect(c).toBeLessThan(prev);
      prev = c;
    }
  });
});

describe('ignored drift times match the outline', () => {
  it.each([
    ['friendly', 35],
    ['neutral', 20],
    ['tough', 12],
  ] as const)('%s drifts in about %i s', (mood, expected) => {
    expect(secondsToFall(mood, A.neutralAbove)).toBeGreaterThan(expected * 0.9);
    expect(secondsToFall(mood, A.neutralAbove)).toBeLessThan(expected * 1.1);
  });

  it('dead air makes the room drift faster', () => {
    const f = voiceFactor({ active: true, speaking: false, silenceSeconds: 6, quiet: false }, A.voice);
    expect(secondsToFall('neutral', A.neutralAbove, f)).toBeLessThan(secondsToFall('neutral', A.neutralAbove));
  });
});

describe('stepInterest', () => {
  const m = A.moods.neutral;
  it('rises fast while looked at', () => {
    let i = 0.2;
    for (let t = 0; t < 2; t += DT) i = stepInterest(i, DT, 1, m, 1, 1, i);
    expect(i).toBeGreaterThan(0.6);
  });
  it('stays in [0, 1]', () => {
    expect(stepInterest(0.999, 1, 1, m, 1, 1, 1)).toBe(1);
    expect(stepInterest(0.001, 10, 0, m, 1.3, 2, 0)).toBe(0);
  });
  it('higher personality decays faster', () => {
    expect(stepInterest(0.5, 1, 0, m, 1.3, 1, 0.5)).toBeLessThan(stepInterest(0.5, 1, 0, m, 0.7, 1, 0.5));
  });
});

describe('stepRoom', () => {
  it('pulls a member toward the neighbours average', () => {
    const mood = { decay: 0, gain: 0, neighborPull: 0.5 };
    const next = stepRoom([0.2, 0.8, 0.8], [0, 0, 0], [[1, 2], [0], [0]], [1, 1, 1], 0.1, mood, 1);
    expect(next[0]).toBeGreaterThan(0.2);
    expect(next[1]).toBeLessThan(0.8);
  });
  it('a looked-at member stays up while the ignored row slumps', () => {
    let I = [0.75, 0.75, 0.75, 0.75];
    const nb = [[1], [0, 2], [1, 3], [2]];
    for (let t = 0; t < 25; t += DT) {
      I = stepRoom(I, [1, 0, 0, 0], nb, [1, 1, 1, 1], DT, A.moods.neutral, 1);
    }
    expect(I[0]).toBeGreaterThan(0.9);
    expect(I[3]).toBeLessThan(A.neutralAbove);
  });
  it('does not depend on update order', () => {
    const nb = [[1], [0, 2], [1]];
    const a = stepRoom([0.1, 0.5, 0.9], [0, 1, 0], nb, [1, 1, 1], 0.5, A.moods.tough, 1);
    const b = stepRoom([0.9, 0.5, 0.1], [0, 1, 0], nb, [1, 1, 1], 0.5, A.moods.tough, 1).reverse();
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]));
  });
});

describe('classify', () => {
  it('maps interest to states', () => {
    expect(classify(0.9, 'neutral', A)).toBe('engaged');
    expect(classify(0.55, 'engaged', A)).toBe('neutral');
    expect(classify(0.3, 'neutral', A)).toBe('drifting');
    expect(classify(0.05, 'drifting', A)).toBe('checkedOut');
  });
  it('does not flicker around a threshold', () => {
    let s: MemberState = 'neutral';
    const seen = new Set<MemberState>();
    for (let k = 0; k < 200; k++) {
      s = classify(0.4 + 0.02 * Math.sin(k), s, A);
      seen.add(s);
    }
    expect(seen.size).toBe(1);
  });
});

describe('voice and notes factors', () => {
  const off = { active: false, speaking: false, silenceSeconds: 99, quiet: false };
  it('is neutral with no mic', () => expect(voiceFactor(off, A.voice)).toBe(1));
  it('slows decay while speaking steadily', () =>
    expect(voiceFactor({ active: true, speaking: true, silenceSeconds: 0, quiet: false }, A.voice)).toBeLessThan(1));
  it('short pauses are free', () =>
    expect(voiceFactor({ active: true, speaking: false, silenceSeconds: 2, quiet: false }, A.voice)).toBe(1));
  it('notes only count after the grace period', () => {
    expect(notesFactor(3, 5, 1.6)).toBe(1);
    expect(notesFactor(6, 5, 1.6)).toBe(1.6);
  });
});

describe('mulberry32', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let k = 0; k < 100; k++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
