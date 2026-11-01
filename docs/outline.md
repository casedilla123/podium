<!-- Extracted from 'Podium Cardboard VR Speaking Trainer — Build Outline.pdf'. Tables are flattened to text; the PDF is the source of truth for layout. -->

# Podium: Cardboard VR Speaking Trainer — Build Outline

Nov 1, 2026  ·  @Casey

## Concept and goals

Podium is a Google Cardboard app where you give a talk to a virtual audience that reacts
to where you look and how you sound, then get a report. It runs on an iPhone in a cheap
viewer: no headset, no controllers, no backend.
Who it's for: students rehearsing class presentations, interviews, or toasts.
What the class demo must show:
1. Immersion: a lit lecture hall that fuses into 3D in the viewer and follows your head
smoothly.
2. Live reactions: audience members you ignore visibly drift within about 20 seconds,
and the ones you look at perk up.
3. Real feedback: after a 2–3 minute talk, a report on eye-contact coverage, time spent
on notes, and pauses.
Done means:
A 5-minute session runs at a steady frame rate without the phone throttling.
A first-time user finishes a run without help from you.
Report numbers match a manual check with a stopwatch.

## Constraints and design principles

Podium is built for rotation-only tracking in iPhone Safari, so every feature runs on head
direction, a screen tap, and the microphone.
iPhone constraint What Podium does about it
Safari on iPhone has no WebXR (source) Renders the two eye views itself with
three.js

## Design principles

1. Head direction is the controller. Gaze picks menu items, and it is the main thing
measured during a talk.
2. Never move the camera on its own. It is the fastest way to make someone sick.
3. Big text, placed in the room. Panels float 2–3 m away, never pinned to the screen
edges.
4. Comfort beats fidelity. A steady frame rate wins over prettier lighting every time.
5. Desktop first. Every feature works in a desktop debug mode, so most bugs are caught
without the viewer.
6. Testable logic. Attention, audio, and scoring are pure functions with unit tests, so
Claude Code can check its own work.

## Tech stack and architecture

Podium is a static web app: three.js renders, Vite builds, TypeScript keeps it honest, and
there is no backend. Any free https host can serve it.
iPhone constraint What Podium does about it
Motion sensors need a user tap and an
https page
A Start button requests motion and mic
permission; the app is always served over
https
Pages can't go fullscreen on iPhone Safari
(source)
Runs as a Home Screen web app so browser
bars don't cut into the view
The screen sleeps when nobody touches it Requests a Screen Wake Lock, which works
in Home Screen web apps from iOS 18.4
(source)
Rotation only, no position You stand at the podium; the camera never
moves except with your head
Every frame renders twice Low-poly art, few lights, a strict draw-call
budget
Gaze and voice update every listener's interest each frame, and the recorder samples it
for the report. The stereo renderer, not shown, draws the scene from your head direction.
Podium architecture · 4 stages, 9 parts
Piece Choice Why
Rendering three.js, one pinned version Mature WebGL library that loads
glTF characters and animations
Language TypeScript Feels like Java; type errors catch
mistakes Claude can't see on the
phone
Dev server and
build
Vite Instant reloads; outputs plain
static files
Tests Vitest Runs attention, audio, and scoring
logic without a browser
Hosting GitHub Pages or Netlify Free https, redeploys on every git
push
Audio Web Audio API Mic level for speaking time,
pauses, and volume

## File layout

src/
  main.ts            boot, app state machine, render loop
  config.ts          every tuning number in one place
  input/
    orientation.ts   phone rotation -> camera, recenter
    desktopLook.ts   mouse-look for debug mode
    gaze.ts          center raycast, dwell timer, reticle
    tap.ts           screen tap / Cardboard button
  render/
    stereo.ts        two eye cameras, side-by-side viewports
    distortion.ts    lens-correction pass
  scene/
    room.ts          hall, stage, seats, podium
    lighting.ts
    assets.ts        glTF loading and caching
  audience/
    crowd.ts         spawns and updates all members
    member.ts        one person's states and animation
    attention.ts     pure interest model (unit tested)
  audio/
    mic.ts           level meter, noise calibration
    voice.ts         speaking vs. silence (unit tested)
    speech.ts        optional transcript and pace
  session/
    recorder.ts      logs gaze + audio 10x per second
    metrics.ts       samples -> report numbers (unit tested)
  ui/
    panels.ts        in-world text panels
    report.ts        in-VR summary + 2D report page
public/
  models/  sounds/  manifest.webmanifest

## Every frame, in order

1. Read the phone's rotation and set the camera.
Piece Choice Why
Speech-to-text
(optional)
Safari's
webkitSpeechRecognition
Words per minute; a stretch
feature
2. Raycast from the center of view to find the audience member or button you're looking
at.
3. Update the attention model with gaze and the latest audio state.
4. Update each member's state and animation.
5. Every 100 ms, log a sample for the report.
6. Render the left eye, then the right eye.

## User flow

A run takes about five minutes: one tap outside the viewer, one tap inside it, and
everything else happens by looking.
1. Launch screen (phone in hand). Podium opens from the Home Screen. You can paste
talk notes, which are saved on the phone. One Start button asks for motion and
microphone access, then says "Put your phone in the viewer."
2. Recenter. A floating sign says "Look at the podium and tap." The tap sets which way is
forward, so the audience always starts in front of you.
3. Setup by gaze. Floating buttons pick talk length (2, 3, or 5 minutes) and audience mood
(friendly, neutral, tough). Look at one for about a second to select it.
4. Mic check. "Stay quiet for 3 seconds" measures room noise, then "Say your first
sentence" sets your speaking level.
5. The talk. House lights dim, a countdown runs, and the audience settles. A timer and
your notes sit on the podium, and time spent looking down at them is tracked.
6. Ending. The timer runs out, or you tap. The applause is as loud as the room was
engaged at the end.
7. Report in VR. A large panel shows three or four headline numbers and a seat map of
where you looked.
8. Full report (phone out). The detailed 2D report is easier to read outside the viewer.
From there you restart or compare with earlier runs saved on the phone.

## The scene

The setting is a small lecture hall with about 30 seats on raked rows: warm light on the
stage, dimmer seats. One stylized low-poly art style keeps it fast and coherent.

## Layout

You stand behind a podium on a low stage, at 1.6 m eye height.
About 30 seats sit in 4 curved, stepped rows, so the back rows stay visible. They split
into 6 sections (left, center, right × front, back) for the report.
The audience spans roughly 120° in front of you, so covering the room takes real head
turns. That is the skill being trained.
A clock on the back wall and a projector screen behind you add realism and leave room
for a slides feature later.

## Art direction

Audience: 100 Avatars by Polygonal Mind is the best fit: 167 rigged CC0 humanoids in
glTF, with normal proportions and enough variety that neighbors don't repeat. For a
toy-like look instead, Kenney's Animated Characters (also CC0) match Kenney's
furniture packs.
Room: walls, stepped platforms, and seats built from simple shapes in code, with matte
materials and one palette.
Lighting: a warm key light on the stage, a soft ambient fill, and a dim house. Use at most
one shadow-casting light, plus dark blob shadows under seats.
Sound: quiet room tone, an occasional cough or chair creak, and applause, all
positioned in 3D. It adds a lot of presence for very little work.

## Animating a seated audience

Free character packs mostly ship game moves like walking and standing idles, so check
whether yours has seated clips. If it doesn't:
Plan A, procedural (recommended): pose the legs once into a seated pose, then drive
the spine, head, and arms in code: head turns toward you, slumping, nodding, a phone
in hand. Claude Code can build all of it, and it plugs straight into the attention model.
Plan B, Mixamo: upload a character to Mixamo, apply seated clips, download, and
convert FBX to GLB. Motion looks more natural, but it costs an hour or two of manual
asset work. Mixamo's license bars sharing the raw files (source), so keep them out of a
public repo.

## Performance budget

These are starting targets, not measurements; Day 4 tunes them on your phone.
Item Starting target
Frame rate 60 fps, never below 45 in a 5-minute run

## Audience system

Each audience member has an interest score from 0 to 1. It rises while you look at them
and decays while you don't, and the score decides how they behave.
The attention model ( attention.ts , a pure, unit-tested function)
Looked at: everyone within about 12° of the center of your view gets credit, strongest
at the center. Interest rises fast.
Ignored: interest decays slowly, at a rate set by the audience mood.
Neighbors: interest drifts toward the average of the people beside them, so boredom
spreads along a row the way it does in real rooms.
Your voice: silences over 4 seconds and very quiet speech speed up everyone's decay;
steady speaking slows it.
Notes: looking down at the podium for more than 5 seconds at a stretch speeds up
decay for the whole room.
Personality: each member gets a random multiplier between 0.7 and 1.3, so the room
never moves in sync.
One update step, run every frame:
I_{t+\Delta t} = \operatorname{clamp}_{[0,1]}\Big(I_t + \Delta t\,\big[\,g\,L 
- d\,m\,p\,v + k\,(\bar{N} - I_t)\,\big]\Big)
I is interest, L is gaze credit (0 to 1), g is gaze gain, d is base decay, m is the mood multiplier,
p is personality, v is the voice factor, k is neighbor pull, and N̄ is the neighbors' average.
Item Starting target
Draw calls per eye Under 100
Triangles in view Under 200k
Animated characters About 30; back rows update animation every other
frame
Textures Shared atlases, 1024 px max, compressed GLB files
Render resolution Pixel ratio capped at 1.5–2 instead of the phone's
full 3
Shadows One light at most
States, with a little overlap at each threshold so people don't flicker back and forth:

## Two effects that sell it

The "caught" moment: when you look at someone below 0.4, they snap upright within
half a second, as if caught. It's the most satisfying beat in the demo, so it deserves
extra polish.
Head tracking: engaged members turn their heads to follow you, within a natural range.
This one effect makes the room feel alive more than any animation clip.
Audience moods (starting values; drift times assume interest starts at 0.75, and Neutral
should match the 20-second goal)
Crowd manager ( crowd.ts ): seats members from a seat list, assigns each an avatar and
personality, and caches head positions for the gaze test. Ambient life (coughs, whispers,
shifting in seats) runs on random timers so the room feels lived-in even when everyone is
engaged.

## Input and interaction

Gaze and a single tap do everything: gaze points, the tap confirms, and no controller is
needed.
State Interest What they do
Engaged Above 0.7 Sit up, head follows you, occasional nod
Neutral 0.4–0.7 Relaxed idle, glance around now and then
Drifting 0.2–0.4 Slump, check the clock, whisper to a neighbor
Checked out Below 0.2 Head down at a phone, the occasional yawn
Mood Decay d (per
s)
Gaze gain g
(per s)
Neighbor pull
k
Ignored person starts
drifting after
Friendly 0.010 0.35 Low About 35 s
Neutral 0.0175 0.25 Medium About 20 s
Tough 0.030 0.18 High About 12 s
Orientation ( orientation.ts ): converts the phone's rotation angles into a camera
rotation, adjusted for landscape. three.js removed its DeviceOrientationControls
helper in r134 (source), so tell Claude up front to write this itself. Add light smoothing
and a recenter offset.
Reticle: a small dot in the center of each eye, drawn at the depth of whatever you're
looking at so it doesn't double up. It grows over anything selectable.
Dwell select: look at a button for 1.2 seconds while a ring fills around the reticle.
Looking away cancels it.
Tap: the Cardboard button presses the screen, which registers as a normal touch. A
tap selects whatever the reticle is on.
Ending a talk early: a tap during the talk shows a single "End talk?" button that you
confirm by gaze, so a bumped viewer can't end a run by accident.
Recenter: tap and hold for 1 second at any time. Phone rotation can drift sideways over
a few minutes, so this matters in longer runs.
Gaze during the talk is measured, never clicked. No buttons sit in the audience area
during a talk, so looking at people never triggers anything.
Head gestures (stretch): nod to confirm, shake to cancel.

## Speech and audio analysis

The core features use only the microphone's volume level, which is reliable on iPhone.
Speech-to-text for pace is an optional extra.

## Core pipeline (volume only)

1. Capture: the mic feeds a Web Audio analyser that measures loudness 20 times per
second.
2. Calibrate: 3 seconds of quiet sets the room's noise floor, and your first sentence sets
your speaking level.
3. Detect speech ( voice.ts , unit tested): you're speaking when loudness clears the
noise floor by a margin. The state holds for 300 ms after it drops, so gaps between
words don't count as pauses.
4. Derive signals:
Signal Rule Used for
Speaking time Share of the talk spent speaking Report

## Optional: pace from speech-to-text

Safari on iPhone supports speech recognition through webkitSpeechRecognition
from iOS 14.5, and it asks before sending audio to Apple's recognition service (source).
It also needs Siri enabled (source).
Words per minute = transcript words ÷ minutes spent speaking.
Test it early on Day 5. If it conflicts with the volume analysis on your phone, drop it;
nothing in the core depends on it.
Transcripts often clean out "um" and "uh," so filler-word counting stays a stretch goal.
Privacy: volume analysis stays on the phone, and no audio is recorded or saved. If speech-
to-text is on, the launch screen says that audio goes to Apple.

## Feedback report

The report turns ten samples per second into a few numbers a speaker can act on, led by
eye-contact coverage. Targets below are proposals to tune after your own test runs.
Signal Rule Used for
Strategic
pauses
Silences of 1–3 s Report, counted as a strength
Dead air Silences over 4 s Audience decay and report
Volume Average and steadiness vs. your
calibration
"Speak up" cue, audience decay,
and report
Metric How it's computed Starting target
Eye-contact
coverage
Share of members who got a look in each 30-
second window, averaged over the talk
Above 70%
Section balance Share of gaze time in each of the 6 sections No section under
10%
Longest blind spot Longest stretch any section went without a
look
Under 30 s
Notes time Share of the talk spent looking down at the
podium
Under 20%

## How it's shown

In VR: a large panel with three headline numbers (coverage, dead air, notes time), a
seat map colored by attention, and applause scaled to final room interest.
2D report page: the full table, the seat-map heatmap, and a line of average room
interest over the talk. Markers show where dead air or long note-reading happened, so
you can see what lost the room.
One coaching line: the weakest metric turned into plain advice, such as "The back-left
section went 48 seconds without a look."
History: each run's summary is saved on the phone, with a simple comparison to your
last run.
metrics.ts  is tested against synthetic sessions, such as "stare at the center the whole
time" (low coverage) and "sweep the room evenly" (high coverage).

## Cardboard specifics

Podium draws its own side-by-side stereo view and then corrects for the viewer's lenses.
Every lens setting is adjustable, because cheap viewers vary.

## Stereo rendering ( stereo.ts )

Two cameras sit left and right of your head position, half the lens spacing apart. Each
renders to its half of the screen.
Write this two-camera setup directly rather than leaning on add-ons. It's short and
gives full control over the lens settings.
Metric How it's computed Starting target
Longest stare Longest unbroken look at one person Under 5 s
Strategic pauses Silences of 1–3 s At least one per
minute
Dead air Silences over 4 s One or none
Speaking time Share of the talk spent speaking Above 80%
Final room interest Average interest at the end Above 0.6
Pace (optional) Words per minute from the transcript Set after testing
Lens spacing, field of view, and distortion strength live on one settings screen and are
saved on the phone.

## Lens correction ( distortion.ts )

Cardboard lenses bend the image, so each eye's view is pre-warped the opposite way
before it reaches the screen.
Each eye renders to an offscreen image, which is then drawn through a small shader
with two distortion strengths.
Tune it with a grid test pattern: adjust until straight lines look straight in the viewer.
Only your eyes can judge this.
Many cheap viewers look acceptable uncorrected, so this is Day 7 polish, not a blocker.
Official viewers carry a QR code with their lens data (source); reading it is a stretch
goal.

## Comfort details

A thin dark divider down the middle and a soft vignette at each lens edge.
Anything you'll read sits 2 m or more away; very close objects are hard to fuse.
When the phone struggles, lower the render resolution before letting the frame rate
drop.

## Permissions and staying awake

The Start button's tap handler requests motion access first and directly, before any
other awaited call. iPhone only grants it inside a tap.
Request the screen wake lock when the talk starts, and again whenever the app comes
back into view.
Phone checklist (repeat it on the launch screen)

## Desktop debug mode and testing

Most work happens on a laptop in debug mode, and the phone and viewer confirm each
milestone. Unit tests give Claude Code a way to check logic it can't see.
Opened from the Home Screen icon, so no browser bars
Portrait orientation lock off; the app needs landscape
Low Power Mode off, since it can throttle animation
Brightness up and Do Not Disturb on, so no notifications pop up in the viewer
Motion and microphone access allowed
Debug mode turns on automatically when there's no motion sensor, or with ?debug  in the
URL.

## Three test levels

1. Laptop, debug mode: where most bugs get found.
2. Phone in hand, single view: checks orientation and performance without the viewer.
3. Phone in the viewer: comfort, lens settings, and the real experience.

## Getting builds onto the phone

After each working step, push to git and let GitHub Pages or Netlify redeploy, then
reopen on the phone.
For quick loops, a tunnel such as ngrok or Cloudflare Tunnel gives your laptop's dev
server an https address.
To see errors on the phone, Safari's Web Inspector on a Mac connects over a cable.
Without a Mac, add a small on-screen log panel to debug builds.

## Checks Claude Code runs itself

Unit tests for attention.ts , voice.ts , and metrics.ts .
A type check and production build after every change.
Check you run at each milestone: 10 minutes in the viewer, watching for heat, frame
drops, and sideways drift.
Control What it does
Mouse drag Look around
Click Tap
S Toggle the stereo view
G Show the gaze cone and who is getting credit
I Show interest bars over every head
Space (hold) Fake speaking, to test audio rules without a mic
T Run time 4× faster to test decay quickly
P Performance overlay: frame rate, draw calls,
triangles

## Week build plan

The week front-loads the risky parts: the phone and stereo work by Day 2, and the
reacting audience by Day 3. Everything after that makes a working demo better.
If a day slips, cut lens correction and speech-to-text first. The reacting audience and the
report are the demo.
Day Build Done when (checked on the phone)
1 Project setup and CLAUDE.md; room
blocked out in simple shapes; desktop
mouse-look; deploy to an https host;
phone rotation drives the camera in a
single view
Turning in a circle with the phone looks
around the room smoothly in landscape
2 Stereo rendering; reticle and gaze
raycast; dwell select and tap; recenter;
launch screen with permissions; Home
Screen setup; wake lock
In the viewer the image fuses
comfortably, and a floating button can be
selected by gaze
3 Audience v1 with placeholder capsule
people; attention model and its tests;
states shown by color and posture;
debug overlays
On Neutral, an ignored row visibly
slumps within about 20 s, and people you
look at perk up
4 Art pass: real characters, seated poses,
head tracking, state poses, lighting,
props; tune to the performance budget
30 animated people hold the frame rate
through a 10-minute soak
5 Mic calibration, speech detection,
pauses, and dead air feeding the
audience; notes on the podium; try
speech-to-text
Going silent for 5 s makes the room
restless, and notes time is tracked
6 Session recorder; metrics and their tests;
in-VR summary; 2D report page; mood
presets; applause ending; run history
Report numbers match a stopwatch
check
7 Lens correction and viewer settings;
sound pass; bug fixes; test with 2–3
friends; record a demo video; freeze
features by midday
A first-time user finishes a run with no
help

## Claude Code setup

Give Claude Code two things before the first line of code: this outline, exported as
Markdown into the repo as docs/outline.md , and a CLAUDE.md like the one below.
# Podium: VR public-speaking trainer
Phone VR web app for Google Cardboard. You stand at a podium, a seated
audience reacts to where you look and how you sound, and a report follows.
Full plan: docs/outline.md
## Hard constraints
- Target: iPhone Safari, run as a Home Screen web app. iPhone has no
  WebXR, so we render stereo ourselves with two cameras.
- Phone rotation drives the camera. Write the orientation code in
  src/input/orientation.ts; three.js no longer ships 
DeviceOrientationControls.
- Request motion permission directly inside a tap handler. https only.
- Rotation only. Never move the camera except through head rotation.
- Every frame renders twice. Stay inside the budget in src/config.ts.
- No backend. All data stays on the phone.
## Stack
three.js (pinned version), TypeScript, Vite, Vitest. Deploy: GitHub Pages.
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
(Update at the end of each session: what works, what's next.)

## Session workflow

1. One feature per session. Start a fresh session for each; CLAUDE.md carries the
context.
2. Plan first for big pieces. For stereo, the attention model, and the report, have Claude
Code lay out its plan and read it before any code is written.
3. Commit every working step. Tag demo-ready versions ( demo-day3 ) so you can always
roll back to something that runs.
4. Report bugs in one shape: what you did, what you saw, what you expected, and which
test level (laptop, phone, viewer).
5. Close each session by asking Claude to update the Status section.
A first prompt for Day 1: "Read CLAUDE.md and docs/outline.md. Set up the project,
block out the lecture hall with simple shapes, add desktop mouse-look and phone-
rotation camera control in a single view, and add a GitHub Pages deploy script. Stop when
Day 1's 'done when' is ready for me to check on my phone."

## Risks and stretch goals

Every risk below has a fallback that still leaves a working demo, and most show up by Day
2.
Risk Early warning Fallback
Stereo doesn't fuse or
strains your eyes
Day 2 viewer test feels
off
Adjust lens spacing and field of
view; move panels farther away
Phone overheats or drops
frames
Frame rate sags in the
soak test
Lower resolution, drop shadows,
animate fewer rows, shorten
sessions
Browser bars cut into the
view
First viewer test Run from the Home Screen
Screen sleeps mid-talk Dims while untouched Wake lock; for demos, also set
Auto-Lock to Never
Sideways drift Audience slowly rotates
off-center
Recenter gesture, plus a recenter
on every menu
Seated poses look stiff Day 4 art pass Add breathing and small random
movements; Mixamo clips if time
allows

## Stretch goals, once the core works

Slides behind you: load images, advance with a tap, and track how often you turn
around to read them.
Q&A mode: an audience member raises a hand and asks a question you wrote in
advance, read aloud by the phone.
More rooms: job interview panel, wedding toast, seminar table.
Gaze replay: a top-down replay of where you looked during the talk.
Filler-word counter, if speech-to-text proves reliable.

## Sources

WebXR device support across platforms
WebKit bug 206854: Fullscreen API on iPhone
Screen Wake Lock support (Progressier)
three.js forum: DeviceOrientationControls removed in r134
Best free rigged 3D character models, 2026 (Cinevva)
Speech Recognition API browser support (TestMu AI)
iOS Safari SpeechRecognition troubleshooting (TechNetExperts)
Google Cardboard comes to iOS (Road to VR)
Risk Early warning Fallback
Speech-to-text fails or
fights the mic
Day 5 test Drop it; the volume-based
features cover the core
Asset hunting eats the
week
Day 4 starts with no
models
Keep the capsule people with
good lighting; the mechanic still
demos
