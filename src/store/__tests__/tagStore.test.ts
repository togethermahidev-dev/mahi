/**
 * Open tags expire, so the feed waits for this session's first server read before it words the
 * lock — `openTagsLoaded` says when that read has landed.
 */
jest.mock('@/api', () => ({
  getOpenTags: jest.fn(),
  getTagRules: jest.fn(),
  getTaggableFriends: jest.fn(),
}));

import { getOpenTags } from '@/api';
import { useTagStore } from '@/store/tagStore';

const mockGetOpenTags = getOpenTags as jest.Mock;

beforeEach(() => {
  useTagStore.getState().reset();
  mockGetOpenTags.mockReset();
});

describe('openTagsLoaded', () => {
  it('is false until the first read lands, then true', async () => {
    expect(useTagStore.getState().openTagsLoaded).toBe(false);
    mockGetOpenTags.mockResolvedValue({ data: [], error: null });
    await useTagStore.getState().syncOpenTags();
    expect(useTagStore.getState().openTagsLoaded).toBe(true);
  });

  it('stays false when the read fails', async () => {
    mockGetOpenTags.mockResolvedValue({ data: null, error: new Error('offline') });
    await useTagStore.getState().syncOpenTags();
    expect(useTagStore.getState().openTagsLoaded).toBe(false);
  });

  it('goes back to false on reset (sign-out)', async () => {
    mockGetOpenTags.mockResolvedValue({ data: [], error: null });
    await useTagStore.getState().syncOpenTags();
    useTagStore.getState().reset();
    expect(useTagStore.getState().openTagsLoaded).toBe(false);
  });
});
