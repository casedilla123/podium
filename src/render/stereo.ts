// Two eye cameras, half the lens spacing either side of the head, each drawn
// into its half of the screen. Written directly rather than with three.js
// add-ons so lens settings stay under our control.

import * as THREE from 'three';
import { CONFIG } from '../config';

export class StereoRig {
  /** Rotation-only head: position is fixed at eye height, quaternion comes from input. */
  readonly head = new THREE.Object3D();
  readonly mono: THREE.PerspectiveCamera;
  readonly left: THREE.PerspectiveCamera;
  readonly right: THREE.PerspectiveCamera;
  stereo = false;
  private width = 1;
  private height = 1;

  constructor() {
    const R = CONFIG.render;
    this.mono = new THREE.PerspectiveCamera(R.monoFovDeg, 1, R.near, R.far);
    this.left = new THREE.PerspectiveCamera(CONFIG.stereo.eyeFovDeg, 1, R.near, R.far);
    this.right = new THREE.PerspectiveCamera(CONFIG.stereo.eyeFovDeg, 1, R.near, R.far);
    this.head.add(this.mono, this.left, this.right);
    this.setIpd(CONFIG.stereo.ipdMm / 1000);
  }

  setIpd(ipd: number): void {
    this.left.position.x = -ipd / 2;
    this.right.position.x = ipd / 2;
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

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.mono.aspect = width / height;
    this.mono.updateProjectionMatrix();
    for (const eye of [this.left, this.right]) {
      eye.aspect = width / 2 / height;
      eye.updateProjectionMatrix();
    }
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
