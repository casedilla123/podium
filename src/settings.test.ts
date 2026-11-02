import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitize } from './settings';

describe('sanitize', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitize('nonsense')).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid values and drops stale ones', () => {
    const s = sanitize({ venue: 'panel', mood: 'angry', lengthMin: 7, mic: false, ipdMm: 500 });
    expect(s.venue).toBe('panel');
    expect(s.mood).toBe(DEFAULT_SETTINGS.mood);
    expect(s.lengthMin).toBe(DEFAULT_SETTINGS.lengthMin);
    expect(s.mic).toBe(false);
    expect(s.ipdMm).toBe(75);
  });
});
