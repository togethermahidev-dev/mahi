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

describe('serverOffsetMs', () => {
  const deviceNow = Date.parse('2026-10-01T12:00:00.000Z');
  const MINUTE = 60 * 1000;

  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(deviceNow));
  afterEach(() => jest.restoreAllMocks());

  it('keeps the last known offset when a read returns no tags', async () => {
    // The server clock rides on each tag row, so a read with no rows carries no clock.
    mockGetOpenTags.mockResolvedValue({
      data: [{ server_now: new Date(deviceNow + MINUTE).toISOString() }],
      error: null,
    });
    await useTagStore.getState().syncOpenTags();
    expect(useTagStore.getState().serverOffsetMs).toBe(MINUTE);

    mockGetOpenTags.mockResolvedValue({ data: [], error: null });
    await useTagStore.getState().syncOpenTags();
    expect(useTagStore.getState().serverOffsetMs).toBe(MINUTE);
  });
});
