// Plain, sentence-case words for every code the moderation server uses (docs/moderation.md).

export const REASONS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Bullying or harassment',
  hate_speech: 'Hate speech',
  sexual_content: 'Nudity or sexual content',
  violence: 'Violence or threats',
  self_harm: 'Self-harm or suicide',
  scam: 'Scam or fraud',
  impersonation: 'Pretending to be someone else',
  underage: 'May be under 13',
  inappropriate_content: "Something else that's not OK",
  other: 'Something else',
};

export const STATUSES: Record<string, string> = {
  open: 'New',
  reviewing: 'Being looked at',
  actioned: 'Action taken',
  dismissed: 'Dismissed',
};

export const TARGET_TYPES: Record<string, string> = {
  user: 'Person',
  post: 'Post',
  comment: 'Comment',
  message: 'Message',
  report: 'Report',
};

export const AUDIT_ACTIONS: Record<string, string> = {
  review_report: 'Took a report',
  dismiss_report: 'Dismissed a report',
  hide_post: 'Hid a post',
  unhide_post: 'Showed a post again',
  remove_comment: 'Removed a comment',
  restore_comment: 'Restored a comment',
  remove_message: 'Removed a message',
  restore_message: 'Restored a message',
  warn_user: 'Warned',
  suspend_user: 'Suspended',
  ban_user: 'Banned',
  unban_user: 'Lifted bans and suspensions',
  ai_hide_post: 'Hid a post (automatic check)',
  ai_remove_comment: 'Removed a comment (automatic check)',
};

export const SANCTION_KINDS: Record<string, string> = {
  warning: 'Warning',
  suspension: 'Suspension',
  ban: 'Ban',
};

export const SCAN_DECISIONS: Record<string, string> = {
  clean: 'Nothing found',
  flag: 'Flagged for a look',
  block: 'Flagged as serious',
};

export const SOURCES: Record<string, string> = { user: 'A person', ai: 'Automatic check' };

/** The label for a code, or the code itself if the server sends something new. */
export function label(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '—';
  return map[code] ?? code;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}
