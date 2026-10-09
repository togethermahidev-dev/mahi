/**
 * One swipe, all the way (owner, 2026-10-09: "It gets stuck when it shouldn't"): the swipe up to
 * the feed, the pull down to the roadmap and the way back each settle open or closed — there is no
 * peek to stop at. Where it lands goes by how far the finger went, or how fast it flicked.
 */
import { detentProgress, releaseDetent } from '@/lib/detent';

const base = { velocity: 0 };

describe('from the camera (closed)', () => {
  it('a swipe past a little goes all the way open, never stopping part way', () => {
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.2 })).toBe('open');
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.3 })).toBe('open');
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.9 })).toBe('open');
  });
  it('a flick goes all the way open', () => {
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.02, velocity: 0.6 })).toBe('open');
  });
  it('a tiny drag springs back', () => {
    expect(releaseDetent({ ...base, start: 'closed', progress: 0.05 })).toBe('closed');
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

describe('detentProgress — where each end sits', () => {
  it('closed is 0, open is 1', () => {
    expect(detentProgress('closed')).toBe(0);
    expect(detentProgress('open')).toBe(1);
  });
});
