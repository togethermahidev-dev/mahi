/**
 * The App Clip's hand-over: the clip (ui/clip/MahiClip) leaves the invite link in the shared App
 * Group when someone taps "Get Mahi"; the app reads it once, deletes it, and holds the invite like
 * one it was opened with. Off switch `app-clip`: the app drops it unread.
 */
import {
  CLIP_APP_GROUP,
  CLIP_HANDOVER_KEY,
  clipHandoverDecision,
  readClipHandover,
} from '@/lib/clipHandover';

const TOKEN = '48bafaef17afd63e5c8c6390e2dee7f5';
const NOW = 1_791_000_000_000; // ms
const saved = (link: string, savedAtSeconds: number) =>
  JSON.stringify({ link, savedAt: savedAtSeconds });

describe('readClipHandover', () => {
  it('reads the invite out of what the clip saved', () => {
    expect(
      readClipHandover(saved(`https://togethermahi.com/i/${TOKEN}`, NOW / 1000 - 60), NOW)
    ).toBe(TOKEN);
  });

  it('takes a code link as well as a token link', () => {
    expect(readClipHandover(saved('https://togethermahi.com/i/9acwlh', NOW / 1000), NOW)).toBe(
      '9ACWLH'
    );
  });

  it('lets go of one older than an invite lives (7 days)', () => {
    const eightDays = 8 * 24 * 60 * 60;
    expect(
      readClipHandover(saved(`https://togethermahi.com/i/${TOKEN}`, NOW / 1000 - eightDays), NOW)
    ).toBeNull();
  });

  it('turns away nothing, junk, other sites and a missing time', () => {
    expect(readClipHandover(null, NOW)).toBeNull();
    expect(readClipHandover('', NOW)).toBeNull();
    expect(readClipHandover('not json', NOW)).toBeNull();
    expect(
      readClipHandover(JSON.stringify({ link: `https://togethermahi.com/i/${TOKEN}` }), NOW)
    ).toBeNull();
    expect(readClipHandover(saved(`https://example.com/i/${TOKEN}`, NOW / 1000), NOW)).toBeNull();
    expect(readClipHandover(JSON.stringify([1, 2]), NOW)).toBeNull();
  });

  it('names the same App Group and key as the clip and the widget', () => {
    expect(CLIP_APP_GROUP).toBe('group.com.mahi.app');
    expect(CLIP_HANDOVER_KEY).toBe('mahi.clipInvite');
  });
});

describe('clipHandoverDecision (switch app-clip)', () => {
  it('takes it once PostHog says on', () => {
    expect(clipHandoverDecision(true, true)).toBe('take');
  });

  it('drops it unread when the switch is off (or missing from PostHog)', () => {
    expect(clipHandoverDecision(false, true)).toBe('drop');
  });

  it('waits while PostHog has not answered, so an off switch is never missed', () => {
    expect(clipHandoverDecision(undefined, true)).toBe('wait');
  });

  it('takes it when the app has no PostHog key (everything on, as for every switch)', () => {
    expect(clipHandoverDecision(undefined, false)).toBe('take');
    expect(clipHandoverDecision(false, false)).toBe('take');
  });
});
