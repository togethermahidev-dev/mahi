import { useEffect, useRef, useState } from 'react';
import { getProfileAbout, setBio, type ProfileAbout } from '@/api';
import { useAuthStore, useFollowStore } from '@/store';
import { reportError } from '@/lib/sentry';
import { cleanBio } from '@/lib/profileAbout';

/** A profile's two counts, as the server last gave them. */
export interface ProfileCounts {
  followers: number;
  following: number;
}

export interface UseProfileAboutResult {
  /**
   * `null`: the server hasn't answered this time (draw a dash, never a made-up number).
   * `undefined`: no counts line (the switch is off, or the server keeps them back: a block).
   */
  counts: ProfileCounts | null | undefined;
  /**
   * The bio and whether their lists are open to you. `null` until the server has answered, and
   * on a server without bios yet (before migration 20261010110000_profile_bio): no bio line.
   */
  about: ProfileAbout | null;
  /**
   * Save your own bio: shown at once, then the server's saved answer; a failure puts the old one
   * back and returns the error for the screen to say.
   */
  saveBio: (text: string) => Promise<{ error: Error | null }>;
}

/**
 * What a profile's header shows under the name (switch `profile-bio-and-counts`): follower and
 * following counts, and the bio. Both are asked for again each time the profile comes on screen
 * (`active`), held in memory only, and never kept on the phone. Your own counts also listen for
 * follow changes while your profile is on screen; someone else's move with your own follow taps,
 * as the follow button already does.
 */
export function useProfileAbout(
  userId: string | undefined,
  enabled: boolean,
  active = true
): UseProfileAboutResult {
  const viewerId = useAuthStore((s) => s.user?.id);
  const stored = useFollowStore((s) => (userId ? s.counts[userId] : undefined));
  /** Whose counts the server has answered for since this screen opened. */
  const [countsFor, setCountsFor] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ userId: string; about: ProfileAbout } | null>(null);
  /** Bumped by every save, so a slower read (or an older save) never overwrites a newer bio. */
  const saves = useRef(0);

  useEffect(() => {
    if (!enabled || !active || !userId || !viewerId) return;
    let live = true;
    const savesAtStart = saves.current;

    void useFollowStore
      .getState()
      .loadFollowData(viewerId, userId)
      .then((ok) => {
        if (live && ok) setCountsFor(userId);
      });

    getProfileAbout(userId)
      .then(({ data, error }) => {
        if (!live || saves.current !== savesAtStart) return;
        if (error) {
          // What is on screen stays; the next time the profile opens asks again.
          reportError(error, {
            flow: 'profile',
            action: 'about',
            level: 'warning',
            extra: { userId, rpc: 'get_profile_about' },
          });
          return;
        }
        setAnswer(data ? { userId, about: data } : null);
      })
      .catch((e) => {
        if (live) reportError(e, { flow: 'profile', action: 'about', extra: { userId } });
      });

    // Your own profile: a new follower moves the number while you look at it.
    const stop =
      userId === viewerId
        ? useFollowStore.getState().subscribeToFollows(userId, viewerId)
        : undefined;
    return () => {
      live = false;
      stop?.();
    };
  }, [enabled, active, userId, viewerId]);

  const counts: ProfileCounts | null | undefined = !enabled
    ? undefined
    : countsFor !== userId
      ? null
      : stored
        ? { followers: stored.follower_count, following: stored.following_count }
        : undefined;

  const current = enabled && answer && answer.userId === userId ? answer : null;

  const saveBio = async (text: string): Promise<{ error: Error | null }> => {
    // Only ever your own, and only once the server has said bios exist here.
    if (!current || !userId || userId !== viewerId) {
      return { error: new Error('No bio to save to') };
    }
    const mine = ++saves.current;
    const wanted = cleanBio(text);
    setAnswer({ userId, about: { ...current.about, bio: wanted || null } });

    const { data, error } = await setBio(wanted);
    if (error || !data) {
      const saveError = error ?? new Error('set_bio returned no answer');
      console.log('[useProfileAbout] saveBio failed |', saveError.message);
      if (saves.current === mine) setAnswer(current);
      return { error: saveError };
    }
    if (saves.current === mine) {
      setAnswer({ userId, about: { ...current.about, bio: data.bio } });
    }
    return { error: null };
  };

  return { counts, about: current?.about ?? null, saveBio };
}
