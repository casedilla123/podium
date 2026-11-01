// Every tuning number in one place. Units: metres, seconds, degrees unless noted.

export type Mood = 'friendly' | 'neutral' | 'tough';

export interface MoodParams {
  /** Base decay per second while ignored (d·m in the outline's formula). */
  decay: number;
  /** Interest gained per second at full gaze credit (g). */
  gain: number;
  /** Pull toward the neighbours' average per second (k). */
  neighborPull: number;
}

export const CONFIG = {
  render: {
    /** Cap instead of the phone's native 3x. Lower first when frames drop. */
    maxPixelRatio: 1.75,
    monoFovDeg: 70,
    near: 0.05,
    far: 60,
  },

  stereo: {
    /** Lens / eye spacing in metres. Adjustable later on a settings screen. */
    ipd: 0.064,
    /** Vertical field of view per eye. */
    eyeFovDeg: 80,
  },

  budget: {
    targetFps: 60,
    minFps: 45,
    drawCallsPerEye: 100,
    trianglesInView: 200_000,
  },

  room: {
    stageHeight: 0.5,
    eyeHeight: 1.6,
    /** Radii of the 4 curved audience rows, measured from the speaker. */
    rowRadii: [4.0, 5.3, 6.6, 7.9],
    /** How far each row steps up from the one in front. */
    rowRise: 0.38,
    seatsPerRow: [7, 7, 8, 8],
    /** Half-angle of each row's arc; the whole audience spans ~120°. */
    rowHalfSpanDeg: [52, 55, 58, 60],
    hallWidth: 22,
    hallFront: 3.5, // wall behind the speaker (+z)
    hallBack: -10.5, // back wall (-z)
    hallHeight: 6.5,
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
    /** Members within this angle of the view centre get credit. */
    creditConeDeg: 12,
    dwellSeconds: 1.2,
    reticleDefaultDistance: 3,
    /** Looking down past this pitch, roughly at the podium, counts as notes. */
    notesPitchDeg: -32,
    notesYawHalfDeg: 35,
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
    /** Looking at notes longer than this speeds up decay for the whole room. */
    notesGraceSeconds: 5,
    notesFactor: 1.6,
  },

  audience: {
    /** Seconds to settle into a new posture; "caught" uses the snap time. */
    postureTime: 1.4,
    caughtSnapTime: 0.35,
    /** A member below this interest who gets looked at snaps upright. */
    caughtBelow: 0.4,
    headFollowMaxYawDeg: 60,
    ambientMinGap: 2,
    ambientMaxGap: 7,
  },

  talk: {
    lengthsMin: [2, 3, 5],
    countdownSeconds: 3,
    endConfirmSeconds: 5,
  },

  lighting: {
    houseUp: 1.0,
    houseDim: 0.35,
    dimSeconds: 2.5,
  },

  debug: {
    timeScaleFast: 4,
  },
} as const;
