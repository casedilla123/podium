// Boot, app state machine, render loop.
//
// Every frame, in order:
//   1. Read the phone's rotation (or debug mouse-look) and set the head.
//   2. Raycast from the centre of view: buttons, reticle depth, dwell.
//   3. Gaze credit + voice + looking down -> attention model.
//   4. Members' states and postures.
//   5. Every 100 ms of talk, log a sample for the report.
//   6. Render the left eye, then the right eye.

import * as THREE from 'three';
import { CONFIG, MOODS, VENUES, type Mood, type VenueId } from './config';
import { notesFactor, voiceFactor, type VoiceInput } from './audience/attention';
import { Crowd } from './audience/crowd';
import { Mic } from './audio/mic';
import { SoundScape } from './audio/sound';
import { noiseFloor, VoiceDetector, type VoiceState } from './audio/voice';
import { Hud } from './debug/hud';
import { DesktopLook } from './input/desktopLook';
import { Gaze } from './input/gaze';
import { OrientationControl, requestMotionPermission, yawOf } from './input/orientation';
import { attachTap } from './input/tap';
import { StereoRig } from './render/stereo';
import { buildLighting, type Lighting } from './scene/lighting';
import { buildRoom, sectionLabel, SECTIONS, type Room, type Section } from './scene/room';
import { loadHistory, loadLastSession, recordRun } from './session/history';
import { computeMetrics, type Metrics } from './session/metrics';
import { Recorder, type SessionData } from './session/recorder';
import { loadSettings, saveSettings, type Settings } from './settings';
import { buildSettings } from './ui/launch';
import { makeButton, placeInRoom, TextPanel, type Button, type TextLine } from './ui/panels';
import { clock, renderReport } from './ui/report';
import { paintVrReport } from './ui/vrReport';

type AppState = 'launch' | 'recenter' | 'setup' | 'countdown' | 'talk' | 'ended' | 'report';

const params = new URLSearchParams(location.search);
const forceDebug = params.has('debug');
const isTouch = navigator.maxTouchPoints > 0;
// Opened from the Home Screen icon (no browser bars) rather than a Safari tab.
const isInstalled =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches;

let settings: Settings = loadSettings();

// ---------- Renderer, rig, and the swappable venue ----------

const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.info.autoReset = false; // two renders per frame; we reset once per frame
container.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const rig = new StereoRig();
scene.add(rig.head);
const gaze = new Gaze();
scene.add(gaze.reticle);

let room: Room;
let lighting: Lighting;
let crowd: Crowd;

// Gaze-credit cone outline for debug (G): the 12° circle at 3 m.
const coneR = 3 * Math.tan(THREE.MathUtils.degToRad(CONFIG.gaze.creditConeDeg));
const cone = new THREE.Mesh(
  new THREE.RingGeometry(coneR - 0.012, coneR, 64),
  new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, depthTest: false }),
);
cone.position.z = -3;
cone.renderOrder = 999;
cone.visible = false;
rig.head.add(cone);

const hud = new Hud();
const helpEl = document.getElementById('help')!;

// Size to the on-screen box, not window.innerWidth/innerHeight: iOS reports stale
// sizes right after rotating and while Safari's bars move, which squashes the eye views.
let viewW = 0;
let viewH = 0;
function resize(): void {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === viewW && h === viewH) return;
  viewW = w;
  viewH = h;
  renderer.setSize(w, h);
  rig.resize(w, h);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

// ---------- In-world UI (built once, laid out per venue) ----------

const panelStyle = { background: 'rgba(16,19,28,0.88)', border: 'rgba(255,255,255,0.18)', radius: 0.06 };

const recenterSign = new TextPanel(2.0, 0.75, panelStyle);
const setupTitle = new TextPanel(2.2, 0.3);
const countdownPanel = new TextPanel(1.4, 1.0, panelStyle);
const hintPanel = new TextPanel(2.0, 0.32, { background: 'rgba(16,19,28,0.75)', radius: 0.05 });
const vrReport = new TextPanel(2.5, 1.45);
// Timer and mic meter on the podium (or the interview table).
const podiumPanel = new TextPanel(0.74, 0.46, { background: 'rgba(12,14,20,0.92)', radius: 0.02, align: 'left', padding: 0.035 });
for (const p of [recenterSign, setupTitle, countdownPanel, hintPanel, vrReport]) p.setOverlay(true);

const venueButtons = (Object.keys(VENUES) as VenueId[]).map((id) => ({
  id,
  b: makeButton(VENUES[id].name, 0.6, 0.2, () => changeSettings({ venue: id }), 0.075),
}));
const moodButtons = (Object.keys(MOODS) as Mood[]).map((m) => ({
  m,
  b: makeButton(MOODS[m].name, 0.6, 0.2, () => changeSettings({ mood: m }), 0.08),
}));
const lengthButtons = CONFIG.talk.lengthsMin.map((min) => ({
  min,
  b: makeButton(`${min} min`, 0.6, 0.2, () => changeSettings({ lengthMin: min }), 0.08),
}));
const beginButton = makeButton('Begin', 0.8, 0.24, () => go('countdown'), 0.12);
const exitButton = makeButton('Exit', 0.5, 0.16, () => exitToPage('launch'), 0.065);
// Above the audience so looking at people never triggers it.
const endButton = makeButton('End talk?', 0.8, 0.26, () => go('ended'), 0.12);
const againButton = makeButton('Again', 0.6, 0.22, () => go('setup'), 0.09);
const fullReportButton = makeButton('Full report', 0.6, 0.22, () => exitToPage('report'), 0.08);

const allButtons: Button[] = [
  ...venueButtons.map((x) => x.b),
  ...moodButtons.map((x) => x.b),
  ...lengthButtons.map((x) => x.b),
  beginButton,
  exitButton,
  endButton,
  againButton,
  fullReportButton,
];
gaze.buttons = allButtons;
scene.add(recenterSign.mesh, setupTitle.mesh, countdownPanel.mesh, hintPanel.mesh, vrReport.mesh, ...allButtons.map((b) => b.mesh));

/** Place menus for the current venue. Small rooms pull menus closer and shrink them to the same angular size. */
function layoutUI(): void {
  const eye = room.eye;
  const D = room.venue.uiDistance;
  const k = D / 2.6;
  const put = (o: THREE.Object3D, yaw: number, pitch: number, dist = D) => {
    placeInRoom(o, eye, dist, yaw, pitch);
    o.userData.baseScale = k;
    o.scale.setScalar(k);
  };
  put(recenterSign.mesh, 0, 4, D + 0.4);
  put(setupTitle.mesh, 0, 25);
  const row4 = [-22.5, -7.5, 7.5, 22.5];
  venueButtons.forEach(({ b }, i) => put(b.mesh, row4[i], 15));
  moodButtons.forEach(({ b }, i) => put(b.mesh, [-15, 0, 15][i], 5));
  lengthButtons.forEach(({ b }, i) => put(b.mesh, row4[i], -5));
  put(beginButton.mesh, 0, -16);
  put(exitButton.mesh, 0, -25);
  put(countdownPanel.mesh, 0, 8, D + 0.6);
  put(hintPanel.mesh, 0, 22, D + 0.6);
  put(endButton.mesh, 0, 30);
  put(vrReport.mesh, 0, 9, D + 0.3);
  put(againButton.mesh, -9, -17);
  put(fullReportButton.mesh, 9, -17);
}

function refreshSetupButtons(): void {
  venueButtons.forEach(({ id, b }) => b.setSelected(id === settings.venue));
  moodButtons.forEach(({ m, b }) => b.setSelected(m === settings.mood));
  lengthButtons.forEach(({ min, b }) => b.setSelected(min === settings.lengthMin));
}

// ---------- Audio ----------

let sound: SoundScape | null = null;
let mic: Mic | null = null;
const voice = new VoiceDetector(CONFIG.voice);
let voiceState: VoiceState = { speaking: false, silenceSeconds: 0, quiet: false, levelDb: -100 };
let micAcc = 0;
const calibration: number[] = [];

// ---------- Venue ----------

function setVenue(id: VenueId): void {
  if (room) {
    scene.remove(room.group, lighting.group, crowd.group);
    room.dispose();
    crowd.dispose();
  }
  room = buildRoom(VENUES[id]);
  lighting = buildLighting(room.venue);
  crowd = new Crowd(room.seats, room.eye, 7);
  crowd.attentionColors = settings.attentionColors;
  crowd.setMood(settings.mood);
  crowd.onSound = (i, kind) => {
    if (state === 'talk') sound?.[kind](i);
  };
  scene.add(room.group, lighting.group, crowd.group);
  rig.head.position.copy(room.eye); // rotation only: never changes during a run
  gaze.depthMeshes = [...room.depthMeshes, ...crowd.depthMeshes];
  room.readingAnchor.add(podiumPanel.mesh);
  sound?.setSeats(crowd.headPositions);
  layoutUI();
}

function changeSettings(patch: Partial<Settings>): void {
  const venueChanged = patch.venue !== undefined && patch.venue !== settings.venue;
  settings = { ...settings, ...patch };
  saveSettings(settings);
  launchSettings.set(settings);
  if (venueChanged) setVenue(settings.venue);
  crowd.setMood(settings.mood);
  crowd.attentionColors = settings.attentionColors;
  sound?.setEnabled(settings.sound);
  refreshSetupButtons();
}

// ---------- Input ----------

const orientation = new OrientationControl();
const look = new DesktopLook();
let useSensor = false;
let sensorTried = false;
let debug = forceDebug || !isTouch;

function recenter(): void {
  if (useSensor) orientation.recenter();
  else look.recenter();
}

let endConfirmLeft = 0;
attachTap(renderer.domElement, {
  onTap() {
    sound?.resume();
    if (gaze.tap()) return;
    if (state === 'recenter') {
      recenter();
      go('setup');
    } else if (state === 'talk') {
      endButton.mesh.visible = true;
      endConfirmLeft = CONFIG.talk.endConfirmSeconds;
    }
  },
  onHold: recenter,
  onDrag(dx, dy) {
    if (!useSensor) look.drag(dx, dy);
  },
});

let fast = false;
let fakeSpeaking = false;
let fakeVoiceActive = false;

window.addEventListener('keydown', (e) => {
  if (state === 'launch' || state === 'report' || e.repeat) return;
  switch (e.key.toLowerCase()) {
    case 's':
      rig.setStereo(!rig.stereo);
      break;
    case 'g':
      crowd.showCredit = !crowd.showCredit;
      cone.visible = crowd.showCredit;
      break;
    case 'i':
      crowd.showBars = !crowd.showBars;
      break;
    case 'p':
      hud.toggle();
      break;
    case 't':
      fast = !fast;
      break;
    case 'r':
      recenter();
      break;
    case ' ':
      fakeSpeaking = true;
      fakeVoiceActive = true;
      e.preventDefault();
      break;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') fakeSpeaking = false;
});

// ---------- Wake lock ----------

let wakeLock: WakeLockSentinel | null = null;
async function keepAwake(): Promise<void> {
  try {
    if (!wakeLock || wakeLock.released) wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    // Not supported or not allowed (e.g. not a Home Screen app on older iOS).
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state !== 'launch' && state !== 'report') {
    void keepAwake();
    sound?.resume();
  }
});

// ---------- 2D pages: launch / settings and the report ----------

const launchEl = document.getElementById('launch')!;
const reportEl = document.getElementById('report')!;
const reportBody = document.getElementById('report-body')!;
const statusEl = document.getElementById('status')!;
const startEl = document.getElementById('start') as HTMLButtonElement;
const lastReportEl = document.getElementById('last-report') as HTMLButtonElement;
const exitEl = document.getElementById('exit') as HTMLButtonElement;

const launchSettings = buildSettings(document.getElementById('settings')!, settings, (s) => {
  const venueChanged = s.venue !== settings.venue;
  settings = s;
  saveSettings(s);
  if (venueChanged) setVenue(s.venue);
  refreshInstallTip();
});

const installTipEl = document.getElementById('install-tip')!;
/** In a browser tab on a phone, Cardboard mode can't go full screen: say how to fix it. */
function refreshInstallTip(): void {
  installTipEl.hidden = !(isTouch && !isInstalled && !forceDebug && settings.view === 'cardboard');
}

function refreshLastReportButton(): void {
  lastReportEl.hidden = loadHistory().length === 0;
}

lastReportEl.addEventListener('click', () => {
  const d = loadLastSession();
  if (!d) return;
  showReport(d, computeMetrics(d), loadHistory().slice(1));
});

/**
 * Start (or restart) the VR part. Must run inside a tap: iOS grants motion
 * access and starts audio only from a user gesture, so ask before any await.
 */
function startVR(button: HTMLButtonElement): void {
  const wantSensor = !forceDebug && isTouch && !sensorTried;
  const motion = wantSensor ? requestMotionPermission() : Promise.resolve(useSensor);
  if (!sound) sound = new SoundScape(settings.mic);
  sound.resume();
  sound.setEnabled(settings.sound);
  sound.setSeats(crowd.headPositions);
  button.disabled = true;
  statusEl.textContent = 'Starting…';

  void motion.then(async (granted) => {
    if (wantSensor) {
      sensorTried = true;
      if (granted) {
        orientation.start();
        useSensor = await orientation.waitForData();
      }
      if (!useSensor) {
        debug = true;
        statusEl.textContent = 'No motion sensor access: drag to look around.';
      }
    }
    if (settings.mic && !mic) {
      try {
        mic = await Mic.open(sound!.ctx);
      } catch {
        statusEl.textContent = 'Microphone blocked: the room will ignore your voice this time.';
      }
    }
    button.disabled = false;
    enterVR();
  });
}

startEl.addEventListener('click', () => startVR(startEl));
exitEl.addEventListener('click', () => exitToPage('launch'));

function enterVR(): void {
  launchEl.hidden = true;
  reportEl.hidden = true;
  const cardboard = settings.view === 'cardboard';
  document.body.classList.add('vr');
  document.body.classList.toggle('cardboard', cardboard);
  rig.setIpd(settings.ipdMm / 1000);
  rig.setFov(settings.fovDeg, useSensor && !cardboard ? CONFIG.render.handheldFovDeg : CONFIG.render.monoFovDeg);
  rig.setStereo(useSensor && cardboard);
  exitEl.hidden = rig.stereo;
  helpEl.hidden = !debug;
  crowd.attentionColors = settings.attentionColors;
  crowd.setMood(settings.mood);
  if (settings.sound) sound?.startRoomTone();
  void keepAwake();
  go('recenter');
}

function exitToPage(page: 'launch' | 'report'): void {
  document.body.classList.remove('vr', 'cardboard');
  rig.setStereo(false);
  exitEl.hidden = true;
  helpEl.hidden = true;
  hidePanels();
  // Let the applause finish, then fade the room out behind the 2D page.
  window.setTimeout(() => {
    if (state === 'launch' || state === 'report') sound?.setEnabled(false);
  }, 2500);
  if (page === 'report' && lastRun) showReport(lastRun.data, lastRun.metrics, lastRun.previous);
  else {
    state = 'launch';
    statusEl.textContent = '';
    refreshLastReportButton();
    launchEl.hidden = false;
    reportEl.hidden = true;
  }
}

function showReport(d: SessionData, m: Metrics, previous: ReturnType<typeof loadHistory>): void {
  state = 'report';
  launchEl.hidden = true;
  reportEl.hidden = false;
  reportEl.scrollTop = 0;
  renderReport(reportBody, d, m, previous, {
    onAgain: () => startVR(reportBody.querySelector('#rp-again') as HTMLButtonElement),
    onSettings: () => exitToPage('launch'),
  });
}

// ---------- State machine ----------

let state: AppState = 'launch';
let countdownLeft = 0;
let talkElapsed = 0;
let talkLength = 0;
let downStretch = 0;
let recorder: Recorder | null = null;
let lastSeen: Partial<Record<Section, number>> = {};
let lastRun: { data: SessionData; metrics: Metrics; previous: ReturnType<typeof loadHistory> } | null = null;

function hidePanels(): void {
  for (const o of [recenterSign.mesh, setupTitle.mesh, countdownPanel.mesh, hintPanel.mesh, vrReport.mesh, ...allButtons.map((b) => b.mesh)]) {
    o.visible = false;
  }
}

function go(next: AppState): void {
  state = next;
  hidePanels();
  const show = (...objs: THREE.Object3D[]) => objs.forEach((o) => (o.visible = true));

  switch (next) {
    case 'recenter': {
      const handheld = settings.view === 'handheld' || !useSensor;
      recenterSign.draw([
        { text: useSensor ? (handheld ? 'Hold your phone up in front of you.' : 'Put your phone in the viewer.') : 'Debug mode', size: 0.08, color: '#aab3c5' },
        { text: room.venue.podium ? 'Look at the podium and tap' : 'Look at the panel and tap', size: 0.13, weight: 700 },
        { text: useSensor ? (handheld ? 'Tap the screen' : 'Press the viewer button') : 'Click to continue · drag to look', size: 0.075, color: '#aab3c5' },
      ]);
      show(recenterSign.mesh);
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      break;
    }
    case 'setup':
      crowd.reset();
      refreshSetupButtons();
      setupTitle.draw([{ text: 'Choose your room, audience, and time', size: 0.1, weight: 700 }]);
      show(setupTitle.mesh, beginButton.mesh, exitButton.mesh, ...venueButtons.map((x) => x.b.mesh), ...moodButtons.map((x) => x.b.mesh), ...lengthButtons.map((x) => x.b.mesh));
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      break;
    case 'countdown':
      crowd.setMood(settings.mood);
      crowd.reset();
      countdownLeft = CONFIG.talk.countdownSeconds;
      calibration.length = 0;
      show(countdownPanel.mesh);
      lighting.setHouseTarget(CONFIG.lighting.houseDim);
      break;
    case 'talk':
      talkElapsed = 0;
      talkLength = settings.lengthMin * 60;
      downStretch = 0;
      lastSeen = {};
      if (mic) voice.floorDb = noiseFloor(calibration, CONFIG.voice.floorMinDb);
      recorder = new Recorder({
        venue: room.venue.id,
        mood: settings.mood,
        lengthMin: settings.lengthMin,
        seats: room.seats.map((s) => ({ section: s.section, row: s.row, x: s.position.x, z: s.position.z })),
      });
      void keepAwake();
      break;
    case 'ended': {
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      if (!recorder) break;
      const data = recorder.finish(crowd.members.map((m) => m.interest));
      const metrics = computeMetrics(data);
      const previous = recordRun(data, metrics);
      lastRun = { data, metrics, previous };
      recorder = null;
      vrReport.paint((ctx, w, h, px) => paintVrReport(ctx, w, h, px, data, metrics, talkElapsed >= talkLength));
      show(vrReport.mesh, againButton.mesh, fullReportButton.mesh);
      if (settings.sound) sound?.applause(crowd.members.map((m) => m.state));
      break;
    }
  }
}

function drawPodium(): void {
  const lines: TextLine[] = [];
  if (state === 'talk') {
    const left = talkLength - talkElapsed;
    lines.push({ text: clock(left), size: 0.11, weight: 700, color: left < 30 ? '#ffb347' : '#fff' });
  } else {
    lines.push({ text: state === 'countdown' ? 'Get ready' : 'Podium', size: 0.07, weight: 700, color: '#aab3c5' });
  }
  if (mic) {
    const bars = Math.max(0, Math.min(10, Math.round((voiceState.levelDb - voice.floorDb) / 4)));
    lines.push({ text: `Mic ${'▮'.repeat(bars)}${'▯'.repeat(10 - bars)}`, size: 0.04, weight: 600, color: voiceState.speaking ? '#7ee2a8' : '#7d8597' });
  } else if (fakeVoiceActive) {
    lines.push({ text: fakeSpeaking ? 'Speaking (Space)' : 'Silent', size: 0.04, weight: 600, color: '#7d8597' });
  }
  lines.push({ text: `${room.venue.name} · ${MOODS[settings.mood].name}`, size: 0.035, weight: 400, color: '#7d8597' });
  podiumPanel.draw(lines);
}

/** One short coaching hint during the talk, most urgent first. */
function currentHint(v: VoiceInput): string {
  if (!settings.hints) return '';
  if (v.active && !v.speaking && v.silenceSeconds > CONFIG.hints.deadAirSeconds) return 'Keep talking: the room is waiting';
  if (v.active && v.quiet) return 'Speak up a little';
  if (downStretch > 4) return 'Look up at your audience';
  const single = room.venue.rows.length === 1;
  let worst: Section | null = null;
  let worstFor = 0;
  for (const sec of SECTIONS) {
    if (!room.seats.some((s) => s.section === sec)) continue;
    const since = talkElapsed - (lastSeen[sec] ?? 0);
    if (since > worstFor) {
      worst = sec;
      worstFor = since;
    }
  }
  if (worst && worstFor > CONFIG.hints.blindSpotSeconds) {
    return `Don't forget the ${sectionLabel(worst, single).toLowerCase()}${single ? ' side' : ''}`;
  }
  return '';
}

// ---------- Frame loop ----------

const forward = new THREE.Vector3();
let last = performance.now();
let simTime = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Nothing to draw behind a 2D page: save the battery.
  if (state === 'launch' || state === 'report') return;
  resize(); // cheap when nothing changed; catches late size updates after rotation
  const simDt = dt * (fast ? CONFIG.debug.timeScaleFast : 1);
  simTime += simDt;

  // 1. Head direction.
  if (useSensor) orientation.update(dt, rig.head.quaternion);
  else look.update(rig.head.quaternion);
  rig.head.updateMatrixWorld();
  sound?.setListener(room.eye, rig.head.quaternion);

  // 2. Gaze: buttons, dwell, reticle.
  gaze.update(dt, rig.head);
  forward.set(0, 0, -1).applyQuaternion(rig.head.quaternion);
  const credits = crowd.computeCredits(room.eye, forward);

  // Mic at 20 Hz (real time, not sped up).
  if (mic) {
    micAcc += dt;
    const step = 1 / CONFIG.voice.sampleHz;
    while (micAcc >= step) {
      micAcc -= step;
      const db = mic.levelDb();
      if (state === 'countdown') calibration.push(db);
      voiceState = voice.update(db, step);
    }
  }

  // 3. Talk clock, voice, looking down -> room decay factor.
  let roomFactor = 1;
  if (state === 'countdown') {
    countdownLeft -= simDt;
    countdownPanel.draw([
      { text: mic ? 'Stay quiet a moment…' : 'Get ready', size: 0.09, color: '#aab3c5' },
      { text: String(Math.max(1, Math.ceil(countdownLeft))), size: 0.48, weight: 700 },
      { text: `${room.venue.name} · ${MOODS[settings.mood].name} · ${settings.lengthMin} min`, size: 0.07, color: '#aab3c5' },
    ]);
    if (countdownLeft <= 0) go('talk');
  } else if (state === 'talk') {
    talkElapsed += simDt;
    const v: VoiceInput =
      fakeVoiceActive && (!mic || fakeSpeaking)
        ? { active: true, speaking: fakeSpeaking, silenceSeconds: fakeSpeaking ? 0 : voiceState.silenceSeconds + simDt, quiet: false }
        : { active: !!mic, speaking: voiceState.speaking, silenceSeconds: voiceState.silenceSeconds, quiet: voiceState.quiet };
    if (fakeVoiceActive && !mic) voiceState = { ...voiceState, speaking: v.speaking, silenceSeconds: v.silenceSeconds };

    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)));
    const yaw = THREE.MathUtils.radToDeg(yawOf(rig.head.quaternion));
    const down = pitch < CONFIG.gaze.downPitchDeg && Math.abs(yaw) < CONFIG.gaze.downYawHalfDeg;
    downStretch = down ? downStretch + simDt : 0;

    const A = CONFIG.attention;
    roomFactor = voiceFactor(v, A.voice) * notesFactor(downStretch, A.downGraceSeconds, A.downFactor);

    credits.forEach((c, i) => {
      if (c >= CONFIG.recorder.lookCredit) lastSeen[room.seats[i].section] = talkElapsed;
    });
    recorder?.update(simDt, credits, down, v.active ? v.speaking : null, crowd.averageInterest());

    const hint = currentHint(v);
    hintPanel.mesh.visible = hint !== '';
    if (hint) hintPanel.draw([{ text: hint, size: 0.085, weight: 600, color: '#ffe2a8' }]);

    if (endButton.mesh.visible) {
      endConfirmLeft -= dt;
      if (endConfirmLeft <= 0) endButton.mesh.visible = false;
    }
    if (talkElapsed >= talkLength) go('ended');
  }

  // 4. Attention + postures (attention only runs during the talk).
  crowd.update(simDt, simTime, roomFactor, state === 'talk');
  lighting.update(dt);
  room.update(new Date());
  drawPodium();

  // 6. Render.
  renderer.info.reset();
  rig.render(renderer, scene);

  if (debug) {
    helpEl.textContent =
      `${state} · ${room.venue.name} · ${settings.mood} · room ${(crowd.averageInterest() * 100).toFixed(0)}% · decay ×${roomFactor.toFixed(2)}` +
      `${fast ? ' · 4× time' : ''}${fakeSpeaking ? ' · speaking' : fakeVoiceActive ? ` · silent ${voiceState.silenceSeconds.toFixed(0)}s` : ''}\n` +
      'drag look · click tap · R recenter · S stereo · G gaze · I bars · P perf · Space speak · T 4×';
  }
  hud.update(dt, renderer, `state ${state} · ${crowd.members.length} people`);
}

setVenue(settings.venue);
hidePanels();
refreshLastReportButton();
refreshInstallTip();
renderer.setAnimationLoop(frame);

// Console hook for debug mode, so checks can be scripted: podium.look.yaw = 0.3, podium.go('talk').
if (debug) {
  Object.assign(window, {
    podium: {
      look,
      go,
      rig,
      changeSettings,
      get crowd() {
        return crowd;
      },
      get state() {
        return state;
      },
    },
  });
}
