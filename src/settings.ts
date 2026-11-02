// User settings, saved on the phone. Everything here is chosen on the launch
// screen; venue, mood and length can also be changed by gaze inside the viewer.

import { CONFIG, VENUES, type Mood, type VenueId } from './config';

export type ViewMode = 'cardboard' | 'handheld';

export interface Settings {
  venue: VenueId;
  mood: Mood;
  lengthMin: number;
  mic: boolean;
  sound: boolean;
  /** Tint bodies by attention state (true) or show ordinary clothes (false). */
  attentionColors: boolean;
  /** Floating coaching hints during the talk. */
  hints: boolean;
  view: ViewMode;
  ipdMm: number;
  fovDeg: number;
}

export const DEFAULT_SETTINGS: Settings = {
  venue: 'hall',
  mood: 'neutral',
  lengthMin: 2,
  mic: true,
  sound: true,
  attentionColors: true,
  hints: true,
  view: 'cardboard',
  ipdMm: CONFIG.stereo.ipdMm,
  fovDeg: CONFIG.stereo.eyeFovDeg,
};

const KEY = 'podium.settings.v1';

/** Merge saved values over defaults, dropping anything stale or out of range. */
export function sanitize(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  if (typeof r.venue === 'string' && r.venue in VENUES) s.venue = r.venue as VenueId;
  if (r.mood === 'friendly' || r.mood === 'neutral' || r.mood === 'tough') s.mood = r.mood;
  if (typeof r.lengthMin === 'number' && (CONFIG.talk.lengthsMin as readonly number[]).includes(r.lengthMin)) s.lengthMin = r.lengthMin;
  for (const k of ['mic', 'sound', 'attentionColors', 'hints'] as const) if (typeof r[k] === 'boolean') s[k] = r[k] as boolean;
  if (r.view === 'cardboard' || r.view === 'handheld') s.view = r.view;
  const clampNum = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  s.ipdMm = clampNum(r.ipdMm, CONFIG.stereo.ipdMinMm, CONFIG.stereo.ipdMaxMm, s.ipdMm);
  s.fovDeg = clampNum(r.fovDeg, CONFIG.stereo.eyeFovMinDeg, CONFIG.stereo.eyeFovMaxDeg, s.fovDeg);
  return s;
}

export function loadSettings(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): settings last for this visit only.
  }
}
