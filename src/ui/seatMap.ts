// Top-down seat map coloured by how long you looked at each person. Shared by
// the in-VR summary panel and the 2D report page.

import type { SeatInfo } from '../session/recorder';

/** Sequential blue ramp for a dark surface: near-zero recedes, most-looked is lightest. */
export const SEQ_DARK = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];

export function seqColor(v: number): string {
  if (v <= 0) return 'transparent';
  const i = Math.min(SEQ_DARK.length - 1, Math.floor(v * SEQ_DARK.length));
  return SEQ_DARK[i];
}

export interface SeatDot {
  index: number;
  cx: number;
  cy: number;
  r: number;
}

/**
 * Draw seats in a box. values are 0..1 (look time / max look time). The
 * speaker sits at the bottom centre. Returns dot positions for hit-testing.
 */
export function drawSeatMap(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  seats: readonly SeatInfo[],
  values: readonly number[],
  opts: { emptyStroke: string; speakerColor: string; label?: string; font?: string },
): SeatDot[] {
  // Bounds in room space: x across, -z away from the speaker.
  const xs = seats.map((s) => s.x);
  const zs = seats.map((s) => -s.z);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 0);
  const maxZ = Math.max(...zs);
  const pad = 0.08 * Math.min(box.w, box.h);
  const scale = Math.min((box.w - pad * 2) / Math.max(maxX - minX, 1), (box.h - pad * 3) / Math.max(maxZ, 1));
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * scale;
  const oy = box.y + box.h - pad * 1.5;
  const spacing = Math.min(...seats.map((s, i) => Math.min(...seats.filter((_, j) => j !== i).map((o) => Math.hypot(o.x - s.x, o.z - s.z)))));
  const r = Math.max(3, Math.min(spacing * scale * 0.38, box.w * 0.06));

  const dots: SeatDot[] = [];
  seats.forEach((s, i) => {
    const cx = ox + s.x * scale;
    const cy = oy - -s.z * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (values[i] > 0) {
      ctx.fillStyle = seqColor(values[i]);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.strokeStyle = opts.emptyStroke;
      ctx.stroke();
    }
    dots.push({ index: i, cx, cy, r });
  });

  // You, at the front.
  ctx.fillStyle = opts.speakerColor;
  ctx.beginPath();
  ctx.moveTo(ox, oy - r * 0.2);
  ctx.lineTo(ox - r * 0.9, oy + r * 1.3);
  ctx.lineTo(ox + r * 0.9, oy + r * 1.3);
  ctx.closePath();
  ctx.fill();
  if (opts.label) {
    ctx.font = opts.font ?? `600 ${Math.round(r * 1.1)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.label, ox, oy + r * 1.6);
  }
  return dots;
}
