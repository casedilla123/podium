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
Session 2 (Nov 2, 2026): class-demo build. Deliberately off the outline's day order.
- Venues (config.ts VENUES): Classroom 12, Lecture Hall 30, Auditorium 62, Interview panel 3 (seated, table).
- Settings (src/settings.ts, launch screen + in-VR gaze menu): venue, mood, length 1/2/3/5 min, mic,
  room sound, attention colours, coaching hints, Cardboard vs hand-held view, lens spacing, FOV.
- Mic: volume-only speaking detection (audio/voice.ts, tested), noise floor calibrated during the countdown.
- Sound: procedural 3D room tone, coughs, whispers, creaks, applause scaled by engagement (audio/sound.ts).
- Recorder + metrics (session/, tested) -> in-VR summary with seat map, 2D report page with heatmap,
  interest timeline, all metrics, comparison with last run. History in localStorage.
- Audience: arms, clothes or attention colours, phone in hand when checked out.
- Talk notes on the podium were removed on purpose (user: not needed yet). Podium shows timer + mic meter.
- Not yet: real glTF characters, lens distortion, speech-to-text pace, slides.
- Deployed: https://casedilla123.github.io/podium/ (push to main redeploys).
