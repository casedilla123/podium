// Microphone level meter. Volume only, analysed on the phone; nothing is
// recorded or saved.

import { rmsDb } from './voice';

export class Mic {
  private readonly buf: Float32Array<ArrayBuffer>;

  private constructor(
    private readonly stream: MediaStream,
    private readonly analyser: AnalyserNode,
  ) {
    this.buf = new Float32Array(analyser.fftSize);
  }

  /** Ask for the mic and wire it to an analyser (not to the speakers). */
  static async open(ctx: AudioContext): Promise<Mic> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    return new Mic(stream, analyser);
  }

  levelDb(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    return rmsDb(this.buf);
  }

  close(): void {
    this.stream.getTracks().forEach((t) => t.stop());
  }
}
