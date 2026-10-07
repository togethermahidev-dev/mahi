/**
 * Claiming an invite after sign-up. A refusal (used, ended, your own, not valid, an older
 * account) says why and lets the invite go; anything else (no connection) keeps it, so Try again
 * has something to try with.
 */
jest.mock('@/api', () => ({
  claimInvite: jest.fn(),
  getInvitePreview: jest.fn(),
  getOpenTags: jest.fn().mockResolvedValue({ data: [], error: null }),
  getTagRules: jest.fn(),
  getTaggableFriends: jest.fn(),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn(), Sentry: { addBreadcrumb: jest.fn() } }));

import { claimInvite, getInvitePreview } from '@/api';
import { reportError } from '@/lib/sentry';
import { useInviteStore } from '@/store/inviteStore';
import { useToastStore } from '@/store/toastStore';

const mockClaim = claimInvite as jest.Mock;
const mockPreview = getInvitePreview as jest.Mock;

beforeEach(async () => {
  useInviteStore.getState().reset();
  useToastStore.getState().reset();
  mockClaim.mockReset();
  mockPreview.mockReset();
  (reportError as jest.Mock).mockClear();
  mockPreview.mockResolvedValue({ data: { username: 'sam' }, error: null });
  await useInviteStore.getState().setPending('ABC234');
});

describe('claimPending', () => {
  it('a dropped connection keeps the invite and offers Try again', async () => {
    mockClaim.mockResolvedValue({ data: null, error: new Error('Network request failed') });
    expect(await useInviteStore.getState().claimPending()).toBe(false);
    expect(useInviteStore.getState().pendingToken).toBe('ABC234');
    expect(useInviteStore.getState().preview).toEqual({ username: 'sam' });
    const toast = useToastStore.getState();
    expect(toast.message).toBe('Couldn’t connect you with @sam. Try again.');
    expect(toast.action?.label).toBe('Try again');
  });

  it('a dropped connection is reported to Sentry', async () => {
    const error = new Error('Network request failed');
    mockClaim.mockResolvedValue({ data: null, error });
    await useInviteStore.getState().claimPending();
    expect(reportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ flow: 'invites', action: 'claimInvite' })
    );
  });

  it('a server refusal is expected, not reported', async () => {
    mockClaim.mockResolvedValue({ data: null, error: new Error('that invite has expired') });
    await useInviteStore.getState().claimPending();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('Try again claims the same invite', async () => {
    mockClaim.mockResolvedValueOnce({ data: null, error: new Error('Network request failed') });
    await useInviteStore.getState().claimPending();
    mockClaim.mockResolvedValueOnce({
      data: { inviter: { id: 'u1', username: 'sam' }, expires_at: null },
      error: null,
    });
    useToastStore.getState().action?.onPress();
    await new Promise((r) => setImmediate(r));
    expect(mockClaim).toHaveBeenCalledTimes(2);
    expect(mockClaim).toHaveBeenLastCalledWith('ABC234');
    expect(useInviteStore.getState().pendingToken).toBeNull();
  });

  it('a server refusal says why and lets the invite go', async () => {
    for (const message of [
      'that invite has been used',
      'that invite has expired',
      'that invite is your own',
      'that invite is not valid',
      'invites are for new accounts',
    ]) {
      await useInviteStore.getState().setPending('ABC234');
      mockClaim.mockResolvedValue({ data: null, error: new Error(message) });
      await useInviteStore.getState().claimPending();
      expect(useInviteStore.getState().pendingToken).toBeNull();
      expect(useToastStore.getState().action).toBeNull();
    }
  });
});
