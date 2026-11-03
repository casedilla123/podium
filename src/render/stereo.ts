// Two eye cameras, half the eye spacing either side of the head, each drawn
// into its half of the screen. Written directly rather than with three.js
// add-ons so lens settings stay under our control.
//
// Each eye's image is centred under its lens, not in the middle of its half
// of the screen: on a phone the half-screen centres are wider apart than
// Cardboard lenses, and in a Safari tab the browser bars push everything down.
// Off-centre images are what make both eyes together look wrong even when
// each eye alone looks fine.

import * as THREE from 'three';
import { CONFIG } from '../config';

export interface LensLayout {
  /** Projection shift per eye in normalised device coordinates (-1..1 across a viewport). */
  leftShift: { x: number; y: number };
  rightShift: { x: number; y: number };
  /** Lens centres in canvas pixels, for the vignette. */
  leftCx: number;
  rightCx: number;
  cy: number;
}

const MAX_SHIFT = 0.6;
const clampShift = (v: number) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, v));

/**
 * Where each eye's image centre should be so it sits under its lens. Pure.
 * lensSepPx: distance between lens centres on screen. lensCenterY: lens centre
 * height measured from the top of the canvas.
 */
export function lensLayout(canvasW: number, canvasH: number, lensSepPx: number, lensCenterY: number): LensLayout {
  const half = canvasW / 2;
  const sep = Math.max(half * 0.4, Math.min(canvasW * 0.95, lensSepPx));
  // The right lens mirrors the left, so one shift (negated) serves both.
  const leftCx = canvasW / 2 - sep / 2;
  const sx = clampShift((2 * (leftCx - canvasW / 4)) / half);
  // Canvas y grows downward; NDC y grows upward.
  const sy = clampShift((-2 * (lensCenterY - canvasH / 2)) / canvasH);
  return {
    leftShift: { x: sx, y: sy },
    rightShift: { x: -sx, y: sy },
    leftCx: canvasW / 4 + (sx * half) / 2,
    rightCx: (3 * canvasW) / 4 - (sx * half) / 2,
    cy: canvasH / 2 - (sy * canvasH) / 2,
  };
}

/** Shift a perspective projection so its centre moves by (x, y) in NDC. */
function shiftProjection(cam: THREE.PerspectiveCamera, x: number, y: number): void {
  const e = cam.projectionMatrix.elements;
  // NDC = (clip.xy / -z): the z column terms add straight onto NDC with a minus sign.
  e[8] -= x;
  e[9] -= y;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

export class StereoRig {
  /** Rotation-only head: position is fixed at eye height, quaternion comes from input. */
  readonly head = new THREE.Object3D();
  readonly mono: THREE.PerspectiveCamera;
  readonly left: THREE.PerspectiveCamera;
  readonly right: THREE.PerspectiveCamera;
  stereo = false;
  private width = 1;
  private height = 1;
  private lensSepMm: number = CONFIG.stereo.ipdMm;
  /** On a phone, use the physical screen to find where the lenses are. */
  private physical = false;

  constructor() {
    const R = CONFIG.render;
    this.mono = new THREE.PerspectiveCamera(R.monoFovDeg, 1, R.near, R.far);
    this.left = new THREE.PerspectiveCamera(CONFIG.stereo.eyeFovDeg, 1, R.near, R.far);
    this.right = new THREE.PerspectiveCamera(CONFIG.stereo.eyeFovDeg, 1, R.near, R.far);
    this.head.add(this.mono, this.left, this.right);
    // Camera separation is your real eye spacing; it sets depth, not alignment.
    this.left.position.x = -CONFIG.stereo.ipdMm / 2000;
    this.right.position.x = CONFIG.stereo.ipdMm / 2000;
  }

  /** Distance between the viewer's lens centres; moves the two images on screen. */
  setLensSpacing(mm: number, physical: boolean): void {
    this.lensSepMm = mm;
    this.physical = physical;
    this.resize(this.width, this.height);
  }

  /** Per-eye field of view (viewer fit) and the single-view field of view. */
  setFov(eyeFovDeg: number, monoFovDeg: number): void {
    this.left.fov = this.right.fov = eyeFovDeg;
    this.mono.fov = monoFovDeg;
    this.resize(this.width, this.height);
  }

  setStereo(on: boolean): void {
    this.stereo = on;
    document.body.classList.toggle('stereo', on);
  }

  /**
   * Lens centre height in canvas pixels. The lenses sit at the middle of the
   * physical screen; in a Safari tab the canvas starts below the browser bars,
   * so that middle is higher up the canvas than its own centre.
   */
  private lensCenterY(): number {
    if (!this.physical) return this.height / 2;
    const short = Math.min(screen.width, screen.height);
    const barsAbove = Math.max(0, Math.min(short * 0.45, short - this.height));
    return short / 2 - barsAbove;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.mono.aspect = width / height;
    this.mono.updateProjectionMatrix();
    for (const eye of [this.left, this.right]) {
      eye.aspect = width / 2 / height;
      eye.updateProjectionMatrix();
    }
    const sepPx = this.physical ? this.lensSepMm * CONFIG.stereo.cssPxPerMm : width / 2;
    const L = lensLayout(width, height, sepPx, this.lensCenterY());
    shiftProjection(this.left, L.leftShift.x, L.leftShift.y);
    shiftProjection(this.right, L.rightShift.x, L.rightShift.y);
    // Keep the lens-edge vignette centred on the lenses too.
    const root = document.documentElement.style;
    root.setProperty('--lens-l', `${((L.leftCx / (width / 2)) * 100).toFixed(1)}%`);
    root.setProperty('--lens-r', `${(((L.rightCx - width / 2) / (width / 2)) * 100).toFixed(1)}%`);
    root.setProperty('--lens-y', `${((L.cy / height) * 100).toFixed(1)}%`);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.head.updateMatrixWorld(true);
    const { width: w, height: h } = this;
    if (!this.stereo) {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.render(scene, this.mono);
      return;
    }
    renderer.setScissorTest(true);
    const half = Math.floor(w / 2);
    renderer.setViewport(0, 0, half, h);
    renderer.setScissor(0, 0, half, h);
    renderer.render(scene, this.left);
    renderer.setViewport(half, 0, w - half, h);
    renderer.setScissor(half, 0, w - half, h);
    renderer.render(scene, this.right);
    renderer.setScissorTest(false);
  }
}
