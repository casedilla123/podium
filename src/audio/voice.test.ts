import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { noiseFloor, rmsDb, VoiceDetector } from './voice';

const P = CONFIG.voice;
const DT = 1 / P.sampleHz;

/** Feed a loudness trace of [db, seconds] segments; return the state after each sample. */
function run(det: VoiceDetector, trace: [number, number][]) {
  const out = [];
  for (const [db, secs] of trace) for (let t = 0; t < secs - 1e-9; t += DT) out.push(det.update(db, DT));
  return out;
}

describe('noiseFloor', () => {
  it('takes the median and ignores a stray spike', () => {
    expect(noiseFloor([-60, -61, -59, -20, -60], -75)).toBe(-60);
  });
  it('never goes below the minimum', () => {
    expect(noiseFloor([-120, -110], -75)).toBe(-75);
  });
});

describe('rmsDb', () => {
  it('full-scale square wave is 0 dBFS', () => expect(rmsDb([1, -1, 1, -1])).toBeCloseTo(0));
  it('silence is very quiet', () => expect(rmsDb([0, 0, 0])).toBeLessThan(-100));
});

describe('VoiceDetector', () => {
  it('detects speech above the floor and silence below it', () => {
    const det = new VoiceDetector(P, -60);
    const s = run(det, [[-30, 1], [-62, 2]]);
    expect(s[10].speaking).toBe(true);
    expect(s.at(-1)!.speaking).toBe(false);
    expect(s.at(-1)!.silenceSeconds).toBeGreaterThan(1.5);
  });

  it('holds through short gaps between words', () => {
    const det = new VoiceDetector(P, -60);
    const s = run(det, [[-30, 1], [-62, 0.2], [-30, 1]]);
    expect(s.every((x) => x.speaking)).toBe(true);
  });

  it('a gap longer than the hold becomes silence', () => {
    const det = new VoiceDetector(P, -60);
    const s = run(det, [[-30, 1], [-62, 0.6]]);
    expect(s.at(-1)!.speaking).toBe(false);
  });

  it('noise just above the floor is not speech', () => {
    const det = new VoiceDetector(P, -60);
    const s = run(det, [[-55, 2]]);
    expect(s.some((x) => x.speaking)).toBe(false);
  });

  it('flags quiet speech compared with your usual level', () => {
    const det = new VoiceDetector(P, -60);
    run(det, [[-25, 10]]);
    const s = run(det, [[-40, 4]]);
    expect(s.at(-1)!.speaking).toBe(true);
    expect(s.at(-1)!.quiet).toBe(true);
  });
});
