/**
 * Why a locked feed is locked, from the feed read itself (owner, 2026-10-09: "if it's locked it'll
 * know surely?"). get_feed carries your open tags (20261009120000_feed_lock_reason), the same rows
 * as get_open_tags, so the locked panel and the camera don't wait on a second read. Pure, so it
 * runs under the node-only jest harness.
 */
import type { OpenTag } from '@/api/tags';

/** The feed's open tags; null when the server didn't send them (an older server: unknown). */
export function tagsFromFeed(raw: unknown): OpenTag[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (t): t is OpenTag =>
      !!t && typeof t.username === 'string' && typeof t.expires_at === 'string'
  );
}
