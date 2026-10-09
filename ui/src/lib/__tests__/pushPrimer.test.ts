import {
  PUSH_BANNER,
  PUSH_PRIMER,
  pushBanner,
  pushPrimerPending,
  shouldShowPushPrimer,
} from '../pushPrimer';

describe('the notifications page (push primer)', () => {
  const ready = {
    flagOn: true,
    permission: 'undetermined' as const,
    primerAnswered: false,
    pagesBeforeSettled: true,
  };

  // Owner, 2026-10-09 (core workflow, step 10).
  it('says what the owner asked for, with Turn on and Not now', () => {
    expect(PUSH_PRIMER).toEqual({
      headline: 'Don’t miss your tag 🔔',
      line: 'Turn on notifications so you know when a mate tags you.',
      turnOn: 'Turn on',
      notNow: 'Not now',
    });
  });

  it('shows once the welcome cards and the privacy choice are out of the way', () => {
    expect(shouldShowPushPrimer(ready)).toBe(true);
  });

  it('never shows over an earlier onboarding page', () => {
    expect(shouldShowPushPrimer({ ...ready, pagesBeforeSettled: false })).toBe(false);
  });

  // The camera now asks for its permission after onboarding, so the page no longer waits on it.
  it("does not wait on the phone's camera question", () => {
    expect(Object.keys(ready)).not.toContain('cameraSettled');
    expect(shouldShowPushPrimer(ready)).toBe(true);
  });

  it('stays hidden while the push-core switch is off', () => {
    expect(shouldShowPushPrimer({ ...ready, flagOn: false })).toBe(false);
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

  // The last onboarding page: onboarding is done once it has nothing left to show.
  describe('pushPrimerPending', () => {
    const base = { flagOn: true, permission: 'undetermined' as const, primerAnswered: false };

    it('is pending for someone the phone has not asked and who has not answered the page', () => {
      expect(pushPrimerPending(base)).toBe(true);
    });

    it('is not pending once answered, with the switch off, or once the phone has asked', () => {
      expect(pushPrimerPending({ ...base, primerAnswered: true })).toBe(false);
      expect(pushPrimerPending({ ...base, flagOn: false })).toBe(false);
      expect(pushPrimerPending({ ...base, permission: 'granted' })).toBe(false);
      expect(pushPrimerPending({ ...base, permission: 'denied' })).toBe(false);
    });

    it("never holds onboarding back when the phone can't be read", () => {
      expect(pushPrimerPending({ ...base, permission: null })).toBe(false);
      expect(pushPrimerPending({ ...base, primerAnswered: null })).toBe(false);
    });
  });
});

describe('the "turn on notifications" banner at the top of the feed', () => {
  const base = { flagOn: true, permission: 'denied' as const, primerAnswered: true };

  it("has the owner's words and one button", () => {
    expect(PUSH_BANNER).toEqual({
      text: '🔕 You won’t know when you’re tagged and could miss the deadline.',
      turnOn: 'Turn on',
    });
  });

  it('after "Don\'t allow" on the phone\'s question, sends them to Settings', () => {
    expect(pushBanner(base)).toBe('settings');
  });

  it("after Not now (the phone never asked), asks the phone's question", () => {
    expect(pushBanner({ ...base, permission: 'undetermined' })).toBe('ask');
  });

  it('shows without an open tag', () => {
    expect(pushBanner(base)).not.toBeNull();
  });

  it('is not shown before the notifications page has been answered', () => {
    expect(pushBanner({ ...base, permission: 'undetermined', primerAnswered: false })).toBeNull();
    expect(pushBanner({ ...base, permission: 'undetermined', primerAnswered: null })).toBeNull();
  });

  it('is not shown once notifications are on, or with the switch off', () => {
    expect(pushBanner({ ...base, permission: 'granted' })).toBeNull();
    expect(pushBanner({ ...base, flagOn: false })).toBeNull();
    expect(pushBanner({ ...base, permission: null })).toBeNull();
  });
});
