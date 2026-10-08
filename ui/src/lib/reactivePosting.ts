/**
 * Reactive posting (founder's rule, 2026-10-01): your very first post, then only to answer a
 * friend's tag while it's open (48 hours). The server enforces it ('reactive posting: not
 * tagged'); this only decides what the camera shows. Times are on the server's clock (`serverOffsetMs`).
 */
import { msLeft } from './countdown';

type Tag = { expires_at: string };

/** A post now answers a tag (and earns 1 Mahi point). */
export function answersATag(openTags: Tag[], serverOffsetMs: number, deviceNow = Date.now()) {
  return openTags.some((t) => msLeft(t.expires_at, serverOffsetMs, deviceNow) > 0);
}

/** 'loading' until it's known; never guessed from old data. */
export function reactivePostingGate(input: {
  /** null = not read yet. */
  hasPosted: boolean | null;
  tagsLoaded: boolean;
  openTags: Tag[];
  serverOffsetMs: number;
  deviceNow?: number;
}): 'loading' | 'open' | 'closed' {
  if (input.hasPosted === false) return 'open';
  if (input.hasPosted === null || !input.tagsLoaded) return 'loading';
  return answersATag(input.openTags, input.serverOffsetMs, input.deviceNow) ? 'open' : 'closed';
}

/**
 * Whether your first workout is posted. The server's permanent `profiles.has_posted_before` mark
 * decides (deleting every post never gives it back); a post of yours in the feed counts too, so
 * the camera knows straight after your first post. null until both are read.
 */
export function hasPostedBefore(input: {
  /** `profiles.has_posted_before`; null while the profile loads. */
  profileMark: boolean | null;
  feedLoaded: boolean;
  /** The feed's `unlockedUntil`: set while any post of yours exists. */
  unlockedUntil: string | null;
}): boolean | null {
  if (input.profileMark === true) return true;
  if (input.feedLoaded && input.unlockedUntil !== null) return true;
  if (input.profileMark === null || !input.feedLoaded) return null;
  return false;
}
