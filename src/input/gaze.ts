// Centre-of-view raycast, reticle, and dwell select. The reticle is a real
// object in the scene, placed at the depth of whatever you look at, so both
// eyes see it at the same depth and it doesn't double up.

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Button } from '../ui/panels';

const RETICLE_DOT = 0.006; // radius at 1 m; scaled by distance for a constant angular size
const RETICLE_DOT_HOVER = 0.011;
const RING_INNER = 0.016;
const RING_OUTER = 0.022;

function ringMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { progress: { value: 0 }, color: { value: new THREE.Color(0xffffff) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float progress;
      uniform vec3 color;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        if (r < ${(RING_INNER / RING_OUTER).toFixed(3)} || r > 1.0) discard;
        float a = fract(atan(p.x, p.y) / 6.2831853 + 1.0); // 0..1 clockwise from 12 o'clock
        if (a > progress) discard;
        gl_FragColor = vec4(color, 0.95);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export class Gaze {
  readonly reticle = new THREE.Group();
  /** Buttons that gaze can hover and select. */
  buttons: Button[] = [];
  /** Non-interactive meshes that only give the reticle its depth. */
  depthMeshes: THREE.Object3D[] = [];

  hovered: Button | null = null;
  private dwell = 0;
  /** After a selection, the same button can't fire again until gaze leaves it. */
  private spent: Button | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly dot: THREE.Mesh;
  private readonly ring: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly origin = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();

  constructor() {
    const overlay = { depthTest: false, depthWrite: false, transparent: true };
    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.9, ...overlay }),
    );
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(RING_OUTER * 2, RING_OUTER * 2), ringMaterial());
    this.dot.renderOrder = 1000;
    this.ring.renderOrder = 1001;
    this.reticle.add(this.dot, this.ring);
    this.raycaster.far = CONFIG.render.far;
  }

  update(dt: number, head: THREE.Object3D): void {
    head.getWorldPosition(this.origin);
    head.getWorldQuaternion(this.quat);
    this.dir.set(0, 0, -1).applyQuaternion(this.quat);
    this.raycaster.set(this.origin, this.dir);

    const enabled = this.buttons.filter((b) => b.mesh.visible && b.enabled);
    const hit = this.raycaster.intersectObjects(
      enabled.map((b) => b.mesh),
      false,
    )[0];
    const button = hit ? (enabled.find((b) => b.mesh === hit.object) ?? null) : null;

    let distance: number = CONFIG.gaze.reticleDefaultDistance;
    if (hit) distance = hit.distance;
    else {
      const d = this.raycaster.intersectObjects(this.depthMeshes, false)[0];
      if (d) distance = d.distance;
    }

    if (button !== this.hovered) {
      this.hovered?.setHover(false);
      button?.setHover(true);
      this.hovered = button;
      this.dwell = 0;
    }
    if (this.spent && this.spent !== button) this.spent = null;

    if (button && button !== this.spent) {
      this.dwell += dt;
      if (this.dwell >= CONFIG.gaze.dwellSeconds) this.fire(button);
    } else {
      this.dwell = 0;
    }

    // Place the reticle just in front of the hit, scaled for a constant angular size.
    const d = Math.max(0.3, distance * 0.98);
    this.reticle.position.copy(this.origin).addScaledVector(this.dir, d);
    this.reticle.quaternion.copy(this.quat);
    this.reticle.scale.setScalar(d);
    const r = button ? RETICLE_DOT_HOVER : RETICLE_DOT;
    this.dot.scale.setScalar(r);
    this.ring.material.uniforms.progress.value = button && button !== this.spent ? this.dwell / CONFIG.gaze.dwellSeconds : 0;
  }

  /** A tap selects whatever the reticle is on. Returns true if it hit a button. */
  tap(): boolean {
    if (!this.hovered) return false;
    this.fire(this.hovered);
    return true;
  }

  private fire(b: Button): void {
    this.dwell = 0;
    this.spent = b;
    b.onSelect();
  }
}
