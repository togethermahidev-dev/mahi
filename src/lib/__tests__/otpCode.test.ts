import { sanitiseOtp, reusableCode, codeTimes, CODE_TTL_MS, RESEND_AFTER_MS } from '../otpCode';

describe('sanitiseOtp', () => {
  it('keeps typed digits', () => {
    expect(sanitiseOtp('123', 6)).toBe('123');
  });

  it('drops spaces, dashes and letters from a pasted or autofilled code', () => {
    expect(sanitiseOtp('123 456', 6)).toBe('123456');
    expect(sanitiseOtp('123-456', 6)).toBe('123456');
    expect(sanitiseOtp('Code: 12a3456', 6)).toBe('123456');
  });

  it('never goes past the code length', () => {
    expect(sanitiseOtp('12345678', 6)).toBe('123456');
  });

  it('is empty for nothing', () => {
    expect(sanitiseOtp('', 6)).toBe('');
    expect(sanitiseOtp('abc', 6)).toBe('');
  });
});

describe('reusableCode', () => {
  const sentAt = 1_000_000;
  const state = { email: 'jo@example.com', sentAt };

  it('reuses the code just sent to the same email, so Back then Next does not ask again', () => {
    expect(reusableCode(state, 'jo@example.com', sentAt + 30_000)).toBe(true);
  });

  it('matches the email the way it was sent (case and spaces ignored)', () => {
    expect(reusableCode(state, '  Jo@Example.com ', sentAt + 30_000)).toBe(true);
  });

  it('sends a new code for a different email', () => {
    expect(reusableCode(state, 'sam@example.com', sentAt + 30_000)).toBe(false);
  });

  it('sends a new code when nothing was sent', () => {
    expect(reusableCode(null, 'jo@example.com', sentAt)).toBe(false);
  });

  it('sends a new code when less than a minute of the old one is left', () => {
    expect(reusableCode(state, 'jo@example.com', sentAt + CODE_TTL_MS - 59_000)).toBe(false);
    expect(reusableCode(state, 'jo@example.com', sentAt + CODE_TTL_MS + 1)).toBe(false);
  });
});

describe('codeTimes', () => {
  const sentAt = 1_000_000;

  it('counts down from the full life of a fresh code with resend locked', () => {
    expect(codeTimes(sentAt, sentAt)).toEqual({
      secondsLeft: CODE_TTL_MS / 1000,
      resendInMs: RESEND_AFTER_MS,
    });
  });

  it('picks up where a reused code is, not from the start', () => {
    expect(codeTimes(sentAt, sentAt + 30_000)).toEqual({
      secondsLeft: CODE_TTL_MS / 1000 - 30,
      resendInMs: RESEND_AFTER_MS - 30_000,
    });
  });

  it('unlocks resend after a minute and never goes below zero', () => {
    expect(codeTimes(sentAt, sentAt + CODE_TTL_MS + 5_000)).toEqual({
      secondsLeft: 0,
      resendInMs: 0,
    });
  });
});
