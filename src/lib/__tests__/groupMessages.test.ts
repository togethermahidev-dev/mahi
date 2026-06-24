import { groupMessagesByDate, type GroupedRow } from '@/lib/groupMessages';
import type { Database } from '@/types';

type MsgRow = Database['public']['Tables']['messages']['Row'];

/**
 * Build a messages Row with sane defaults. `created_at` and `sender_id`
 * are the only fields the grouping logic actually reads.
 */
function msg(partial: Partial<MsgRow> & { created_at: string }): MsgRow {
  return {
    id: partial.id ?? `m_${partial.created_at}_${partial.sender_id ?? 'a'}`,
    content: partial.content ?? 'hi',
    conversation_id: partial.conversation_id ?? 'c1',
    sender_id: partial.sender_id ?? 'a',
    created_at: partial.created_at,
  };
}

// Anchor "now" so date-relative labels (Today / Yesterday / weekday) are
// deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-24T12:00:00'); // Wednesday (local time)

function isoDaysAgo(days: number, hour = 9, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

const headers = (rows: GroupedRow[]): string[] =>
  rows
    .filter((r): r is Extract<GroupedRow, { type: 'header' }> => r.type === 'header')
    .map((r) => r.label);

const messages = (rows: GroupedRow[]) =>
  rows.filter((r): r is Extract<GroupedRow, { type: 'message' }> => r.type === 'message');

describe('groupMessagesByDate', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns an empty array for no messages', () => {
    expect(groupMessagesByDate([])).toEqual([]);
  });

  it('emits exactly one header per distinct day, in order', () => {
    const rows = groupMessagesByDate([
      msg({ created_at: isoDaysAgo(2, 9) }),
      msg({ created_at: isoDaysAgo(2, 10) }),
      msg({ created_at: isoDaysAgo(0, 8) }),
      msg({ created_at: isoDaysAgo(0, 9) }),
    ]);

    // 2 headers + 4 messages
    expect(rows).toHaveLength(6);
    const hdrs = headers(rows);
    expect(hdrs).toHaveLength(2);
    // Most recent day's label is "Today"; oldest is a weekday name (Monday).
    expect(hdrs[1]).toBe('Today');
    expect(hdrs[0]).toBe('Monday');
  });

  it('labels the previous day as "Yesterday"', () => {
    const rows = groupMessagesByDate([msg({ created_at: isoDaysAgo(1) })]);
    expect(headers(rows)).toEqual(['Yesterday']);
  });

  it('collapses showTime for same-sender messages within the 5-minute window', () => {
    const base = new Date(NOW);
    base.setHours(10, 0, 0, 0);
    const t0 = base.toISOString();
    const t3 = new Date(base.getTime() + 3 * 60_000).toISOString(); // +3min, same sender
    const t9 = new Date(base.getTime() + 9 * 60_000).toISOString(); // +6min after t3 → outside window

    const rows = groupMessagesByDate([
      msg({ created_at: t0, sender_id: 'a' }),
      msg({ created_at: t3, sender_id: 'a' }),
      msg({ created_at: t9, sender_id: 'a' }),
    ]);

    const msgs = messages(rows);
    // First msg is followed within 5min by same sender → time hidden.
    expect(msgs[0].showTime).toBe(false);
    // Second msg's neighbour (t9) is >5min away → time shown.
    expect(msgs[1].showTime).toBe(true);
    // Last msg always shows time (no next message).
    expect(msgs[2].showTime).toBe(true);
  });

  it('keeps showTime when the next message is from a different sender', () => {
    const base = new Date(NOW);
    base.setHours(11, 0, 0, 0);
    const t0 = base.toISOString();
    const t1 = new Date(base.getTime() + 60_000).toISOString(); // +1min, different sender

    const rows = groupMessagesByDate([
      msg({ created_at: t0, sender_id: 'a' }),
      msg({ created_at: t1, sender_id: 'b' }),
    ]);

    const msgs = messages(rows);
    // Within window but different sender → time still shown.
    expect(msgs[0].showTime).toBe(true);
  });

  it('does not collapse showTime across a day boundary even within 5 minutes', () => {
    // 23:58 yesterday and 00:01 today are <5min apart but on different days.
    const lateYesterday = new Date(NOW);
    lateYesterday.setDate(lateYesterday.getDate() - 1);
    lateYesterday.setHours(23, 58, 0, 0);

    const earlyToday = new Date(lateYesterday.getTime() + 3 * 60_000); // 00:01 today

    const rows = groupMessagesByDate([
      msg({ created_at: lateYesterday.toISOString(), sender_id: 'a' }),
      msg({ created_at: earlyToday.toISOString(), sender_id: 'a' }),
    ]);

    // Two day-headers because the day key differs.
    expect(headers(rows)).toEqual(['Yesterday', 'Today']);
    // Cross-day neighbour → showTime stays true.
    expect(messages(rows)[0].showTime).toBe(true);
  });
});
