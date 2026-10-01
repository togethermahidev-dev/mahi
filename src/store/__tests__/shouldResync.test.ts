/**
 * Pure-logic tests for the profile-posts focus re-sync predicate.
 *
 * `@/api` is auto-mocked so importing `profilePostsStore` never pulls in the
 * real posts API (and therefore not `@/lib/supabase`, which loads RN-only
 * native modules that can't run in this node test environment).
 */
jest.mock('@/api', () => ({
  getUserPosts: jest.fn(),
}));

import { shouldResync } from '@/store/profilePostsStore';

const base = {
  isActive: true,
  isSyncing: false,
  postCount: 5,
  lastSyncedAt: 1_000_000,
  now: 1_000_000,
  ttlMs: 30_000,
};

describe('shouldResync', () => {
  it('re-syncs when active and the store is EMPTY (raced/empty first load)', () => {
    // This is the bug case: own profile, first sync returned nothing, swiping
    // back to profile must recover.
    expect(shouldResync({ ...base, postCount: 0 })).toBe(true);
  });

  it('does NOT re-sync when active with a FRESH, non-empty store', () => {
    expect(shouldResync({ ...base, postCount: 5, now: base.lastSyncedAt + 1 })).toBe(false);
  });

  it('re-syncs when the last sync is STALE (older than ttl)', () => {
    expect(shouldResync({ ...base, now: base.lastSyncedAt + base.ttlMs })).toBe(true);
  });

  it('does NOT re-sync when the panel is inactive', () => {
    expect(shouldResync({ ...base, isActive: false, postCount: 0 })).toBe(false);
  });

  it('does NOT re-sync while a sync is already in flight (concurrency guard)', () => {
    expect(shouldResync({ ...base, isSyncing: true, postCount: 0 })).toBe(false);
  });

  it('re-syncs when non-empty but never successfully synced (lastSyncedAt null)', () => {
    expect(shouldResync({ ...base, lastSyncedAt: null })).toBe(true);
  });
});
