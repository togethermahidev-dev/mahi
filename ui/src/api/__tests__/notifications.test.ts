/**
 * The unread number on the notifications badge. The list hides notifications from anyone blocked
 * either way (NotificationsScreen's blockedSet), so the badge must not count them either: a blocked
 * person can't make it go up.
 */
type Call = { table: string; ops: [string, ...unknown[]][] };
const calls: Call[] = [];
let blocks: { blockedByMe: string[]; blockedMe: string[] } = { blockedByMe: [], blockedMe: [] };

function query(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const result = () => {
    if (table === 'notifications') return { count: 3, error: null };
    const blockedMe = call.ops.some(([op, col]) => op === 'eq' && col === 'blocked_id');
    return blockedMe
      ? { data: blocks.blockedMe.map((id) => ({ blocker_id: id })), error: null }
      : { data: blocks.blockedByMe.map((id) => ({ blocked_id: id })), error: null };
  };
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'not', 'in']) {
    builder[op] = (...args: unknown[]) => {
      call.ops.push([op, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return builder;
}

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));

import { getUnreadCount } from '@/api/notifications';

const countQuery = () => calls.find((c) => c.table === 'notifications');

beforeEach(() => {
  calls.length = 0;
  blocks = { blockedByMe: [], blockedMe: [] };
});

describe('getUnreadCount', () => {
  it('leaves out notifications from people blocked either way', async () => {
    blocks = { blockedByMe: ['troll'], blockedMe: ['ex'] };
    const res = await getUnreadCount('me');
    expect(res).toEqual({ data: 3, error: null });
    const ops = countQuery()?.ops ?? [];
    expect(ops).toContainEqual(['eq', 'user_id', 'me']);
    expect(ops).toContainEqual(['eq', 'is_read', false]);
    expect(ops).toContainEqual(['not', 'actor_id', 'in', '(troll,ex)']);
  });

  it('counts everything unread when nobody is blocked', async () => {
    const res = await getUnreadCount('me');
    expect(res).toEqual({ data: 3, error: null });
    expect(countQuery()?.ops.some(([op]) => op === 'not')).toBe(false);
  });
});
