/**
 * Settings → Security and privacy → Privacy controls (20261008170000_private_accounts): a change shows at once, then the
 * server's saved answer replaces it (private + Everyone is stored as Followers); a refusal puts
 * the old choice back.
 */
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
const setAccountControls = jest.fn();
jest.mock('@/api', () => ({
  getProfile: jest.fn(),
  setAccountControls: (...a: unknown[]) => setAccountControls(...a),
}));

import { useUserStore } from '@/store/userStore';

const profile = {
  id: 'me',
  username: 'me',
  display_name: null,
  first_name: null,
  last_name: null,
  fitness_goals: null,
  avatar_url: null,
  streak_current: 0,
  streak_highest: 0,
  is_private: false,
  posts_visibility: 'everyone' as const,
  tag_permission: 'approve' as const,
  privacy_chosen_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useUserStore.setState({ profile });
});

it('shows the change at once, then the server’s saved controls', async () => {
  let finish!: (v: unknown) => void;
  setAccountControls.mockReturnValue(new Promise((resolve) => (finish = resolve)));

  const pending = useUserStore.getState().saveControls({ is_private: true });
  expect(useUserStore.getState().profile?.is_private).toBe(true);
  expect(setAccountControls).toHaveBeenCalledWith({ is_private: true });

  finish({
    data: {
      is_private: true,
      posts_visibility: 'followers',
      tag_permission: 'approve',
      accepted_requests: 0,
    },
    error: null,
  });
  const { error } = await pending;
  expect(error).toBeNull();
  const p = useUserStore.getState().profile;
  expect(p?.posts_visibility).toBe('followers');
  // Choosing marks the onboarding choice as made, so that screen never shows again.
  expect(p?.privacy_chosen_at).not.toBeNull();
});

it('says how many waiting requests going public accepted', async () => {
  useUserStore.setState({ profile: { ...profile, is_private: true } });
  setAccountControls.mockResolvedValue({
    data: {
      is_private: false,
      posts_visibility: 'everyone',
      tag_permission: 'approve',
      accepted_requests: 3,
    },
    error: null,
  });
  const { acceptedRequests } = await useUserStore.getState().saveControls({ is_private: false });
  expect(acceptedRequests).toBe(3);
});

it('a refusal puts the old choice back', async () => {
  setAccountControls.mockResolvedValue({ data: null, error: new Error('offline') });
  const { error } = await useUserStore.getState().saveControls({ tag_permission: 'friends' });
  expect(error?.message).toBe('offline');
  expect(useUserStore.getState().profile?.tag_permission).toBe('approve');
  expect(useUserStore.getState().profile?.privacy_chosen_at).toBeNull();
});
