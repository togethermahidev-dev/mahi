/**
 * Reporting and your own standing — the words and choices, kept free of native imports so they
 * can be unit-tested. Contract: docs/moderation.md.
 */
import type { ReportReason, ReportResult, Standing } from '@/api/moderation';

/** The reasons people pick from, in order. The app shows the label and sends the code.
 * `inappropriate_content` is left out: the server keeps it only for apps already on phones. */
export const REPORT_REASONS: readonly { code: ReportReason; label: string }[] = [
  { code: 'spam', label: 'Spam' },
  { code: 'harassment', label: 'Bullying or harassment' },
  { code: 'hate_speech', label: 'Hate speech' },
  { code: 'sexual_content', label: 'Nudity or sexual content' },
  { code: 'violence', label: 'Violence or threats' },
  { code: 'self_harm', label: 'Self-harm or suicide' },
  { code: 'scam', label: 'Scam or fraud' },
  { code: 'impersonation', label: 'Pretending to be someone else' },
  { code: 'underage', label: 'May be under 13' },
  { code: 'other', label: 'Something else' },
];

/** The toast after a report is sent. */
export function reportToast(result: { data: ReportResult | null; error: Error | null }): string {
  if (result.error || !result.data) return 'Couldn’t send your report. Try again.';
  if (result.data.already_reported) return 'You’ve already reported this.';
  return 'Thanks. We’ll take a look.';
}

/** Split a list into pages (Android's dialog holds three buttons: two choices and "More"). */
export function reasonPages<T>(items: readonly T[], perPage: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}

export type StandingNotice = {
  kind: 'warning' | 'suspended' | 'banned';
  title: string;
  body: string;
};

function formatUntil(iso: string, now: Date): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  const day = d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** What to tell someone about their standing, or null when there's nothing to say. A ban or
 * suspension comes first; otherwise the newest unseen warning. */
export function standingNotice(standing: Standing, now: Date = new Date()): StandingNotice | null {
  const why = standing.reason ? `Reason: ${standing.reason}` : '';
  if (standing.status === 'banned') {
    return {
      kind: 'banned',
      title: 'Your account has been closed',
      body: [
        'Mahi closed your account for breaking the community rules. You can’t post, comment or tag anyone.',
        why,
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }
  if (standing.status === 'suspended') {
    const until = standing.until ? ` until ${formatUntil(standing.until, now)}` : '';
    return {
      kind: 'suspended',
      title: 'Your account is paused',
      body: [`You can’t post, comment or tag anyone${until}.`, why].filter(Boolean).join('\n\n'),
    };
  }
  const newest = [...standing.warnings].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )[0];
  if (!newest) return null;
  return { kind: 'warning', title: 'A warning from Mahi', body: newest.reason };
}
