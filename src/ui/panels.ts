// In-world text panels and gaze buttons, drawn to canvas textures. Panels
// float 2-3 m away in the room; nothing is pinned to the screen edges.

import * as THREE from 'three';

const PX_PER_M = 512;
const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

export interface TextLine {
  text: string;
  /** Font size in metres. */
  size?: number;
  weight?: 400 | 600 | 700;
  color?: string;
}

export interface PanelStyle {
  background?: string;
  border?: string;
  radius?: number; // metres
  align?: 'center' | 'left';
  padding?: number; // metres
}

export class TextPanel {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private lastKey = '';

  constructor(
    readonly width: number,
    readonly height: number,
    private style: PanelStyle = {},
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * PX_PER_M);
    this.canvas.height = Math.round(height * PX_PER_M);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
  }

  setStyle(style: PanelStyle): void {
    this.style = { ...this.style, ...style };
    this.lastKey = '';
  }

  /** Redraws only when the content actually changed. */
  draw(lines: readonly TextLine[]): void {
    const key = JSON.stringify([lines, this.style]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    const { ctx, canvas } = this;
    const s = this.style;
    const px = (m: number) => m * PX_PER_M;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (s.background) {
      const r = px(s.radius ?? 0.06);
      ctx.beginPath();
      ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r);
      ctx.fillStyle = s.background;
      ctx.fill();
      if (s.border) {
        ctx.lineWidth = 8;
        ctx.strokeStyle = s.border;
        ctx.stroke();
      }
    }

    const pad = px(s.padding ?? 0.06);
    const align = s.align ?? 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const x = align === 'center' ? canvas.width / 2 : pad;
    const maxW = canvas.width - pad * 2;

    // Wrap every line, then centre the block vertically.
    const laid: { text: string; size: number; font: string; color: string }[] = [];
    for (const l of lines) {
      const size = px(l.size ?? 0.09);
      const font = `${l.weight ?? 600} ${size}px ${FONT}`;
      ctx.font = font;
      for (const para of l.text.split('\n')) {
        let cur = '';
        for (const word of para.split(' ')) {
          const next = cur ? `${cur} ${word}` : word;
          if (ctx.measureText(next).width > maxW && cur) {
            laid.push({ text: cur, size, font, color: l.color ?? '#fff' });
            cur = word;
          } else cur = next;
        }
        laid.push({ text: cur, size, font, color: l.color ?? '#fff' });
      }
    }
    const lineH = (size: number) => size * 1.25;
    const total = laid.reduce((a, l) => a + lineH(l.size), 0);
    let y = align === 'center' ? (canvas.height - total) / 2 : pad;
    for (const l of laid) {
      y += lineH(l.size);
      if (y - l.size * 0.25 > canvas.height - pad / 2) break; // clip overflow
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, x, y - l.size * 0.25);
    }
    this.texture.needsUpdate = true;
  }
}

export interface Button {
  mesh: THREE.Mesh;
  enabled: boolean;
  onSelect(): void;
  setHover(h: boolean): void;
  setSelected(s: boolean): void;
}

const BTN = {
  idle: { background: 'rgba(28,32,44,0.88)', border: 'rgba(255,255,255,0.25)' },
  hover: { background: 'rgba(60,92,160,0.95)', border: 'rgba(255,255,255,0.9)' },
  selected: { background: 'rgba(214,158,60,0.95)', border: 'rgba(255,240,210,0.95)' },
};

export function makeButton(label: string, width: number, height: number, onSelect: () => void, size = 0.1): Button {
  const panel = new TextPanel(width, height, { ...BTN.idle, radius: 0.05 });
  let hover = false;
  let selected = false;
  const redraw = () => {
    panel.setStyle(selected ? BTN.selected : hover ? BTN.hover : BTN.idle);
    panel.draw([{ text: label, size, weight: 700 }]);
    panel.mesh.scale.setScalar(hover ? 1.06 : 1);
  };
  redraw();
  const button: Button = {
    mesh: panel.mesh,
    enabled: true,
    onSelect,
    setHover(h) {
      hover = h;
      redraw();
    },
    setSelected(s) {
      selected = s;
      redraw();
    },
  };
  panel.mesh.userData.button = button;
  return button;
}

/**
 * Place an object `distance` metres from the eye along a heading, facing the eye.
 * yawDeg: 0 = straight ahead (-Z), positive = to the right. pitchDeg: positive = up.
 */
export function placeInRoom(
  obj: THREE.Object3D,
  eye: THREE.Vector3,
  distance: number,
  yawDeg: number,
  pitchDeg: number,
): void {
  const yaw = THREE.MathUtils.degToRad(-yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  obj.position.copy(eye).addScaledVector(dir, distance);
  obj.lookAt(eye);
}
