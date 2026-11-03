// Every tuning number in one place. Units: metres, seconds, degrees unless noted.

export type Mood = 'friendly' | 'neutral' | 'tough';
export type VenueId = 'classroom' | 'hall' | 'auditorium' | 'panel';

export interface MoodParams {
  /** Base decay per second while ignored (d·m in the outline's formula). */
  decay: number;
  /** Interest gained per second at full gaze credit (g). */
  gain: number;
  /** Pull toward the neighbours' average per second (k). */
  neighborPull: number;
}

export interface RowSpec {
  radius: number;
  seats: number;
  halfSpanDeg: number;
}

export interface VenueSpec {
  id: VenueId;
  name: string;
  blurb: string;
  /** The speaker stands (or sits) at the origin facing -Z. */
  stageHeight: number;
  eyeHeight: number;
  podium: boolean;
  /** A table between you and the audience (interview panel). */
  table: boolean;
  rows: RowSpec[];
  rowRise: number;
  hall: { width: number; front: number; back: number; height: number };
  /** Projector screen (true) or whiteboard (false) behind the speaker. */
  screen: boolean;
  /** Distance of floating menus; must sit in front of the first row. */
  uiDistance: number;
  palette: { floor: number; wall: number; seat: number; stage: number };
}

export const VENUES: Record<VenueId, VenueSpec> = {
  classroom: {
    id: 'classroom',
    name: 'Classroom',
    blurb: '12 classmates, close up',
    stageHeight: 0.15,
    eyeHeight: 1.6,
    podium: true,
    table: false,
    rows: [
      { radius: 3.0, seats: 6, halfSpanDeg: 42 },
      { radius: 4.3, seats: 6, halfSpanDeg: 36 },
    ],
    rowRise: 0.25,
    hall: { width: 11, front: 2.4, back: -7, height: 3.4 },
    screen: false,
    uiDistance: 2.3,
    palette: { floor: 0x6b5a48, wall: 0xc9c2b4, seat: 0x3b5d7a, stage: 0x5e5145 },
  },
  hall: {
    id: 'hall',
    name: 'Lecture Hall',
    blurb: '30 students on raked rows',
    stageHeight: 0.5,
    eyeHeight: 1.6,
    podium: true,
    table: false,
    rows: [
      { radius: 4.0, seats: 7, halfSpanDeg: 52 },
      { radius: 5.3, seats: 7, halfSpanDeg: 55 },
      { radius: 6.6, seats: 8, halfSpanDeg: 58 },
      { radius: 7.9, seats: 8, halfSpanDeg: 60 },
    ],
    rowRise: 0.38,
    hall: { width: 22, front: 3.5, back: -10.5, height: 6.5 },
    screen: true,
    uiDistance: 2.6,
    palette: { floor: 0x3a2f2a, wall: 0x4a4e5a, seat: 0x7a2e2e, stage: 0x5b4636 },
  },
  auditorium: {
    id: 'auditorium',
    name: 'Auditorium',
    blurb: '62 people, big room',
    stageHeight: 0.9,
    eyeHeight: 1.6,
    podium: true,
    table: false,
    rows: [
      { radius: 5.0, seats: 8, halfSpanDeg: 55 },
      { radius: 6.3, seats: 9, halfSpanDeg: 57 },
      { radius: 7.6, seats: 10, halfSpanDeg: 58 },
      { radius: 8.9, seats: 11, halfSpanDeg: 59 },
      { radius: 10.2, seats: 12, halfSpanDeg: 60 },
      { radius: 11.5, seats: 12, halfSpanDeg: 60 },
    ],
    rowRise: 0.5,
    hall: { width: 30, front: 4.5, back: -14, height: 9 },
    screen: true,
    uiDistance: 2.8,
    palette: { floor: 0x2c2a33, wall: 0x3a3442, seat: 0x5a2a4a, stage: 0x4a3a30 },
  },
  panel: {
    id: 'panel',
    name: 'Interview',
    blurb: 'A panel of 3, seated',
    stageHeight: 0,
    eyeHeight: 1.2,
    podium: false,
    table: true,
    rows: [{ radius: 2.3, seats: 3, halfSpanDeg: 24 }],
    rowRise: 0,
    hall: { width: 7, front: 2.2, back: -5, height: 3 },
    screen: false,
    uiDistance: 1.7,
    palette: { floor: 0x55606a, wall: 0xd8d4cc, seat: 0x2d2d33, stage: 0x55606a },
  },
};

export const MOODS: Record<Mood, { name: string; blurb: string }> = {
  friendly: { name: 'Friendly', blurb: 'Patient, slow to lose interest' },
  neutral: { name: 'Neutral', blurb: 'A typical room' },
  tough: { name: 'Tough', blurb: 'Bored fast, boredom spreads' },
};

export const CONFIG = {
  render: {
    /** Cap instead of the phone's native 3x. Lower first when frames drop. */
    maxPixelRatio: 1.75,
    monoFovDeg: 70,
    handheldFovDeg: 65,
    near: 0.05,
    far: 80,
  },

  stereo: {
    /** Lens / eye spacing defaults; adjustable on the settings screen. */
    ipdMm: 64,
    ipdMinMm: 55,
    ipdMaxMm: 75,
    eyeFovDeg: 80,
    eyeFovMinDeg: 60,
    eyeFovMaxDeg: 100,
    /**
     * CSS pixels per millimetre of screen. iPhones are about 153-166 points per
     * inch (6.0-6.5 per mm); the lens spacing slider absorbs the difference.
     */
    cssPxPerMm: 6.1,
  },

  budget: {
    targetFps: 60,
    minFps: 45,
    drawCallsPerEye: 100,
    trianglesInView: 200_000,
  },

  orientation: {
    /** Time constant for light smoothing of phone rotation. */
    smoothingTau: 0.02,
    /** If no orientation event arrives within this time, fall back to debug look. */
    sensorTimeoutMs: 1500,
  },

  input: {
    tapMaxMs: 450,
    tapMaxMovePx: 12,
    recenterHoldMs: 1000,
    mouseLookDegPerPx: 0.25,
  },

  gaze: {
    /**
     * Anyone within creditFullDeg of the centre of your view gets full credit,
     * fading to none at creditConeDeg. Wide on purpose: looking in a person's
     * general direction counts, you don't have to aim at each face.
     */
    creditFullDeg: 12,
    creditConeDeg: 28,
    dwellSeconds: 1.2,
    reticleDefaultDistance: 3,
    /** Looking down past this pitch, roughly at the podium, counts as looking down. */
    downPitchDeg: -32,
    downYawHalfDeg: 40,
  },

  attention: {
    startInterest: 0.75,
    personalityMin: 0.7,
    personalityMax: 1.3,
    moods: {
      friendly: { decay: 0.01, gain: 0.35, neighborPull: 0.02 },
      neutral: { decay: 0.0175, gain: 0.25, neighborPull: 0.05 },
      tough: { decay: 0.03, gain: 0.18, neighborPull: 0.09 },
    } satisfies Record<Mood, MoodParams>,
    /** State thresholds and the overlap that stops flicker. */
    engagedAbove: 0.7,
    neutralAbove: 0.4,
    driftingAbove: 0.2,
    hysteresis: 0.03,
    /** Voice factor v: multiplies decay. */
    voice: {
      deadAirSeconds: 4,
      deadAirFactor: 2.0,
      quietFactor: 1.5,
      speakingFactor: 0.7,
      neutralFactor: 1.0,
    },
    /** Looking down longer than this speeds up decay for the whole room. */
    downGraceSeconds: 5,
    downFactor: 1.6,
  },

  audience: {
    /** Seconds to settle into a new posture; "caught" uses the snap time. */
    postureTime: 1.4,
    caughtSnapTime: 0.35,
    caughtHold: 2.2,
    /** A member below this interest who gets looked at snaps upright. */
    caughtBelow: 0.4,
    headFollowMaxYawDeg: 60,
    ambientMinGap: 2,
    ambientMaxGap: 7,
    /** Chance an ambient event in a drifting/neutral member is an audible cough. */
    coughChance: 0.12,
  },

  voice: {
    /** Mic loudness is sampled this often. */
    sampleHz: 20,
    /** Speaking = loudness clears the noise floor by this much. */
    marginDb: 12,
    /** Speaking state holds this long after loudness drops (gaps between words). */
    holdSeconds: 0.3,
    /** Speaking this far under your usual level counts as quiet. */
    quietDropDb: 9,
    floorMinDb: -75,
    /** Silences in this range are strategic pauses; over deadAir is dead air. */
    pauseMinSeconds: 1,
    pauseMaxSeconds: 3,
    deadAirSeconds: 4,
  },

  talk: {
    lengthsMin: [1, 2, 3, 5],
    /** Countdown doubles as the mic's quiet calibration. */
    countdownSeconds: 3,
    endConfirmSeconds: 5,
  },

  recorder: {
    sampleSeconds: 0.1,
    /** Gaze credit at or above this counts as "got a look" (about 8° off centre). */
    lookCredit: 0.25,
  },

  report: {
    coverageWindowSeconds: 30,
    /** Starting targets from the outline; tune after test runs. */
    targets: {
      coverage: 0.7,
      sectionMinShare: 0.1,
      blindSpotSeconds: 30,
      downShare: 0.2,
      longestStareSeconds: 5,
      pausesPerMinute: 1,
      deadAirMax: 1,
      speakingShare: 0.8,
      finalInterest: 0.6,
    },
    historyMax: 20,
  },

  hints: {
    /** Show a blind-spot hint once a section has gone this long without a look. */
    blindSpotSeconds: 18,
    deadAirSeconds: 3,
  },

  lighting: {
    houseUp: 1.0,
    houseDim: 0.4,
    dimSeconds: 2.5,
  },

  sound: {
    master: 0.9,
    roomTone: 0.035,
    cough: 0.25,
    whisper: 0.06,
    creak: 0.05,
    applauseSeconds: 4.5,
  },

  debug: {
    timeScaleFast: 4,
  },
} as const;
