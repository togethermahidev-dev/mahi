import {
  PUSH_NUDGE_TEXT,
  PUSH_PRIMER,
  nudgeDismissMark,
  pushNudge,
  shouldShowPushPrimer,
} from '../pushPrimer';

describe('the notifications page (push primer)', () => {
  const ready = {
    flagOn: true,
    permission: 'undetermined' as const,
    primerAnswered: false,
    welcomeSettled: true,
    cameraSettled: true,
  };

  it('says what the founder asked for, in sentence case', () => {
    expect(PUSH_PRIMER).toEqual({
      headline: 'When do you post on Mahi?',
      why: 'When a friend tags you. Turn on notifications so you know the moment your 48 hours start.',
      cardTitle: 'Please turn on notifications',
      cardBody:
        'Mahi only pings you when it matters: a friend tags you, your time is running out, or your feed is about to lock.',
      allow: 'Allow',
      notNow: 'Not now',
    });
  });

  it('shows once everything else is out of the way', () => {
    expect(shouldShowPushPrimer(ready)).toBe(true);
  });

  it('stays hidden while the push-core switch is off', () => {
    expect(shouldShowPushPrimer({ ...ready, flagOn: false })).toBe(false);
  });

  it('never shows over the welcome cards', () => {
    expect(shouldShowPushPrimer({ ...ready, welcomeSettled: false })).toBe(false);
  });

  it("never shows over the phone's camera question", () => {
    expect(shouldShowPushPrimer({ ...ready, cameraSettled: false })).toBe(false);
  });

  it('shows once per device: not after it has been answered', () => {
    expect(shouldShowPushPrimer({ ...ready, primerAnswered: true })).toBe(false);
  });

  it('is not shown to someone who already allowed or refused notifications', () => {
    expect(shouldShowPushPrimer({ ...ready, permission: 'granted' })).toBe(false);
    expect(shouldShowPushPrimer({ ...ready, permission: 'denied' })).toBe(false);
  });

  it('waits until the phone has said what the permission is', () => {
    expect(shouldShowPushPrimer({ ...ready, permission: null })).toBe(false);
    expect(shouldShowPushPrimer({ ...ready, primerAnswered: null })).toBe(false);
  });
});

describe('the "turn on notifications" line on the camera (push nudge)', () => {
  const tag = (created_at: string) => ({ created_at });
  const base = {
    flagOn: true,
    permission: 'denied' as const,
    primerAnswered: true,
    openTags: [tag('2026-10-02T10:00:00Z')],
    dismissedThrough: null,
  };

  it('has the one line', () => {
    expect(PUSH_NUDGE_TEXT).toBe('Turn on notifications so you never miss a tag');
  });

  it('after "Don\'t allow" on the phone\'s question, sends them to Settings', () => {
    expect(pushNudge(base)).toBe('settings');
  });

  it('after "Not now", asks the phone\'s question (Settings has no notifications row yet)', () => {
    expect(pushNudge({ ...base, permission: 'undetermined' })).toBe('ask');
  });

  it('only shows while they hold an open tag', () => {
    expect(pushNudge({ ...base, openTags: [] })).toBeNull();
  });

  it('is not shown before the notifications page has been answered', () => {
    expect(pushNudge({ ...base, permission: 'undetermined', primerAnswered: false })).toBeNull();
  });

  it('is not shown once notifications are on, or with the switch off', () => {
    expect(pushNudge({ ...base, permission: 'granted' })).toBeNull();
    expect(pushNudge({ ...base, flagOn: false })).toBeNull();
    expect(pushNudge({ ...base, permission: null })).toBeNull();
  });

  it('stays dismissed for the tags that were open when it was dismissed', () => {
    const mark = nudgeDismissMark(base.openTags);
    expect(mark).toBe('2026-10-02T10:00:00Z');
    expect(pushNudge({ ...base, dismissedThrough: mark })).toBeNull();
  });

  it('comes back with the next tag', () => {
    expect(
      pushNudge({
        ...base,
        openTags: [tag('2026-10-02T10:00:00Z'), tag('2026-10-03T09:00:00Z')],
        dismissedThrough: '2026-10-02T10:00:00Z',
      })
    ).toBe('settings');
  });

  it('marks the newest open tag when dismissed, whatever the order', () => {
    expect(
      nudgeDismissMark([tag('2026-10-03T09:00:00+00:00'), tag('2026-10-02T10:00:00+00:00')])
    ).toBe('2026-10-03T09:00:00+00:00');
    expect(nudgeDismissMark([])).toBeNull();
  });
});
