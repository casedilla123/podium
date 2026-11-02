// Settings on the launch screen: audience, options, and viewer fit. Built from
// config so new venues show up automatically.

import { CONFIG, MOODS, VENUES, type Mood, type VenueId } from '../config';
import { DEFAULT_SETTINGS, type Settings, type ViewMode } from '../settings';

type Change = (s: Settings) => void;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildSettings(root: HTMLElement, initial: Settings, onChange: Change): { set(s: Settings): void } {
  let s = { ...initial };

  const toggles: { key: 'mic' | 'sound' | 'attentionColors' | 'hints'; title: string; text: string }[] = [
    { key: 'mic', title: 'Microphone', text: 'The room reacts to your voice. Volume only; nothing is recorded.' },
    { key: 'sound', title: 'Room sound', text: 'Murmur, coughs, and applause at the end.' },
    { key: 'attentionColors', title: 'Attention colours', text: 'Green engaged, grey neutral, amber drifting, red checked out.' },
    { key: 'hints', title: 'Coaching hints', text: 'Small reminders in the room, like a forgotten section.' },
  ];

  root.innerHTML = `
    <section class="card">
      <h2>Audience</h2>
      <div class="field">
        <div class="field-label">Room</div>
        <div class="venues" role="radiogroup" aria-label="Room">
          ${Object.values(VENUES)
            .map(
              (v) =>
                `<button type="button" class="venue" role="radio" data-venue="${v.id}"><strong>${esc(v.name)}</strong><span>${esc(v.blurb)}</span></button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Mood <small id="mood-blurb"></small></div>
        <div class="seg" role="radiogroup" aria-label="Audience mood">
          ${(Object.keys(MOODS) as Mood[]).map((m) => `<button type="button" role="radio" data-mood="${m}">${MOODS[m].name}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Talk length</div>
        <div class="seg" role="radiogroup" aria-label="Talk length">
          ${CONFIG.talk.lengthsMin.map((l) => `<button type="button" role="radio" data-length="${l}">${l} min</button>`).join('')}
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Options</h2>
      ${toggles
        .map(
          (t) => `<label class="toggle"><div><strong>${t.title}</strong><span>${t.text}</span></div>
            <span class="switch"><input type="checkbox" role="switch" data-toggle="${t.key}"><i></i></span></label>`,
        )
        .join('')}
    </section>

    <section class="card">
      <h2>Viewer</h2>
      <div class="field">
        <div class="seg" role="radiogroup" aria-label="View mode">
          <button type="button" role="radio" data-view="cardboard">Cardboard viewer</button>
          <button type="button" role="radio" data-view="handheld">Hand-held</button>
        </div>
        <p class="hint" id="view-hint"></p>
      </div>
      <div id="lens-fields">
        <div class="field">
          <label class="field-label" for="ipd">Lens spacing <output id="ipd-out"></output></label>
          <input type="range" id="ipd" min="${CONFIG.stereo.ipdMinMm}" max="${CONFIG.stereo.ipdMaxMm}" step="1">
        </div>
        <div class="field">
          <label class="field-label" for="fov">Field of view <output id="fov-out"></output></label>
          <input type="range" id="fov" min="${CONFIG.stereo.eyeFovMinDeg}" max="${CONFIG.stereo.eyeFovMaxDeg}" step="1">
          <p class="hint">If the two images won't merge, change lens spacing. If the room looks stretched or tiny, change field of view. <button type="button" id="lens-reset" class="linkish">Reset</button></p>
        </div>
      </div>
    </section>`;

  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const ipd = q<HTMLInputElement>('#ipd');
  const fov = q<HTMLInputElement>('#fov');

  const render = () => {
    root.querySelectorAll<HTMLElement>('[data-venue]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.venue === s.venue)));
    root.querySelectorAll<HTMLElement>('[data-mood]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mood === s.mood)));
    root.querySelectorAll<HTMLElement>('[data-length]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.length) === s.lengthMin)));
    root.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === s.view)));
    root.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((i) => (i.checked = s[i.dataset.toggle as keyof Settings] as boolean));
    q('#mood-blurb').textContent = MOODS[s.mood].blurb;
    q('#view-hint').textContent =
      s.view === 'cardboard'
        ? 'Side-by-side view for a Google Cardboard viewer. Turn your head to look around.'
        : 'One full-screen view. Hold the phone up and move it to look around: handy for showing others.';
    q<HTMLElement>('#lens-fields').hidden = s.view !== 'cardboard';
    ipd.value = String(s.ipdMm);
    fov.value = String(s.fovDeg);
    q('#ipd-out').textContent = `${s.ipdMm} mm`;
    q('#fov-out').textContent = `${s.fovDeg}°`;
  };

  const update = (patch: Partial<Settings>) => {
    s = { ...s, ...patch };
    render();
    onChange(s);
  };

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-venue],[data-mood],[data-length],[data-view],#lens-reset');
    if (!el) return;
    if (el.dataset.venue) update({ venue: el.dataset.venue as VenueId });
    else if (el.dataset.mood) update({ mood: el.dataset.mood as Mood });
    else if (el.dataset.length) update({ lengthMin: Number(el.dataset.length) });
    else if (el.dataset.view) update({ view: el.dataset.view as ViewMode });
    else if (el.id === 'lens-reset') update({ ipdMm: DEFAULT_SETTINGS.ipdMm, fovDeg: DEFAULT_SETTINGS.fovDeg });
  });
  root.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.toggle) update({ [el.dataset.toggle]: el.checked } as Partial<Settings>);
  });
  ipd.addEventListener('input', () => update({ ipdMm: Number(ipd.value) }));
  fov.addEventListener('input', () => update({ fovDeg: Number(fov.value) }));

  render();
  return {
    set(next) {
      s = { ...next };
      render();
    },
  };
}
