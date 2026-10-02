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
