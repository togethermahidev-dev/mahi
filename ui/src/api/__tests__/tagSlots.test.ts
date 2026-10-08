const rpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { respondTagInvite } from '@/api/tagSlots';

// Accepting a tag request no longer makes you follow each other (20261008170000_private_accounts):
// the answer says where the follows stand, so the app can offer Follow back / Accept their follow.
describe('respondTagInvite', () => {
  it('returns where the follows stand after accepting', async () => {
    const answer = { you_follow_them: false, they_follow_you: true, their_follow_request: true };
    rpc.mockResolvedValue({ data: answer, error: null });
    await expect(respondTagInvite('c1', true)).resolves.toEqual({ data: answer, error: null });
    expect(rpc).toHaveBeenLastCalledWith('respond_tag_invite', {
      p_challenge: 'c1',
      p_accept: true,
    });
  });

  it('an older server that answers nothing: no fields, no error', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(respondTagInvite('c1', false)).resolves.toEqual({ data: {}, error: null });
  });

  it('a refusal comes back as an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'no longer open' } });
    const { data, error } = await respondTagInvite('c1', true);
    expect(data).toBeNull();
    expect(error?.message).toBe('no longer open');
  });
});
