// Boot, app state machine, render loop.
//
// Every frame, in order:
//   1. Read the phone's rotation (or debug mouse-look) and set the head.
//   2. Raycast from the centre of view: buttons, reticle depth, dwell.
//   3. Gaze credit + voice + notes -> attention model.
//   4. Members' states and postures.
//   5. (Day 6) Every 100 ms, log a sample for the report.
//   6. Render the left eye, then the right eye.

import * as THREE from 'three';
import { CONFIG, type Mood } from './config';
import { Crowd } from './audience/crowd';
import { notesFactor, voiceFactor, type VoiceInput } from './audience/attention';
import { Hud } from './debug/hud';
import { DesktopLook } from './input/desktopLook';
import { Gaze } from './input/gaze';
import { OrientationControl, requestMotionPermission, yawOf } from './input/orientation';
import { attachTap } from './input/tap';
import { StereoRig } from './render/stereo';
import { buildLighting } from './scene/lighting';
import { buildRoom, EYE_Y } from './scene/room';
import { makeButton, placeInRoom, TextPanel, type Button } from './ui/panels';

type AppState = 'launch' | 'recenter' | 'setup' | 'countdown' | 'talk' | 'ended';

const NOTES_KEY = 'podium.notes';
const params = new URLSearchParams(location.search);
const forceDebug = params.has('debug');
const isTouch = navigator.maxTouchPoints > 0;

// ---------- Renderer and scene ----------

const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
renderer.info.autoReset = false; // two renders per frame; we reset once per frame
container.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const room = buildRoom();
const lighting = buildLighting();
const crowd = new Crowd(room.seats, 7);
const rig = new StereoRig();
rig.head.position.set(0, EYE_Y, 0); // rotation only: this never changes
scene.add(room.group, lighting.group, crowd.group, rig.head);

const gaze = new Gaze();
gaze.depthMeshes = [...room.depthMeshes, ...crowd.depthMeshes];
scene.add(gaze.reticle);

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

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  rig.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------- In-world UI ----------

const eye = rig.head.position.clone();
const panelStyle = { background: 'rgba(16,19,28,0.86)', border: 'rgba(255,255,255,0.18)', radius: 0.06 };

const recenterSign = new TextPanel(2.0, 0.75, panelStyle);
placeInRoom(recenterSign.mesh, eye, 3.2, 0, 4);

const setupTitle = new TextPanel(1.9, 0.34);
setupTitle.draw([{ text: 'Set up your talk', size: 0.13, weight: 700 }]);
placeInRoom(setupTitle.mesh, eye, 2.8, 0, 19);

let talkMinutes: number = CONFIG.talk.lengthsMin[1];
let mood: Mood = 'neutral';

const BTN_W = 0.56;
const BTN_H = 0.22;
const COLS = [-14, 0, 14];
const lengthButtons = CONFIG.talk.lengthsMin.map((min, i) => {
  const b = makeButton(`${min} min`, BTN_W, BTN_H, () => {
    talkMinutes = min;
    refreshSetup();
  });
  placeInRoom(b.mesh, eye, 2.6, COLS[i], 8);
  return { b, min };
});
const moodButtons = (['friendly', 'neutral', 'tough'] as const).map((m, i) => {
  const b = makeButton(m[0].toUpperCase() + m.slice(1), BTN_W, BTN_H, () => {
    mood = m;
    refreshSetup();
  });
  placeInRoom(b.mesh, eye, 2.6, COLS[i], -2);
  return { b, m };
});
const beginButton = makeButton('Begin', 0.7, 0.24, () => go('countdown'), 0.12);
placeInRoom(beginButton.mesh, eye, 2.6, 0, -13);

function refreshSetup(): void {
  lengthButtons.forEach(({ b, min }) => b.setSelected(min === talkMinutes));
  moodButtons.forEach(({ b, m }) => b.setSelected(m === mood));
}
refreshSetup();

const countdownPanel = new TextPanel(1.2, 0.9);
placeInRoom(countdownPanel.mesh, eye, 3.5, 0, 10);

// Above the audience so looking at people never triggers it.
const endButton = makeButton('End talk?', 0.8, 0.26, () => go('ended'), 0.12);
placeInRoom(endButton.mesh, eye, 2.6, 0, 28);

const summaryPanel = new TextPanel(2.2, 1.25, panelStyle);
placeInRoom(summaryPanel.mesh, eye, 3.0, 0, 9);
const againButton = makeButton('Again', 0.6, 0.22, () => go('setup'));
placeInRoom(againButton.mesh, eye, 2.6, 0, -11);

// Timer and notes on the slanted podium top.
const podiumPanel = new TextPanel(0.74, 0.46, { background: 'rgba(12,14,20,0.92)', radius: 0.02, align: 'left', padding: 0.03 });
room.podiumTop.add(podiumPanel.mesh);

const allButtons: Button[] = [
  ...lengthButtons.map((x) => x.b),
  ...moodButtons.map((x) => x.b),
  beginButton,
  endButton,
  againButton,
];
gaze.buttons = allButtons;
scene.add(
  recenterSign.mesh,
  setupTitle.mesh,
  countdownPanel.mesh,
  summaryPanel.mesh,
  ...allButtons.map((b) => b.mesh),
);

// ---------- Input ----------

const orientation = new OrientationControl();
const look = new DesktopLook();
let useSensor = false;
let debug = forceDebug || !isTouch;

function recenter(): void {
  if (useSensor) orientation.recenter();
  else look.recenter();
}

attachTap(renderer.domElement, {
  onTap() {
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
  if (state === 'launch' || e.repeat) return;
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
  if (document.visibilityState === 'visible' && state !== 'launch') void keepAwake();
});

// ---------- Launch screen ----------

const launchEl = document.getElementById('launch')!;
const notesEl = document.getElementById('notes') as HTMLTextAreaElement;
const statusEl = document.getElementById('status')!;
const startEl = document.getElementById('start') as HTMLButtonElement;

try {
  notesEl.value = localStorage.getItem(NOTES_KEY) ?? '';
} catch {
  // Storage blocked: notes just won't persist.
}
notesEl.addEventListener('input', () => {
  try {
    localStorage.setItem(NOTES_KEY, notesEl.value);
  } catch {
    // ignore
  }
});

startEl.addEventListener('click', () => {
  // iOS grants motion access only inside the tap: ask first, before any await.
  const motion = forceDebug || !isTouch ? Promise.resolve(false) : requestMotionPermission();
  startEl.disabled = true;
  statusEl.textContent = 'Starting…';
  void motion.then(async (granted) => {
    if (granted) {
      orientation.start();
      useSensor = await orientation.waitForData();
    }
    if (!useSensor) {
      debug = true;
      if (isTouch && !forceDebug) statusEl.textContent = 'No motion sensor access: drag to look around.';
    }
    if (useSensor) orientation.recenter();
    enterVR();
  });
});

function enterVR(): void {
  launchEl.hidden = true;
  document.body.classList.add('vr');
  rig.setStereo(useSensor);
  helpEl.hidden = !debug;
  void keepAwake();
  go('recenter');
}

// ---------- State machine ----------

let state: AppState = 'launch';
let countdownLeft = 0;
let talkElapsed = 0;
let talkLength = 0;
let endConfirmLeft = 0;
let silenceSeconds = 0;
let notesStretch = 0;
let notesTotal = 0;

function go(next: AppState): void {
  state = next;
  const show = (on: boolean, ...objs: { visible: boolean }[]) => objs.forEach((o) => (o.visible = on));

  show(next === 'recenter', recenterSign.mesh);
  show(next === 'setup', setupTitle.mesh, beginButton.mesh, ...lengthButtons.map((x) => x.b.mesh), ...moodButtons.map((x) => x.b.mesh));
  show(next === 'countdown', countdownPanel.mesh);
  show(false, endButton.mesh);
  show(next === 'ended', summaryPanel.mesh, againButton.mesh);

  switch (next) {
    case 'recenter':
      recenterSign.draw([
        { text: useSensor ? 'Put your phone in the viewer.' : 'Debug mode', size: 0.08, color: '#aab3c5' },
        { text: 'Look at the podium and tap', size: 0.13, weight: 700 },
        { text: useSensor ? 'Press the viewer button' : 'Click to continue · drag to look', size: 0.075, color: '#aab3c5' },
      ]);
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      break;
    case 'setup':
      crowd.reset();
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      break;
    case 'countdown':
      crowd.setMood(mood);
      crowd.reset();
      countdownLeft = CONFIG.talk.countdownSeconds;
      lighting.setHouseTarget(CONFIG.lighting.houseDim);
      break;
    case 'talk':
      talkElapsed = 0;
      talkLength = talkMinutes * 60;
      silenceSeconds = 0;
      notesStretch = 0;
      notesTotal = 0;
      void keepAwake();
      break;
    case 'ended': {
      lighting.setHouseTarget(CONFIG.lighting.houseUp);
      const avg = crowd.averageInterest();
      const notesPct = talkElapsed > 0 ? (100 * notesTotal) / talkElapsed : 0;
      summaryPanel.draw([
        { text: talkElapsed >= talkLength ? "Time's up" : 'Talk ended', size: 0.14, weight: 700 },
        { text: `${formatTime(talkElapsed)} spoken to a ${mood} room`, size: 0.075, color: '#aab3c5' },
        { text: ' ', size: 0.04 },
        { text: `Room interest at the end: ${Math.round(avg * 100)}%`, size: 0.09 },
        { text: `Still engaged: ${crowd.countIn('engaged')} of ${crowd.members.length}`, size: 0.09 },
        { text: `Time on notes: ${Math.round(notesPct)}%`, size: 0.09 },
        { text: ' ', size: 0.04 },
        { text: 'Full report arrives on Day 6', size: 0.06, color: '#7d8597' },
      ]);
      break;
    }
  }
}

function formatTime(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function drawPodium(): void {
  const notes = notesEl.value.trim();
  const head =
    state === 'talk'
      ? { text: formatTime(talkLength - talkElapsed), size: 0.085, weight: 700 as const, color: talkLength - talkElapsed < 30 ? '#ffb347' : '#fff' }
      : { text: state === 'countdown' ? 'Get ready' : 'Podium', size: 0.06, weight: 700 as const, color: '#aab3c5' };
  podiumPanel.draw([head, { text: notes || 'No notes. Add some on the launch screen.', size: 0.034, weight: 400, color: '#d6dae3' }]);
}

// ---------- Frame loop ----------

const forward = new THREE.Vector3();
let last = performance.now();
let simTime = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const simDt = dt * (fast ? CONFIG.debug.timeScaleFast : 1);
  simTime += simDt;

  // 1. Head direction.
  if (useSensor) orientation.update(dt, rig.head.quaternion);
  else look.update(rig.head.quaternion);
  rig.head.updateMatrixWorld();

  // 2. Gaze: buttons, dwell, reticle. Hidden while on the launch screen.
  gaze.reticle.visible = state !== 'launch';
  gaze.update(dt, rig.head);
  forward.set(0, 0, -1).applyQuaternion(rig.head.quaternion);
  crowd.computeCredits(eye, forward);

  // 3. Talk clock, voice, notes -> room decay factor.
  let roomFactor = 1;
  if (state === 'countdown') {
    countdownLeft -= simDt;
    countdownPanel.draw([{ text: String(Math.max(1, Math.ceil(countdownLeft))), size: 0.6, weight: 700 }]);
    if (countdownLeft <= 0) go('talk');
  } else if (state === 'talk') {
    talkElapsed += simDt;
    silenceSeconds = fakeSpeaking ? 0 : silenceSeconds + simDt;
    const voice: VoiceInput = { active: fakeVoiceActive, speaking: fakeSpeaking, silenceSeconds, quiet: false };

    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)));
    const yaw = THREE.MathUtils.radToDeg(yawOf(rig.head.quaternion));
    const onNotes = pitch < CONFIG.gaze.notesPitchDeg && Math.abs(yaw) < CONFIG.gaze.notesYawHalfDeg;
    notesStretch = onNotes ? notesStretch + simDt : 0;
    if (onNotes) notesTotal += simDt;

    const A = CONFIG.attention;
    roomFactor = voiceFactor(voice, A.voice) * notesFactor(notesStretch, A.notesGraceSeconds, A.notesFactor);

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
      `${state} · ${mood} · room ${(crowd.averageInterest() * 100).toFixed(0)}% · decay ×${roomFactor.toFixed(2)}` +
      `${fast ? ' · 4× time' : ''}${fakeSpeaking ? ' · speaking' : fakeVoiceActive ? ` · silent ${silenceSeconds.toFixed(0)}s` : ''}\n` +
      'drag look · click tap · R recenter · S stereo · G gaze · I bars · P perf · Space speak · T 4×';
  }
  hud.update(dt, renderer, `state ${state}`);
}

go('launch');
renderer.setAnimationLoop(frame);

// Console hook for debug mode, so checks can be scripted: podium.look.yaw = 0.3, podium.go('talk').
if (debug) Object.assign(window, { podium: { look, crowd, go, rig, get state() { return state; } } });
