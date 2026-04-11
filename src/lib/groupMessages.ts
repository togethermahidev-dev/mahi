import type { Database } from '@/types';

type MsgRow = Database['public']['Tables']['messages']['Row'];

export type GroupedRow =
  | { type: 'header'; label: string; id: string }
  | { type: 'message'; msg: MsgRow; showTime: boolean };

const dayKey = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-CA');

function formatDayLabel(date: Date, todayKey: string): string {
  const key = date.toLocaleDateString('en-CA');
  if (key === todayKey) return 'Today';

  const today = new Date(todayKey + 'T00:00:00');
  const target = new Date(key + 'T00:00:00');
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );

  if (diffDays === 1) return 'Yesterday';
  if (diffDays >= 2 && diffDays <= 6) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }

  const currentYear = today.getFullYear();
  if (date.getFullYear() === currentYear) {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Groups oldest→newest messages into header + message rows with cluster-aware showTime. */
export function groupMessagesByDate(messages: MsgRow[]): GroupedRow[] {
  const rows: GroupedRow[] = [];
  const todayKey = new Date().toLocaleDateString('en-CA');
  let lastKey: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const key = dayKey(msg.created_at);

    if (key !== lastKey) {
      rows.push({
        type: 'header',
        id: 'header_' + key,
        label: formatDayLabel(new Date(msg.created_at), todayKey),
      });
      lastKey = key;
    }

    const next = messages[i + 1];
    let showTime = true;
    if (next) {
      const sameSender = next.sender_id === msg.sender_id;
      const sameDay = dayKey(next.created_at) === key;
      const withinWindow =
        new Date(next.created_at).getTime() -
          new Date(msg.created_at).getTime() <=
        300_000;
      if (sameSender && sameDay && withinWindow) showTime = false;
    }

    rows.push({ type: 'message', msg, showTime });
  }

  return rows;
}
