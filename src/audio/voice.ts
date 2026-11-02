// Speaking vs. silence from mic loudness. Pure: no Web Audio, no DOM, so it is
// unit tested with synthetic loudness traces.

export interface VoiceParams {
  /** Speaking = loudness clears the noise floor by this many dB. */
  marginDb: number;
  /** Speaking holds this long after loudness drops, so gaps between words aren't pauses. */
  holdSeconds: number;
  /** Speaking this far under your running speaking level counts as quiet. */
  quietDropDb: number;
  floorMinDb: number;
}

export interface VoiceState {
  speaking: boolean;
  /** Length of the current silence; 0 while speaking. */
  silenceSeconds: number;
  quiet: boolean;
  levelDb: number;
}

/** Noise floor from calibration samples: the median, so a stray bump doesn't skew it. */
export function noiseFloor(samplesDb: readonly number[], floorMinDb: number): number {
  if (samplesDb.length === 0) return floorMinDb;
  const sorted = [...samplesDb].sort((a, b) => a - b);
  return Math.max(floorMinDb, sorted[Math.floor(sorted.length / 2)]);
}

/** RMS of a time-domain buffer (-1..1) in dBFS. */
export function rmsDb(buffer: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  const rms = Math.sqrt(sum / Math.max(1, buffer.length));
  return 20 * Math.log10(Math.max(rms, 1e-6));
}

export class VoiceDetector {
  floorDb: number;
  private holdLeft = 0;
  private silence = 0;
  private speaking = false;
  /** Slow average of loudness while speaking: "your normal level". */
  private usualDb: number | null = null;
  /** Fast average of loudness while speaking: "right now". */
  private recentDb: number | null = null;

  constructor(
    private readonly p: VoiceParams,
    floorDb = -60,
  ) {
    this.floorDb = floorDb;
  }

  update(levelDb: number, dt: number): VoiceState {
    const loud = levelDb > this.floorDb + this.p.marginDb;
    if (loud) {
      this.holdLeft = this.p.holdSeconds;
      this.speaking = true;
      const slow = 1 - Math.exp(-dt / 20);
      const fast = 1 - Math.exp(-dt / 1.2);
      this.usualDb = this.usualDb === null ? levelDb : this.usualDb + (levelDb - this.usualDb) * slow;
      this.recentDb = this.recentDb === null ? levelDb : this.recentDb + (levelDb - this.recentDb) * fast;
    } else {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0) this.speaking = false;
    }
    this.silence = this.speaking ? 0 : this.silence + dt;
    const quiet =
      this.speaking && this.usualDb !== null && this.recentDb !== null && this.recentDb < this.usualDb - this.p.quietDropDb;
    return { speaking: this.speaking, silenceSeconds: this.silence, quiet, levelDb };
  }
}
