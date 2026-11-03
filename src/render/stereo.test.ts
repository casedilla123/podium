import { describe, expect, it } from 'vitest';
import { lensLayout } from './stereo';

describe('lensLayout', () => {
  it('leaves images centred in their halves when lenses match the halves', () => {
    const L = lensLayout(800, 400, 400, 200);
    expect(L.leftShift.x).toBeCloseTo(0);
    expect(L.leftShift.y).toBeCloseTo(0);
    expect(L.leftCx).toBeCloseTo(200);
    expect(L.rightCx).toBeCloseTo(600);
  });

  it('pulls both images inward when the lenses are closer than the half centres', () => {
    // iPhone-ish: 852 px wide, 64 mm lenses at 6.1 px/mm = 390 px apart.
    const L = lensLayout(852, 393, 390, 196.5);
    expect(L.leftShift.x).toBeGreaterThan(0);
    expect(L.rightShift.x).toBeCloseTo(-L.leftShift.x);
    expect(L.rightCx - L.leftCx).toBeCloseTo(390);
  });

  it('moves the images up when browser bars push the canvas below the lenses', () => {
    // Canvas is the bottom 300 px of a 393 px tall screen; lens centre is 196.5 - 93 from its top.
    const L = lensLayout(852, 300, 390, 103.5);
    expect(L.leftShift.y).toBeGreaterThan(0);
    expect(L.cy).toBeCloseTo(103.5);
  });

  it('clamps extreme values instead of throwing the image off screen', () => {
    const L = lensLayout(852, 100, 10, -500);
    expect(Math.abs(L.leftShift.x)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(L.leftShift.y)).toBeLessThanOrEqual(0.6);
  });
});
