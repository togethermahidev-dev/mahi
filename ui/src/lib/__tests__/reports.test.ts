import { REPORT_REASONS, reportToast, reasonPages, standingNotice } from '@/lib/reports';

describe('report reasons', () => {
  it('lists the reasons people pick, without the old catch-all', () => {
    expect(REPORT_REASONS.map((r) => r.code)).toEqual([
      'spam',
      'harassment',
      'hate_speech',
      'sexual_content',
      'violence',
      'self_harm',
      'scam',
      'impersonation',
      'underage',
      'other',
    ]);
    expect(REPORT_REASONS[1].label).toBe('Bullying or harassment');
    expect(REPORT_REASONS[8].label).toBe('May be under 13');
  });
});

describe('reportToast', () => {
  it('thanks on a new report', () => {
    expect(reportToast({ data: { report_id: 'r', already_reported: false }, error: null })).toBe(
      'Thanks. We’ll take a look.'
    );
  });
  it('says so on a repeat', () => {
    expect(reportToast({ data: { report_id: 'r', already_reported: true }, error: null })).toBe(
      'You’ve already reported this.'
    );
  });
  it('asks to try again on an error', () => {
    expect(reportToast({ data: null, error: new Error('x') })).toBe(
      'Couldn’t send your report. Try again.'
    );
  });
});

describe('reasonPages (Android shows two choices and "More" per dialog)', () => {
  it('splits into pages of two', () => {
    expect(reasonPages(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });
});

describe('standingNotice', () => {
  const now = new Date('2026-10-06T10:00:00Z');
  it('is null when all is fine', () => {
    expect(
      standingNotice({ status: 'ok', until: null, reason: null, warnings: [] }, now)
    ).toBeNull();
  });
  it('shows the newest warning reason', () => {
    const n = standingNotice(
      {
        status: 'ok',
        until: null,
        reason: null,
        warnings: [
          { id: '1', reason: 'Old', created_at: '2026-10-01T00:00:00Z' },
          { id: '2', reason: 'Be kind in comments', created_at: '2026-10-05T00:00:00Z' },
        ],
      },
      now
    );
    expect(n).toEqual({
      kind: 'warning',
      title: 'A warning from Mahi',
      body: 'Be kind in comments',
    });
  });
  it('gives the end of a suspension', () => {
    const n = standingNotice(
      { status: 'suspended', until: '2026-10-09T10:00:00Z', reason: 'Spam', warnings: [] },
      now
    );
    expect(n?.kind).toBe('suspended');
    expect(n?.title).toBe('Your account is paused');
    expect(n?.body).toContain('Spam');
    expect(n?.body).toMatch(/until /);
  });
  it('says banned plainly', () => {
    const n = standingNotice(
      { status: 'banned', until: null, reason: 'Hate speech', warnings: [] },
      now
    );
    expect(n?.kind).toBe('banned');
    expect(n?.body).toContain('Hate speech');
  });
});
