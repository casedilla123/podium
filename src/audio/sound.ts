// Procedural room sound, positioned in 3D: room tone, coughs, whispers, chair
// creaks, and applause scaled by how engaged the room is at the end. Everything
// is synthesised from one noise buffer, so there are no audio files to load.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { MemberState } from '../audience/attention';

type AudioSessionNav = Navigator & { audioSession?: { type: string } };

export class SoundScape {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  private panners: PannerNode[] = [];
  private enabled = true;
  private roomTone: AudioBufferSourceNode | null = null;
  private readonly fwd = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  /**
   * Create inside a tap handler: iOS only starts audio from a user gesture.
   * withMic picks an audio session that can play and record at once.
   */
  constructor(withMic: boolean) {
    const nav = navigator as AudioSessionNav;
    // Lets sound play with the ringer switch off on recent iOS.
    if (nav.audioSession) nav.audioSession.type = withMic ? 'play-and-record' : 'playback';
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    void this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.sound.master;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.master.gain.setTargetAtTime(on ? CONFIG.sound.master : 0, this.ctx.currentTime, 0.1);
  }

  resume(): void {
    void this.ctx.resume();
  }

  /** One panner per seat; call again when the venue changes. */
  setSeats(headPositions: readonly THREE.Vector3[]): void {
    this.panners.forEach((p) => p.disconnect());
    this.panners = headPositions.map((h) => {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.rolloffFactor = 1;
      p.positionX.value = h.x;
      p.positionY.value = h.y;
      p.positionZ.value = h.z;
      p.connect(this.master);
      return p;
    });
  }

  /** Keep the listener on the speaker's head so sounds stay put as you turn. */
  setListener(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const l = this.ctx.listener;
    this.fwd.set(0, 0, -1).applyQuaternion(quat);
    this.up.set(0, 1, 0).applyQuaternion(quat);
    if (l.forwardX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(this.fwd.x, t);
      l.forwardY.setValueAtTime(this.fwd.y, t);
      l.forwardZ.setValueAtTime(this.fwd.z, t);
      l.upX.setValueAtTime(this.up.x, t);
      l.upY.setValueAtTime(this.up.y, t);
      l.upZ.setValueAtTime(this.up.z, t);
    } else {
      // Older Safari only has the deprecated setters.
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(x: number, y: number, z: number, ux: number, uy: number, uz: number): void;
      };
      legacy.setPosition(pos.x, pos.y, pos.z);
      legacy.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }
  }

  startRoomTone(): void {
    if (this.roomTone) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const g = this.ctx.createGain();
    g.gain.value = CONFIG.sound.roomTone;
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.roomTone = src;
  }

  /** A noise burst through a filter and envelope, into a seat's panner. */
  private burst(
    seat: number,
    at: number,
    filter: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    attack: number,
    decay: number,
  ): void {
    const out = this.panners[seat];
    if (!out || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random() * 1.5, attack + decay + 0.05);
  }

  cough(seat: number): void {
    const t = this.ctx.currentTime + 0.02;
    const f = 500 + Math.random() * 500;
    const n = Math.random() < 0.5 ? 2 : 3;
    for (let k = 0; k < n; k++) this.burst(seat, t + k * 0.22, 'bandpass', f, 1.1, CONFIG.sound.cough, 0.012, 0.16);
  }

  whisper(seat: number): void {
    const t = this.ctx.currentTime + 0.02;
    const syllables = 5 + Math.floor(Math.random() * 5);
    for (let k = 0; k < syllables; k++) {
      this.burst(seat, t + k * 0.14 + Math.random() * 0.05, 'highpass', 2600 + Math.random() * 1500, 0.7, CONFIG.sound.whisper, 0.03, 0.09);
    }
  }

  creak(seat: number): void {
    const out = this.panners[seat];
    if (!out || !this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70 + Math.random() * 40, t);
    osc.frequency.linearRampToValueAtTime(130 + Math.random() * 60, t + 0.28);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(CONFIG.sound.creak, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /** Applause: engaged people clap hard and long, checked-out people barely. Returns its length. */
  applause(states: readonly MemberState[]): number {
    const base = this.ctx.currentTime + 0.1;
    const chance: Record<MemberState, number> = { engaged: 1, neutral: 0.7, drifting: 0.3, checkedOut: 0.05 };
    const strength: Record<MemberState, number> = { engaged: 1, neutral: 0.75, drifting: 0.45, checkedOut: 0.3 };
    let longest = 0;
    states.forEach((s, seat) => {
      if (Math.random() > chance[s]) return;
      const len = CONFIG.sound.applauseSeconds * (0.45 + 0.55 * strength[s]) * (0.8 + 0.4 * Math.random());
      const rate = 3.5 + Math.random() * 2.5;
      const freq = 1100 + Math.random() * 1400;
      const start = base + Math.random() * 0.4;
      for (let t = 0; t < len; t += (1 / rate) * (0.85 + Math.random() * 0.3)) {
        const fade = 1 - Math.max(0, (t - len * 0.6) / (len * 0.4));
        this.burst(seat, start + t, 'bandpass', freq, 1.4, 0.55 * strength[s] * fade + 0.02, 0.002, 0.045);
      }
      longest = Math.max(longest, len);
    });
    return longest;
  }
}
