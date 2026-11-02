// Logs gaze, posture and voice 10 times per second during a talk. The result is
// plain data, so metrics.ts can be tested against synthetic sessions.

import { CONFIG, type Mood, type VenueId } from '../config';
import type { Section } from '../scene/room';

export interface Sample {
  t: number;
  /** Member nearest the centre of view if they're getting a look, else -1. */
  target: number;
  /** Every member getting a look this sample. */
  looked: number[];
  /** Looking down at the podium / table. */
  down: boolean;
  /** null when there's no voice information (no mic). */
  speaking: boolean | null;
  /** Average room interest. */
  interest: number;
}

export interface SeatInfo {
  section: Section;
  row: number;
  x: number;
  z: number;
}

export interface SessionData {
  venue: VenueId;
  mood: Mood;
  lengthMin: number;
  startedAt: number;
  sampleSeconds: number;
  seats: SeatInfo[];
  samples: Sample[];
  finalInterest: number[];
  voiceActive: boolean;
}

export class Recorder {
  private readonly samples: Sample[] = [];
  private acc = 0;
  private t = 0;

  constructor(
    private readonly meta: Omit<SessionData, 'samples' | 'finalInterest' | 'sampleSeconds' | 'voiceActive' | 'startedAt'>,
    private readonly startedAt = Date.now(),
  ) {}

  /** Advance by dt; logs a sample every 100 ms of talk time (several per frame at 4x). */
  update(dt: number, credits: readonly number[], down: boolean, speaking: boolean | null, interest: number): void {
    const step = CONFIG.recorder.sampleSeconds;
    this.acc += dt;
    while (this.acc >= step - 1e-9) {
      this.acc -= step;
      this.t += step;
      const looked: number[] = [];
      let target = -1;
      let best: number = CONFIG.recorder.lookCredit;
      credits.forEach((c, i) => {
        if (c >= CONFIG.recorder.lookCredit) looked.push(i);
        if (c >= best) {
          best = c;
          target = i;
        }
      });
      this.samples.push({ t: +this.t.toFixed(2), target, looked, down, speaking, interest });
    }
  }

  finish(finalInterest: readonly number[]): SessionData {
    return {
      ...this.meta,
      startedAt: this.startedAt,
      sampleSeconds: CONFIG.recorder.sampleSeconds,
      samples: this.samples,
      finalInterest: [...finalInterest],
      voiceActive: this.samples.some((s) => s.speaking !== null),
    };
  }
}
