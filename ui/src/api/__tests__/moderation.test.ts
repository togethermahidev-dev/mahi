const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { reportContent, getMyStanding, markWarningsSeen } from '@/api/moderation';

beforeEach(() => rpc.mockReset());

describe('reportContent', () => {
  it.each([
    ['post', 'report_post', 'p_post_id'],
    ['comment', 'report_comment', 'p_comment_id'],
    ['user', 'report_user', 'p_user_id'],
  ] as const)('a %s calls %s', async (kind, fn, arg) => {
    rpc.mockResolvedValue({ data: { report_id: 'r1', already_reported: false }, error: null });
    const res = await reportContent(kind, 'id1', 'spam');
    expect(rpc).toHaveBeenCalledWith(fn, { [arg]: 'id1', p_reason: 'spam', p_details: null });
    expect(res).toEqual({ data: { report_id: 'r1', already_reported: false }, error: null });
  });

  it('passes an error through', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'too many reports today' } });
    const res = await reportContent('post', 'id1', 'spam');
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('too many reports today');
  });
});

describe('standing', () => {
  it('reads get_my_standing', async () => {
    const s = { status: 'ok', until: null, reason: null, warnings: [] };
    rpc.mockResolvedValue({ data: s, error: null });
    expect(await getMyStanding()).toEqual({ data: s, error: null });
    expect(rpc).toHaveBeenCalledWith('get_my_standing');
  });
  it('marks warnings seen', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await markWarningsSeen()).toEqual({ data: null, error: null });
    expect(rpc).toHaveBeenCalledWith('mark_warnings_seen');
  });
});
