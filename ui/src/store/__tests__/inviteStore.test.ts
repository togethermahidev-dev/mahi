/**
 * Claiming an invite, only once the person has said yes (the sign-up card, or Accept on the
 * sheet a signed-in person sees). A refusal (used, ended, your own, not valid, an older
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

const claimed = {
  data: { inviter: { id: 'u1', username: 'sam' }, expires_at: null, tag: false },
  error: null,
};

describe('consent: nothing is claimed until the person has said yes', () => {
  it('a link that arrives while signed in is never claimed on its own', async () => {
    mockClaim.mockResolvedValue(claimed);
    expect(await useInviteStore.getState().claimPending()).toBe(false);
    expect(mockClaim).not.toHaveBeenCalled();
    expect(useInviteStore.getState().pendingToken).toBe('ABC234');
  });

  it('Accept claims it, once', async () => {
    mockClaim.mockResolvedValue(claimed);
    expect(await useInviteStore.getState().accept()).toBe(true);
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(mockClaim).toHaveBeenCalledWith('ABC234');
    expect(useInviteStore.getState().pendingToken).toBeNull();
    expect(useToastStore.getState().message).toBe('You and @sam follow each other now.');
  });

  it('Not now lets the invite go without claiming it', async () => {
    useInviteStore.getState().decline();
    expect(useInviteStore.getState().pendingToken).toBeNull();
    expect(useInviteStore.getState().preview).toBeNull();
    expect(await useInviteStore.getState().claimPending()).toBe(false);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('after sign-up with the invite card shown, it is claimed as before', async () => {
    mockClaim.mockResolvedValue(claimed);
    useInviteStore.getState().confirm('ABC234');
    expect(await useInviteStore.getState().claimPending()).toBe(true);
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('a yes to one invite does not carry to a different link', async () => {
    mockClaim.mockResolvedValue(claimed);
    useInviteStore.getState().confirm('ABC234');
    await useInviteStore.getState().setPending('XYZ789');
    expect(await useInviteStore.getState().claimPending()).toBe(false);
    expect(mockClaim).not.toHaveBeenCalled();
  });
});

describe('claimPending', () => {
  beforeEach(() => useInviteStore.getState().confirm('ABC234'));

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
      useInviteStore.getState().confirm('ABC234');
      mockClaim.mockResolvedValue({ data: null, error: new Error(message) });
      await useInviteStore.getState().claimPending();
      expect(useInviteStore.getState().pendingToken).toBeNull();
      expect(useToastStore.getState().action).toBeNull();
    }
  });
});
