// The full 2D report, read with the phone out of the viewer: headline tiles,
// a seat-map heatmap, room interest over time, every metric, and a comparison
// with the last run.

import { CONFIG, MOODS, VENUES } from '../config';
import { sectionLabel } from '../scene/room';
import type { RunSummary } from '../session/history';
import type { Metrics } from '../session/metrics';
import type { SessionData } from '../session/recorder';
import { drawSeatMap, SEQ_DARK, type SeatDot } from './seatMap';

export interface ReportActions {
  onAgain(): void;
  onSettings(): void;
}

const T = CONFIG.report.targets;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (x: number) => `${Math.round(x)} s`;
export const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function status(ok: boolean): string {
  return ok
    ? '<span class="chip good"><span aria-hidden="true">✓</span> On target</span>'
    : '<span class="chip warn"><span aria-hidden="true">!</span> Work on this</span>';
}

interface Row {
  name: string;
  you: string;
  target: string;
  ok: boolean | null;
}

function rows(m: Metrics, singleRow: boolean): Row[] {
  const r: Row[] = [
    { name: 'Eye-contact coverage', you: pct(m.coverage), target: `≥ ${pct(T.coverage)}`, ok: m.coverage >= T.coverage },
  ];
  if (m.weakestSection && !singleRow) {
    r.push({
      name: `Section balance (weakest: ${sectionLabel(m.weakestSection.section, singleRow).toLowerCase()})`,
      you: pct(m.weakestSection.share),
      target: `≥ ${pct(T.sectionMinShare)}`,
      ok: m.weakestSection.share >= T.sectionMinShare,
    });
  }
  if (m.blindSpot) {
    r.push({
      name: `Longest blind spot (${sectionLabel(m.blindSpot.section, singleRow).toLowerCase()})`,
      you: secs(m.blindSpot.seconds),
      target: `< ${T.blindSpotSeconds} s`,
      ok: m.blindSpot.seconds < T.blindSpotSeconds,
    });
  }
  r.push(
    { name: 'Looking down', you: pct(m.downShare), target: `< ${pct(T.downShare)}`, ok: m.downShare < T.downShare },
    { name: 'Longest stare at one person', you: secs(m.longestStareSeconds), target: `< ${T.longestStareSeconds} s`, ok: m.longestStareSeconds < T.longestStareSeconds },
  );
  if (m.voice) {
    r.push(
      { name: 'Strategic pauses (1–3 s)', you: `${m.voice.pauses} (${m.voice.pausesPerMinute.toFixed(1)}/min)`, target: `≥ ${T.pausesPerMinute}/min`, ok: m.voice.pausesPerMinute >= T.pausesPerMinute },
      { name: 'Dead air (over 4 s)', you: String(m.voice.deadAir), target: `≤ ${T.deadAirMax}`, ok: m.voice.deadAir <= T.deadAirMax },
      { name: 'Speaking time', you: pct(m.voice.speakingShare), target: `> ${pct(T.speakingShare)}`, ok: m.voice.speakingShare > T.speakingShare },
    );
  } else {
    r.push({ name: 'Pauses, dead air, speaking time', you: 'Mic off', target: '—', ok: null });
  }
  r.push(
    { name: 'Room interest at the end', you: pct(m.finalInterest), target: `> ${pct(T.finalInterest)}`, ok: m.finalInterest > T.finalInterest },
    { name: 'Still engaged at the end', you: `${m.engagedAtEnd} of ${m.memberCount}`, target: '—', ok: null },
  );
  return r;
}

let observer: ResizeObserver | null = null;

export function renderReport(root: HTMLElement, d: SessionData, m: Metrics, previous: RunSummary[], actions: ReportActions): void {
  const venue = VENUES[d.venue];
  const singleRow = venue.rows.length === 1;
  const when = new Date(d.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const headline =
    m.finalInterest > T.finalInterest && m.coverage >= T.coverage ? 'You kept the room' : m.finalInterest > 0.4 ? 'Solid start' : 'The room drifted';

  const thirdTile = m.voice
    ? { label: 'Dead air', value: String(m.voice.deadAir), target: `Target ≤ ${T.deadAirMax}`, ok: m.voice.deadAir <= T.deadAirMax }
    : {
        label: 'Longest blind spot',
        value: secs(m.blindSpot?.seconds ?? 0),
        target: `Target < ${T.blindSpotSeconds} s`,
        ok: (m.blindSpot?.seconds ?? 0) < T.blindSpotSeconds,
      };
  const tiles = [
    { label: 'Eye contact', value: pct(m.coverage), target: `Target ≥ ${pct(T.coverage)}`, ok: m.coverage >= T.coverage },
    { label: 'Looking down', value: pct(m.downShare), target: `Target < ${pct(T.downShare)}`, ok: m.downShare < T.downShare },
    thirdTile,
    { label: 'Room at the end', value: pct(m.finalInterest), target: `Target > ${pct(T.finalInterest)}`, ok: m.finalInterest > T.finalInterest },
  ];

  const last = previous[0];
  const compare = last
    ? [
        { name: 'Eye contact', now: m.coverage, before: last.coverage, higherBetter: true, fmt: pct },
        { name: 'Looking down', now: m.downShare, before: last.downShare, higherBetter: false, fmt: pct },
        { name: 'Room at the end', now: m.finalInterest, before: last.finalInterest, higherBetter: true, fmt: pct },
      ]
    : [];

  root.innerHTML = `
    <div class="rp">
      <header>
        <p class="eyebrow">Podium report</p>
        <h1>${headline}</h1>
        <p class="meta">${esc(venue.name)} · ${MOODS[d.mood].name} audience · ${clock(m.durationSeconds)} · ${esc(when)}</p>
      </header>

      <p class="coach"><strong>Coach's note</strong>${esc(m.coaching)}</p>

      <section class="tiles">
        ${tiles
          .map(
            (t) => `<div class="tile"><div class="tile-label">${t.label}</div><div class="tile-value">${t.value}</div>
              <div class="tile-foot"><span>${t.target}</span>${status(t.ok)}</div></div>`,
          )
          .join('')}
      </section>

      <section class="card">
        <h2>Where you looked</h2>
        <p class="sub">Each dot is one person, seen from above. Brighter means more of your eye contact.</p>
        <div class="chart-wrap"><canvas id="rp-map" role="img" aria-label="Seat map of eye contact"></canvas><div class="tip" id="rp-map-tip" hidden></div></div>
        <div class="legend">
          <span class="li"><span class="ramp">${SEQ_DARK.map((c) => `<i style="background:${c}"></i>`).join('')}</span>Less → more look time</span>
          <span class="li"><span class="hollow"></span>No eye contact</span>
        </div>
      </section>

      <section class="card">
        <h2>Room interest over the talk</h2>
        <p class="sub">Average interest across the audience. Shaded stretches show what lost them.</p>
        <div class="chart-wrap"><svg id="rp-line" role="img" aria-label="Line chart of room interest over time"></svg><div class="tip" id="rp-line-tip" hidden></div></div>
        <div class="legend">
          <span class="li"><span class="swatch dead"></span>Dead air</span>
          <span class="li"><span class="swatch down"></span>Looking down</span>
        </div>
      </section>

      <section class="card">
        <h2>All the numbers</h2>
        <table>
          <thead><tr><th>Metric</th><th>You</th><th>Target</th></tr></thead>
          <tbody>${rows(m, singleRow)
            .map(
              (r) =>
                `<tr><td>${esc(r.name)}</td><td class="num">${esc(r.you)}${r.ok === null ? '' : r.ok ? ' <span class="ok" aria-label="on target">✓</span>' : ' <span class="bad" aria-label="below target">!</span>'}</td><td class="num muted">${esc(r.target)}</td></tr>`,
            )
            .join('')}</tbody>
        </table>
      </section>

      ${
        last
          ? `<section class="card">
        <h2>Compared with your last run</h2>
        <p class="sub">${esc(VENUES[last.venue].name)} · ${MOODS[last.mood].name} · ${new Date(last.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
        <table><tbody>${compare
          .map((c) => {
            const diff = c.now - c.before;
            const better = Math.abs(diff) < 0.005 ? null : diff > 0 === c.higherBetter;
            const word = better === null ? 'Same' : better ? 'Better' : 'Worse';
            const arrow = diff > 0.005 ? '▲' : diff < -0.005 ? '▼' : '–';
            return `<tr><td>${c.name}</td><td class="num muted">${c.fmt(c.before)} → </td><td class="num">${c.fmt(c.now)} <span class="${better === null ? 'muted' : better ? 'ok' : 'bad'}">${arrow} ${word}</span></td></tr>`;
          })
          .join('')}</tbody></table>
      </section>`
          : ''
      }

      <div class="actions">
        <button type="button" class="primary" id="rp-again">Run again</button>
        <button type="button" id="rp-settings">Change settings</button>
      </div>
    </div>`;

  root.querySelector('#rp-again')!.addEventListener('click', actions.onAgain);
  root.querySelector('#rp-settings')!.addEventListener('click', actions.onSettings);

  const draw = () => {
    drawMap(root, d, m, singleRow);
    drawLine(root, m);
  };
  draw();
  // Redraw on rotation / resize while the report is open.
  observer?.disconnect();
  observer = new ResizeObserver(() => draw());
  observer.observe(root.querySelector('.rp')!);
}

function drawMap(root: HTMLElement, d: SessionData, m: Metrics, singleRow: boolean): void {
  const canvas = root.querySelector<HTMLCanvasElement>('#rp-map')!;
  const tip = root.querySelector<HTMLDivElement>('#rp-map-tip')!;
  const w = canvas.parentElement!.clientWidth;
  if (w === 0) return;
  const h = Math.round(Math.min(w * 0.62, 340));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const max = Math.max(...m.lookSeconds, 0.001);
  const css = getComputedStyle(root);
  ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#9aa1b2';
  const dots: SeatDot[] = drawSeatMap(
    ctx,
    { x: 0, y: 0, w, h },
    d.seats,
    m.lookSeconds.map((s) => s / max),
    { emptyStroke: '#5a6070', speakerColor: '#e0a64a', label: 'You', font: '600 12px -apple-system, sans-serif' },
  );

  const show = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let best: SeatDot | null = null;
    let bestD = Infinity;
    for (const dot of dots) {
      const dd = Math.hypot(dot.cx - x, dot.cy - y);
      if (dd < Math.max(dot.r * 1.8, 14) && dd < bestD) {
        best = dot;
        bestD = dd;
      }
    }
    if (!best) {
      tip.hidden = true;
      return;
    }
    const seat = d.seats[best.index];
    const look = m.lookSeconds[best.index];
    tip.innerHTML = `<strong>${esc(sectionLabel(seat.section, singleRow))}</strong><br>${look > 0 ? `${look.toFixed(1)} s of eye contact` : 'No eye contact'}<br>Interest at end ${pct(d.finalInterest[best.index] ?? 0)}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(best.cx + 12, w - 170)}px`;
    tip.style.top = `${Math.max(best.cy - 60, 0)}px`;
  };
  canvas.onpointermove = show;
  canvas.onpointerdown = show;
  canvas.onpointerleave = () => (tip.hidden = true);
}

function drawLine(root: HTMLElement, m: Metrics): void {
  const svg = root.querySelector<SVGSVGElement>('#rp-line')!;
  const tip = root.querySelector<HTMLDivElement>('#rp-line-tip')!;
  const w = svg.parentElement!.clientWidth;
  if (w === 0 || m.timeline.length < 2) return;
  const h = 220;
  const pad = { l: 40, r: 14, t: 18, b: 28 };
  const dur = Math.max(m.durationSeconds, 1);
  const x = (t: number) => pad.l + (t / dur) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (h - pad.t - pad.b);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  const tickStep = dur > 150 ? 60 : dur > 50 ? 30 : 10;
  const xTicks: number[] = [];
  for (let t = 0; t <= dur + 0.01; t += tickStep) xTicks.push(t);

  const band = (s: { start: number; end: number }, cls: string, label: string) =>
    `<rect class="${cls}" x="${x(s.start)}" y="${pad.t}" width="${Math.max(2, x(s.end) - x(s.start))}" height="${h - pad.t - pad.b}"/>` +
    (x(s.end) - x(s.start) > 34 ? `<text class="band-label" x="${x(s.start) + 4}" y="${pad.t + 12}">${label}</text>` : '');

  const path = m.timeline.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.interest).toFixed(1)}`).join('');
  const lastP = m.timeline[m.timeline.length - 1];
  svg.innerHTML = `
    ${[0, 0.5, 1].map((v) => `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('')}
    ${xTicks.map((t) => `<text class="axis" x="${x(t)}" y="${h - 8}" text-anchor="middle">${clock(t)}</text>`).join('')}
    ${m.downSpans.map((s) => band(s, 'band-down', 'Down')).join('')}
    ${m.deadAirSpans.map((s) => band(s, 'band-dead', 'Dead air')).join('')}
    <line class="target" x1="${pad.l}" x2="${w - pad.r}" y1="${y(T.finalInterest)}" y2="${y(T.finalInterest)}"/>
    <text class="axis" x="${w - pad.r}" y="${y(T.finalInterest) - 5}" text-anchor="end">target</text>
    <path class="series" d="${path}"/>
    <circle class="end" cx="${x(lastP.t)}" cy="${y(lastP.interest)}" r="4"/>
    <line class="cross" id="rp-cross" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" visibility="hidden"/>
    <circle class="cross-dot" id="rp-cross-dot" r="5" visibility="hidden"/>
    <rect x="${pad.l}" y="0" width="${w - pad.l - pad.r}" height="${h}" fill="transparent" id="rp-hit"/>`;

  const hit = svg.querySelector('#rp-hit') as SVGRectElement;
  const cross = svg.querySelector('#rp-cross') as SVGLineElement;
  const dot = svg.querySelector('#rp-cross-dot') as SVGCircleElement;
  const move = (ev: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const t = ((ev.clientX - rect.left - pad.l) / (w - pad.l - pad.r)) * dur;
    let best = m.timeline[0];
    for (const p of m.timeline) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    const px = x(best.t);
    cross.setAttribute('x1', String(px));
    cross.setAttribute('x2', String(px));
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', String(px));
    dot.setAttribute('cy', String(y(best.interest)));
    dot.setAttribute('visibility', 'visible');
    const inDead = m.deadAirSpans.some((s) => best.t >= s.start && best.t <= s.end);
    const inDown = m.downSpans.some((s) => best.t >= s.start && best.t <= s.end);
    tip.innerHTML = `<strong>${clock(best.t)}</strong><br>Room interest ${pct(best.interest)}${inDead ? '<br>During dead air' : ''}${inDown ? '<br>While looking down' : ''}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(px + 10, w - 160)}px`;
    tip.style.top = `${Math.max(y(best.interest) - 64, 0)}px`;
  };
  hit.onpointermove = move;
  hit.onpointerdown = move;
  hit.onpointerleave = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
  };
}
