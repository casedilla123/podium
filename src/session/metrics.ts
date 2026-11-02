// Samples -> report numbers. Pure and unit tested against synthetic sessions.

import { CONFIG } from '../config';
import { SECTIONS, sectionLabel, type Section } from '../scene/room';
import type { SessionData } from './recorder';

export interface Span {
  start: number;
  end: number;
}

export interface Metrics {
  durationSeconds: number;
  memberCount: number;
  /** Share of members who got a look in each 30 s window, averaged over the talk. */
  coverage: number;
  /** Share of gaze time per section (sections with seats only). */
  sectionShare: Partial<Record<Section, number>>;
  weakestSection: { section: Section; share: number } | null;
  /** Longest stretch any section went without a look. */
  blindSpot: { section: Section; seconds: number } | null;
  /** Share of the talk spent looking down. */
  downShare: number;
  longestStareSeconds: number;
  voice: {
    speakingShare: number;
    pauses: number;
    pausesPerMinute: number;
    deadAir: number;
    longestSilence: number;
  } | null;
  finalInterest: number;
  engagedAtEnd: number;
  /** Seconds each member spent as the centre of your gaze. */
  lookSeconds: number[];
  /** Room interest, one point per second. */
  timeline: { t: number; interest: number }[];
  deadAirSpans: Span[];
  downSpans: Span[];
  coaching: string;
}

/** Runs of `true` in a boolean series, as [startIndex, endIndexExclusive]. */
export function runs(series: readonly boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  series.forEach((v, i) => {
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, series.length]);
  return out;
}

export function computeMetrics(d: SessionData): Metrics {
  const dt = d.sampleSeconds;
  const S = d.samples;
  const n = d.seats.length;
  const duration = S.length * dt;
  const T = CONFIG.report.targets;
  const singleRow = new Set(d.seats.map((s) => s.row)).size === 1;
  const present = SECTIONS.filter((sec) => d.seats.some((s) => s.section === sec));

  // Eye-contact coverage per 30 s window. A short final window only counts if it's at least 10 s.
  const win = Math.round(CONFIG.report.coverageWindowSeconds / dt);
  const fractions: number[] = [];
  for (let i = 0; i < S.length; i += win) {
    const slice = S.slice(i, i + win);
    if (fractions.length > 0 && slice.length * dt < 10) break;
    const seen = new Set<number>();
    slice.forEach((s) => s.looked.forEach((m) => seen.add(m)));
    fractions.push(n ? seen.size / n : 0);
  }
  const coverage = fractions.length ? fractions.reduce((a, b) => a + b, 0) / fractions.length : 0;

  // Section balance, by the person at the centre of your gaze.
  const counts = new Map<Section, number>(present.map((s) => [s, 0]));
  const lookSeconds = new Array<number>(n).fill(0);
  for (const s of S) {
    if (s.target < 0) continue;
    counts.set(d.seats[s.target].section, (counts.get(d.seats[s.target].section) ?? 0) + 1);
    lookSeconds[s.target] += dt;
  }
  const totalTargeted = [...counts.values()].reduce((a, b) => a + b, 0);
  const sectionShare: Partial<Record<Section, number>> = {};
  let weakestSection: Metrics['weakestSection'] = null;
  for (const sec of present) {
    const share = totalTargeted ? (counts.get(sec) ?? 0) / totalTargeted : 0;
    sectionShare[sec] = share;
    if (!weakestSection || share < weakestSection.share) weakestSection = { section: sec, share };
  }

  // Longest blind spot per section.
  let blindSpot: Metrics['blindSpot'] = null;
  for (const sec of present) {
    const unseen = S.map((s) => !s.looked.some((m) => d.seats[m].section === sec));
    for (const [a, b] of runs(unseen)) {
      const secs = (b - a) * dt;
      if (!blindSpot || secs > blindSpot.seconds) blindSpot = { section: sec, seconds: secs };
    }
  }

  // Longest unbroken look at one person.
  let longestStare = 0;
  let cur = 0;
  S.forEach((s, i) => {
    cur = s.target >= 0 && i > 0 && S[i - 1].target === s.target ? cur + 1 : s.target >= 0 ? 1 : 0;
    longestStare = Math.max(longestStare, cur);
  });

  const downRuns = runs(S.map((s) => s.down));
  const downShare = S.length ? S.filter((s) => s.down).length / S.length : 0;
  const toSpan = ([a, b]: [number, number]): Span => ({ start: a * dt, end: b * dt });

  // Voice: pauses and dead air, ignoring silence before you first speak and after you finish.
  let voice: Metrics['voice'] = null;
  let deadAirSpans: Span[] = [];
  if (d.voiceActive) {
    const speaking = S.map((s) => s.speaking === true);
    const first = speaking.indexOf(true);
    const last = speaking.lastIndexOf(true);
    const silences = first < 0 ? [] : runs(speaking.slice(first, last + 1).map((v) => !v)).map(([a, b]) => [a + first, b + first] as [number, number]);
    const V = CONFIG.voice;
    const lengths = silences.map(([a, b]) => (b - a) * dt);
    const pauses = lengths.filter((l) => l >= V.pauseMinSeconds && l <= V.pauseMaxSeconds).length;
    const dead = silences.filter(([a, b]) => (b - a) * dt > V.deadAirSeconds);
    deadAirSpans = dead.map(toSpan);
    voice = {
      speakingShare: S.length ? speaking.filter(Boolean).length / S.length : 0,
      pauses,
      pausesPerMinute: duration > 0 ? pauses / (duration / 60) : 0,
      deadAir: first < 0 ? 1 : dead.length,
      longestSilence: first < 0 ? duration : Math.max(0, ...lengths),
    };
  }

  const timeline: Metrics['timeline'] = [];
  const perSec = Math.round(1 / dt);
  for (let i = 0; i < S.length; i += perSec) timeline.push({ t: S[i].t, interest: S[i].interest });
  if (S.length) timeline.push({ t: S[S.length - 1].t, interest: S[S.length - 1].interest });

  const finalInterest = n ? d.finalInterest.reduce((a, b) => a + b, 0) / n : 0;
  const m: Metrics = {
    durationSeconds: duration,
    memberCount: n,
    coverage,
    sectionShare,
    weakestSection,
    blindSpot,
    downShare,
    longestStareSeconds: longestStare * dt,
    voice,
    finalInterest,
    engagedAtEnd: d.finalInterest.filter((x) => x > CONFIG.attention.engagedAbove).length,
    lookSeconds,
    timeline,
    deadAirSpans,
    downSpans: downRuns.filter(([a, b]) => (b - a) * dt >= 2).map(toSpan),
    coaching: '',
  };
  m.coaching = coachingLine(m, singleRow, T);
  return m;
}

/** The weakest metric, relative to its target, turned into one line of plain advice. */
export function coachingLine(m: Metrics, singleRow: boolean, T = CONFIG.report.targets): string {
  const pct = (x: number) => Math.round(x * 100);
  const label = (s: Section) => sectionLabel(s, singleRow).toLowerCase();
  const issues: { badness: number; text: string }[] = [];

  if (m.durationSeconds < 10) return 'That was very short. Try a full run to get real feedback.';
  if (m.blindSpot && m.blindSpot.seconds > T.blindSpotSeconds) {
    issues.push({
      badness: m.blindSpot.seconds / T.blindSpotSeconds,
      text: `The ${label(m.blindSpot.section)} ${singleRow ? 'side' : 'section'} went ${Math.round(m.blindSpot.seconds)} seconds without a look. Sweep back there every 20 seconds or so.`,
    });
  }
  if (m.coverage < T.coverage) {
    issues.push({
      badness: T.coverage / Math.max(m.coverage, 0.05),
      text: `In a typical 30 seconds you looked at ${pct(m.coverage)}% of the room. Aim for ${pct(T.coverage)}%: move your eyes person to person.`,
    });
  }
  if (m.downShare > T.downShare) {
    issues.push({
      badness: m.downShare / T.downShare,
      text: `You spent ${pct(m.downShare)}% of the talk looking down. Glance at the podium, then come straight back up.`,
    });
  }
  if (m.longestStareSeconds > T.longestStareSeconds * 1.5) {
    issues.push({
      badness: m.longestStareSeconds / T.longestStareSeconds / 1.5,
      text: `You held one person's eyes for ${Math.round(m.longestStareSeconds)} seconds straight. Three to five seconds each feels natural.`,
    });
  }
  if (m.weakestSection && !singleRow && m.weakestSection.share < T.sectionMinShare && m.weakestSection.share >= 0) {
    issues.push({
      badness: (T.sectionMinShare / Math.max(m.weakestSection.share, 0.02)) * 0.8,
      text: `Only ${pct(m.weakestSection.share)}% of your eye contact went to the ${label(m.weakestSection.section)} section.`,
    });
  }
  if (m.voice) {
    if (m.voice.deadAir > T.deadAirMax) {
      issues.push({
        badness: m.voice.deadAir / Math.max(T.deadAirMax, 1),
        text: `There were ${m.voice.deadAir} silences longer than 4 seconds. Short pauses help; long ones lose the room.`,
      });
    }
    if (m.voice.speakingShare < T.speakingShare * 0.75) {
      issues.push({
        badness: T.speakingShare / Math.max(m.voice.speakingShare, 0.05),
        text: `You were speaking ${pct(m.voice.speakingShare)}% of the time. Keep the talk moving.`,
      });
    }
  }
  issues.sort((a, b) => b.badness - a.badness);
  if (issues.length) return issues[0].text;
  if (m.voice && m.voice.pausesPerMinute < T.pausesPerMinute) {
    return 'Great eye contact. Next time, add a few 1–3 second pauses to let key points land.';
  }
  return 'Strong run: you reached the whole room and kept them with you.';
}
