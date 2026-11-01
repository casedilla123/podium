// Phone rotation -> head quaternion, adjusted for landscape, with light
// smoothing and a recenter offset. three.js removed DeviceOrientationControls
// in r134, so this is our own version of the same math.

import * as THREE from 'three';
import { CONFIG } from '../config';

type PermissionFn = () => Promise<'granted' | 'denied'>;

/**
 * Call this synchronously at the top of a tap handler, before any other await:
 * iOS only grants motion access from inside a user gesture.
 */
export function requestMotionPermission(): Promise<boolean> {
  const request = (window.DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn } | undefined)
    ?.requestPermission;
  if (typeof request !== 'function') return Promise.resolve(true);
  return request().then(
    (r) => r === 'granted',
    () => false,
  );
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
// The device camera looks out of the back of the phone: rotate -90° about X.
const BACK_OF_DEVICE = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/** Device orientation angles (degrees) and screen angle -> world quaternion. Pure. */
export function deviceQuaternion(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg: number,
  out = new THREE.Quaternion(),
): THREE.Quaternion {
  const d = THREE.MathUtils.degToRad;
  const euler = new THREE.Euler(d(betaDeg), d(alphaDeg), -d(gammaDeg), 'YXZ');
  out.setFromEuler(euler);
  out.multiply(BACK_OF_DEVICE);
  out.multiply(new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -d(screenAngleDeg)));
  return out;
}

/** Heading of a quaternion around +Y, with 0 = looking down -Z. */
export function yawOf(q: THREE.Quaternion): number {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-f.x, -f.z);
}

function screenAngle(): number {
  const so = screen.orientation as ScreenOrientation | undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  return Number((window as unknown as { orientation?: number }).orientation ?? 0);
}

export class OrientationControl {
  private alpha = 0;
  private beta = 0;
  private gamma = 0;
  private gotData = false;
  private readonly raw = new THREE.Quaternion();
  private readonly target = new THREE.Quaternion();
  private readonly current = new THREE.Quaternion();
  private readonly offset = new THREE.Quaternion();
  private primed = false;

  private readonly onEvent = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    this.alpha = e.alpha;
    this.beta = e.beta;
    this.gamma = e.gamma;
    this.gotData = true;
  };

  start(): void {
    window.addEventListener('deviceorientation', this.onEvent);
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onEvent);
  }

  get hasData(): boolean {
    return this.gotData;
  }

  /** Resolves true once a real orientation sample arrives, false after the timeout. */
  waitForData(timeoutMs = CONFIG.orientation.sensorTimeoutMs): Promise<boolean> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const poll = () => {
        if (this.gotData) resolve(true);
        else if (performance.now() - t0 > timeoutMs) resolve(false);
        else requestAnimationFrame(poll);
      };
      poll();
    });
  }

  /** Make the current heading "forward" (-Z), keeping pitch and roll. */
  recenter(): void {
    deviceQuaternion(this.alpha, this.beta, this.gamma, screenAngle(), this.raw);
    this.offset.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -yawOf(this.raw));
    this.primed = false;
  }

  update(dt: number, out: THREE.Quaternion): void {
    if (!this.gotData) return;
    deviceQuaternion(this.alpha, this.beta, this.gamma, screenAngle(), this.raw);
    this.target.copy(this.offset).multiply(this.raw);
    if (!this.primed) {
      this.current.copy(this.target);
      this.primed = true;
    } else {
      this.current.slerp(this.target, 1 - Math.exp(-dt / CONFIG.orientation.smoothingTau));
    }
    out.copy(this.current);
  }
}
