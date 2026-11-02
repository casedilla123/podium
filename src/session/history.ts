// Run history saved on the phone: a short summary per run, plus the last full
// session so its report can be reopened.

import { CONFIG, type Mood, type VenueId } from '../config';
import type { Metrics } from './metrics';
import type { SessionData } from './recorder';

export interface RunSummary {
  at: number;
  venue: VenueId;
  mood: Mood;
  durationSeconds: number;
  coverage: number;
  downShare: number;
  deadAir: number | null;
  finalInterest: number;
}

const HISTORY_KEY = 'podium.history.v1';
const LAST_KEY = 'podium.lastSession.v1';

export function loadHistory(): RunSummary[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function summarize(d: SessionData, m: Metrics): RunSummary {
  return {
    at: d.startedAt,
    venue: d.venue,
    mood: d.mood,
    durationSeconds: m.durationSeconds,
    coverage: m.coverage,
    downShare: m.downShare,
    deadAir: m.voice ? m.voice.deadAir : null,
    finalInterest: m.finalInterest,
  };
}

/** Saves the run; returns the history before this run (for "vs. last run"). */
export function recordRun(d: SessionData, m: Metrics): RunSummary[] {
  const before = loadHistory();
  try {
    const next = [summarize(d, m), ...before].slice(0, CONFIG.report.historyMax);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    localStorage.setItem(LAST_KEY, JSON.stringify(d));
  } catch {
    // Storage full or blocked: the report still shows, it just isn't kept.
  }
  return before;
}

export function loadLastSession(): SessionData | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
}
