# Podium: VR public-speaking trainer

Phone VR web app for Google Cardboard. You stand at a podium, a seated
audience reacts to where you look and how you sound, and a report follows.
Full plan: docs/outline.md

## Hard constraints
- Target: iPhone Safari, run as a Home Screen web app. iPhone has no
  WebXR, so we render stereo ourselves with two cameras.
- Phone rotation drives the camera. Write the orientation code in
  src/input/orientation.ts; three.js no longer ships DeviceOrientationControls.
- Request motion permission directly inside a tap handler. https only.
- Rotation only. Never move the camera except through head rotation.
- Every frame renders twice. Stay inside the budget in src/config.ts.
- No backend. All data stays on the phone.

## Stack
three.js (pinned 0.187.0), TypeScript, Vite, Vitest. Deploy: GitHub Pages
via .github/workflows/deploy.yml (push to main builds, tests, and deploys).

## Commands
npm run dev | npm test | npm run build | npm run deploy

## Rules
- Small steps. After each change: type check, run tests, build.
- All tuning numbers live in src/config.ts.
- Attention, voice, and metrics logic are pure functions with unit tests.
- Every feature must work in desktop debug mode (?debug).
- Ask before adding any dependency.
- I test on a real phone and report what I see. If a bug report is
  unclear, ask me one question instead of guessing.

## Status
Session 1 (Nov 1, 2026): Days 1-3 scaffold.
- Works: project setup, lecture hall from simple shapes, desktop mouse-look,
  phone-rotation camera with recenter, side-by-side stereo, reticle + gaze
  raycast + dwell select + tap, launch screen with motion permission, wake
  lock, Home Screen manifest, 30 instanced capsule audience members driven
  by the unit-tested attention model, state colors/postures, "caught" snap,
  debug overlays (S G I Space T P R), talk flow with timer and End-talk confirm.
- Not yet: mic (Day 5), recorder/metrics/report (Day 6), real characters (Day 4),
  lens distortion (Day 7), sounds, app icon PNG.
- Next: check Day 1-2 "done when" on the phone, then Day 4 art pass.
