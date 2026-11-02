// The big summary panel shown in the room when a talk ends: three headline
// numbers, the coaching line, and a seat map of where you looked.

import { CONFIG } from '../config';
import type { Metrics } from '../session/metrics';
import type { SessionData } from '../session/recorder';
import { drawSeatMap } from './seatMap';

const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const T = CONFIG.report.targets;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function paintVrReport(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  px: number,
  d: SessionData,
  m: Metrics,
  timeUp: boolean,
): void {
  const M = (x: number) => x * px; // metres -> canvas pixels
  ctx.fillStyle = 'rgba(16,19,28,0.97)';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, M(0.06));
  ctx.fill();
  ctx.stroke();

  const padX = M(0.1);
  const colW = w * 0.56;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#e0a64a';
  ctx.font = `700 ${M(0.055)}px ${FONT}`;
  ctx.fillText(timeUp ? "TIME'S UP" : 'TALK ENDED', padX, M(0.14));
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${M(0.11)}px ${FONT}`;
  ctx.fillText('How you did', padX, M(0.27));

  const third = m.voice
    ? { label: 'Dead air', value: String(m.voice.deadAir), ok: m.voice.deadAir <= T.deadAirMax }
    : { label: 'Blind spot', value: `${Math.round(m.blindSpot?.seconds ?? 0)}s`, ok: (m.blindSpot?.seconds ?? 0) < T.blindSpotSeconds };
  const stats = [
    { label: 'Eye contact', value: `${Math.round(m.coverage * 100)}%`, ok: m.coverage >= T.coverage },
    third,
    { label: 'Looking down', value: `${Math.round(m.downShare * 100)}%`, ok: m.downShare < T.downShare },
  ];
  const statW = (colW - padX) / 3;
  stats.forEach((s, i) => {
    const x = padX + i * statW;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${M(0.15)}px ${FONT}`;
    ctx.fillText(s.value, x, M(0.5));
    ctx.fillStyle = '#9aa1b2';
    ctx.font = `600 ${M(0.05)}px ${FONT}`;
    ctx.fillText(s.label, x, M(0.58));
    // Status mark with a word, never colour alone.
    ctx.fillStyle = s.ok ? '#0ca30c' : '#fab219';
    ctx.beginPath();
    ctx.arc(x + M(0.025), M(0.645), M(0.022), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6dae3';
    ctx.font = `600 ${M(0.042)}px ${FONT}`;
    ctx.fillText(s.ok ? 'On target' : 'Work on it', x + M(0.06), M(0.66));
  });

  // Coaching line.
  ctx.fillStyle = '#e8d3a8';
  ctx.font = `500 ${M(0.056)}px ${FONT}`;
  const lines = wrap(ctx, m.coaching, colW - padX - M(0.04)).slice(0, 4);
  lines.forEach((l, i) => ctx.fillText(l, padX, M(0.82) + i * M(0.074)));

  ctx.fillStyle = '#7d8597';
  ctx.font = `500 ${M(0.042)}px ${FONT}`;
  ctx.fillText(`Room at the end: ${Math.round(m.finalInterest * 100)}% interested · ${m.engagedAtEnd} of ${m.memberCount} engaged`, padX, h - M(0.08));

  // Seat map on the right.
  const boxX = colW;
  const boxW = w - colW - padX * 0.6;
  ctx.fillStyle = '#9aa1b2';
  ctx.font = `600 ${M(0.05)}px ${FONT}`;
  ctx.fillText('Where you looked', boxX + M(0.04), M(0.14));
  const max = Math.max(...m.lookSeconds, 0.001);
  ctx.fillStyle = '#e0a64a';
  drawSeatMap(
    ctx,
    { x: boxX, y: M(0.18), w: boxW, h: h - M(0.3) },
    d.seats,
    m.lookSeconds.map((s) => s / max),
    { emptyStroke: '#5a6070', speakerColor: '#e0a64a', label: 'You', font: `600 ${M(0.04)}px ${FONT}` },
  );
}
