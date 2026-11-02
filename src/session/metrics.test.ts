import { describe, expect, it } from 'vitest';
import { VENUES } from '../config';
import { layoutSeats } from '../scene/room';
import { computeMetrics, runs } from './metrics';
import { Recorder, type Sample, type SessionData } from './recorder';

const seats = layoutSeats(VENUES.hall).map((s) => ({ section: s.section, row: s.row, x: s.position.x, z: s.position.z }));
const N = seats.length;
const DT = 0.1;

function session(samples: Omit<Sample, 't'>[], voice = false): SessionData {
  return {
    venue: 'hall',
    mood: 'neutral',
    lengthMin: 2,
    startedAt: 0,
    sampleSeconds: DT,
    seats,
    samples: samples.map((s, i) => ({ ...s, t: +(i * DT + DT).toFixed(2) })),
    finalInterest: new Array(N).fill(0.5),
    voiceActive: voice,
  };
}

const look = (m: number, extra: Partial<Sample> = {}): Omit<Sample, 't'> => ({
  target: m,
  looked: m >= 0 ? [m] : [],
  down: false,
  speaking: null,
  interest: 0.5,
  ...extra,
});

const centre = seats.findIndex((s) => s.section === 'front-center');

describe('runs', () => {
  it('finds true runs', () => {
    expect(runs([false, true, true, false, true])).toEqual([
      [1, 3],
      [4, 5],
    ]);
  });
});

describe('stare at the centre the whole time', () => {
  const m = computeMetrics(session(Array.from({ length: 600 }, () => look(centre))));
  it('has very low coverage', () => expect(m.coverage).toBeCloseTo(1 / N, 3));
  it('leaves a blind spot the whole talk long', () => expect(m.blindSpot!.seconds).toBeCloseTo(60, 0));
  it('counts one long stare', () => expect(m.longestStareSeconds).toBeCloseTo(60, 0));
  it('puts all gaze in one section', () => expect(m.sectionShare['front-center']).toBe(1));
  it('coaches about the blind spot or coverage', () => expect(m.coaching).toMatch(/without a look|looked at/));
});

describe('sweep the room evenly', () => {
  // One second per person, cycling through everyone.
  const m = computeMetrics(session(Array.from({ length: 1200 }, (_, i) => look(Math.floor(i / 10) % N))));
  it('has full coverage', () => expect(m.coverage).toBeCloseTo(1, 2));
  it('has no long blind spot', () => expect(m.blindSpot!.seconds).toBeLessThan(30));
  it('has short stares', () => expect(m.longestStareSeconds).toBeCloseTo(1, 1));
  it('spreads gaze across all six sections', () => {
    expect(Object.keys(m.sectionShare)).toHaveLength(6);
    for (const v of Object.values(m.sectionShare)) expect(v).toBeGreaterThan(0.1);
  });
  it('gives each person about the same look time', () => {
    expect(Math.max(...m.lookSeconds) - Math.min(...m.lookSeconds)).toBeLessThan(1.01);
  });
});

describe('looking down', () => {
  it('measures the share of time looking down', () => {
    const s = Array.from({ length: 100 }, (_, i) => look(i < 30 ? -1 : centre, { down: i < 30 }));
    const m = computeMetrics(session(s));
    expect(m.downShare).toBeCloseTo(0.3);
    expect(m.downSpans).toEqual([{ start: 0, end: 3 }]);
  });
});

describe('voice', () => {
  const pattern = (secs: number, speaking: boolean) => Array.from({ length: secs * 10 }, () => look(centre, { speaking }));
  const m = computeMetrics(
    session(
      [
        ...pattern(2, false), // before first word: ignored
        ...pattern(10, true),
        ...pattern(2, false), // strategic pause
        ...pattern(10, true),
        ...pattern(6, false), // dead air
        ...pattern(10, true),
        ...pattern(3, false), // after the last word: ignored
      ],
      true,
    ),
  );
  it('counts one strategic pause', () => expect(m.voice!.pauses).toBe(1));
  it('counts one dead air', () => expect(m.voice!.deadAir).toBe(1));
  it('finds the longest silence', () => expect(m.voice!.longestSilence).toBeCloseTo(6));
  it('marks where the dead air happened', () => expect(m.deadAirSpans[0].start).toBeCloseTo(24));
  it('measures speaking share over the whole talk', () => expect(m.voice!.speakingShare).toBeCloseTo(30 / 43, 2));
});

describe('Recorder', () => {
  it('logs 10 samples per second and picks the strongest look as target', () => {
    const r = new Recorder({ venue: 'hall', mood: 'neutral', lengthMin: 1, seats }, 0);
    const credits = new Array(N).fill(0);
    credits[3] = 0.9;
    credits[4] = 0.3;
    for (let k = 0; k < 60; k++) r.update(1 / 60, credits, false, true, 0.6);
    const d = r.finish(new Array(N).fill(0.6));
    expect(d.samples).toHaveLength(10);
    expect(d.samples[0].target).toBe(3);
    expect(d.samples[0].looked).toEqual([3, 4]);
    expect(d.voiceActive).toBe(true);
  });
  it('catches up with several samples in one long frame (4x time)', () => {
    const r = new Recorder({ venue: 'hall', mood: 'neutral', lengthMin: 1, seats }, 0);
    r.update(0.45, new Array(N).fill(0), false, null, 0.5);
    expect(r.finish([]).samples).toHaveLength(4);
  });
});
