/**
 * Two-stage swipes (owner, 2026-10-08): the camera nudges to a short peek first; a second swipe
 * (or a tap) goes the rest. Back from fully open returns straight to the camera.
 */
import { releaseDetent } from '@/lib/detent';

const peek = 0.3;
const base = { velocity: 0, peek, twoStage: true };

describe('from the camera (closed)', () => {
  it('a short swipe or a flick stops at the peek, never all the way', () => {
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.2 })).toBe('peek');
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.9 })).toBe('peek');
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.02, velocity: 0.6 })).toBe('peek');
  });
  it('a tiny drag springs back', () => {
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.05 })).toBe('closed');
  });
});

describe('from the peek', () => {
  it('swiping on goes the rest of the way', () => {
    expect(releaseDetent({ ...base, start: 'peek', progress: 0.5 })).toBe('open');
    expect(releaseDetent({ ...base, start: 'peek', progress: 0.32, velocity: 0.6 })).toBe('open');
  });
  it('swiping back returns to the camera', () => {
    expect(releaseDetent({ ...base, start: 'peek', progress: 0.1 })).toBe('closed');
    expect(releaseDetent({ ...base, start: 'peek', progress: 0.28, velocity: -0.6 })).toBe(
      'closed'
    );
  });
  it('a small wobble stays at the peek', () => {
    expect(releaseDetent({ ...base, start: 'peek', progress: 0.35 })).toBe('peek');
  });
});

describe('from fully open', () => {
  it('back past a little returns straight to the camera', () => {
    expect(releaseDetent({ ...base, start: 'open', progress: 0.8 })).toBe('closed');
    expect(releaseDetent({ ...base, start: 'open', progress: 0.95, velocity: -0.6 })).toBe(
      'closed'
    );
  });
  it('a small wobble stays open', () => {
    expect(releaseDetent({ ...base, start: 'open', progress: 0.9 })).toBe('open');
  });
});

describe('one stage (a locked feed: the quarter lift is the whole way)', () => {
  it('goes straight to open', () => {
    expect(releaseDetent({ ...base, twoStage: false, start: 'closed', progress: 0.2 })).toBe(
      'open'
    );
  });
});
