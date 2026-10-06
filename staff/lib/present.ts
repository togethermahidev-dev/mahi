// How the portal words and groups things: what each action does and who sees it, which actions are
// "safe" (undoable, nobody punished) and which are "serious", plain times, a person's standing and
// the audit log as sentences. Pure, no packages, so node's test runner checks it (present.test.ts).

import { canDo, type StaffAction, type StaffRole } from './guard.ts';
import type { AuditRow, Person, Sanction } from './types.ts';

export type ActionInfo = {
  /** The button's words, sentence case. */
  label: string;
  /** What happens, one sentence. */
  explain: string;
  /** Who notices, one short phrase. */
  seenBy: string;
  group: 'safe' | 'serious';
  /** The note is shown to the person (warnings, suspensions, bans); otherwise only staff read it. */
  noteSeenByPerson: boolean;
};

export const ACTION_INFO: Record<StaffAction, ActionInfo> = {
  review_report: {
    label: 'Take this report',
    explain: 'Marks it as being looked at, so other staff know you have it.',
    seenBy: 'Only staff',
    group: 'safe',
    noteSeenByPerson: false,
  },
  dismiss_report: {
    label: 'Dismiss report',
    explain: 'Nothing wrong. Closes this report only; nothing changes for anyone.',
    seenBy: 'Only staff',
    group: 'safe',
    noteSeenByPerson: false,
  },
  unhide_post: {
    label: 'Show post again',
    explain: 'The post goes back in the feed and on their profile.',
    seenBy: 'Everyone who could see it before',
    group: 'safe',
    noteSeenByPerson: false,
  },
  restore_comment: {
    label: 'Restore comment',
    explain: 'The comment shows again under the post.',
    seenBy: 'Everyone who could see it before',
    group: 'safe',
    noteSeenByPerson: false,
  },
  restore_message: {
    label: 'Restore message',
    explain: 'The message shows again in the conversation.',
    seenBy: 'Both people in the conversation',
    group: 'safe',
    noteSeenByPerson: false,
  },
  unban_user: {
    label: 'Lift ban and suspensions',
    explain: 'Ends every ban and suspension on this person now. They can post again.',
    seenBy: 'The person, and everyone (their posts come back)',
    group: 'safe',
    noteSeenByPerson: false,
  },
  hide_post: {
    label: 'Hide post',
    explain: "Nobody but staff sees the post. It's kept, so it can be shown again. Closes every open report on it.",
    seenBy: 'Everyone: the post disappears',
    group: 'serious',
    noteSeenByPerson: false,
  },
  remove_comment: {
    label: 'Remove comment',
    explain: "Nobody but staff sees the comment. It's kept, so it can be restored. Closes every open report on it.",
    seenBy: 'Everyone: the comment disappears',
    group: 'serious',
    noteSeenByPerson: false,
  },
  remove_message: {
    label: 'Remove message',
    explain: "Neither person sees the message any more. It's kept, so it can be restored. Closes every open report on it.",
    seenBy: 'Both people in the conversation',
    group: 'serious',
    noteSeenByPerson: false,
  },
  warn_user: {
    label: 'Warn',
    explain: 'They see a warning in the app with your reason. Nothing else changes.',
    seenBy: 'The person (your reason is shown to them)',
    group: 'serious',
    noteSeenByPerson: true,
  },
  suspend_user: {
    label: 'Suspend',
    explain:
      "For the days you choose they can't post, comment or get pushes, and nobody sees their posts. They're signed out on every phone. It ends by itself.",
    seenBy: 'The person (your reason is shown to them) and everyone (their posts disappear)',
    group: 'serious',
    noteSeenByPerson: true,
  },
  ban_user: {
    label: 'Ban',
    explain:
      "Until an admin lifts it, they can't post, comment or get pushes, and nobody sees their posts. They're signed out on every phone.",
    seenBy: 'The person (your reason is shown to them) and everyone (their posts disappear)',
    group: 'serious',
    noteSeenByPerson: true,
  },
};

/** Split the actions a page offers into safe and serious, dropping what this role may not do. */
export function groupActions(actions: StaffAction[], role: StaffRole | null): { safe: StaffAction[]; serious: StaffAction[] } {
  const allowed = actions.filter((a) => canDo(role, a));
  return {
    safe: allowed.filter((a) => ACTION_INFO[a].group === 'safe'),
    serious: allowed.filter((a) => ACTION_INFO[a].group === 'serious'),
  };
}

export function formatDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}

/** "just now", "2 min ago", "3 hours ago", "yesterday", "3 days ago", then the date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

/** Midnight today in London, as an ISO time (for "reports today"). */
export function startOfTodayLondon(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Time since London's midnight, taken off now.
  const sinceMidnight = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + (now % 1000);
  return new Date(now - sinceMidnight).toISOString();
}

/** Count items by a key, biggest first. */
export function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export type Standing = { kind: 'ok' | 'warned' | 'suspended' | 'banned' | 'blocked'; label: string };

function running(s: Sanction, now: number): boolean {
  if (s.lifted_at || s.kind === 'warning') return false;
  return s.kind === 'ban' || (!!s.ends_at && Date.parse(s.ends_at) > now);
}

/** Where a person stands, from their sanctions and the profile's is_banned switch. */
export function standingOf(sanctions: Sanction[], isBanned: boolean, now = Date.now()): Standing {
  const live = sanctions.filter((s) => running(s, now));
  if (live.some((s) => s.kind === 'ban')) return { kind: 'banned', label: 'Banned' };
  if (live.length) {
    const ends = Math.max(...live.map((s) => Date.parse(s.ends_at as string)));
    return { kind: 'suspended', label: `Suspended until ${formatDate(ends)}` };
  }
  if (isBanned) return { kind: 'blocked', label: 'Blocked' };
  if (sanctions.some((s) => s.kind === 'warning')) return { kind: 'warned', label: 'Warned before' };
  return { kind: 'ok', label: 'In good standing' };
}

const VERBS: Record<string, string> = {
  review_report: 'took',
  dismiss_report: 'dismissed',
  hide_post: 'hid',
  ai_hide_post: 'hid',
  unhide_post: 'showed again',
  remove_comment: 'removed',
  ai_remove_comment: 'removed',
  restore_comment: 'restored',
  remove_message: 'removed',
  restore_message: 'restored',
  warn_user: 'warned',
  suspend_user: 'suspended',
  ban_user: 'banned',
  unban_user: 'lifted bans and suspensions on',
};

const THINGS: Record<string, string> = { post: 'a post', comment: 'a comment', message: 'a message', report: 'a report' };

/**
 * "@joe hid a post by @sam", "@joe suspended @sam until 9 Oct 2026". `names` maps staff and
 * person ids to usernames; `owner` is the username of whoever made the post, comment or message.
 */
export function auditSentence(row: AuditRow, ctx: { names: Map<string, string>; owner?: string | null }): string {
  const staffName = row.staff_id ? ctx.names.get(row.staff_id) : null;
  const actor = row.staff_id ? (staffName ? `@${staffName}` : 'A staff member') : 'The automatic check';
  const verb = VERBS[row.action];
  if (!verb) return `${actor} did ${row.action.replace(/_/g, ' ')}`;
  let object: string;
  if (row.target_type === 'user') {
    const n = ctx.names.get(row.target_id);
    object = n ? `@${n}` : 'someone';
  } else {
    object = THINGS[row.target_type] ?? 'something';
    if (ctx.owner) object += ` by @${ctx.owner}`;
  }
  const endsAt = typeof row.metadata?.ends_at === 'string' ? ` until ${formatDate(row.metadata.ends_at)}` : '';
  return `${actor} ${verb} ${object}${endsAt}`;
}

/** Does a report match the search words? Looks at both people's names and what was reported. */
export function matchesSearch(
  item: { owner: Person | null; reporter: Person | null; snapshot: Record<string, unknown> | null },
  query: string,
): boolean {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (!q) return true;
  const s = item.snapshot ?? {};
  const haystack = [
    item.owner?.username,
    item.owner?.display_name,
    item.reporter?.username,
    s.content,
    s.caption,
    s.username,
    s.display_name,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}
