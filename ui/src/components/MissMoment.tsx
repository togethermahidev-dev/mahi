import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PointCelebration from '@/components/PointCelebration';
import { useNotificationsStore, useUserStore } from '@/store';
import { useCoachStore } from '@/store/coachStore';
import { missMoment } from '@/lib/mahiPoints';
import { missSeenKey, missToShow, parseSeenMisses, seenMissesAfter } from '@/lib/missMoment';

/**
 * The moment after a miss (usability walkthrough, 2026-10-07): "You missed @sam's tag", in the
 * point celebration's style, once per miss. It waits until nothing else is up (welcome cards, a
 * tip, a sheet, the celebration: anything that blocks the one-time tips), and while it shows, the
 * tips and the tag reminder wait for it. Which misses were shown is kept on the phone (a seen mark
 * never expires); the misses themselves are read fresh with the notifications.
 */
export default function MissMoment({ userId }: { userId: string }): React.JSX.Element {
  const items = useNotificationsStore((s) => s.items);
  const loaded = useNotificationsStore((s) => s.loaded);
  const best = useUserStore((s) => s.profile?.streak_highest ?? null);
  const profileLoaded = useUserStore((s) => s.profile !== null);
  const quiet = useCoachStore((s) => s.blocks === 0 && s.current === null && !s.composing);
  // null until this account's seen list has been read.
  const [seen, setSeen] = useState<string[] | null>(null);
  const [showing, setShowing] = useState<{ id: string; tagger: string } | null>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(missSeenKey(userId))
      .then((raw) => {
        if (live) setSeen(parseSeenMisses(raw));
      })
      .catch(() => {
        if (live) setSeen([]);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (showing || seen === null || !loaded || !profileLoaded || !quiet) return;
    const miss = missToShow(items, seen);
    if (miss) setShowing(miss);
  }, [showing, seen, loaded, profileLoaded, quiet, items]);

  const close = () => {
    if (!showing) return;
    const next = seenMissesAfter(seen ?? [], showing.id);
    setSeen(next);
    setShowing(null);
    // Failing to save only means this miss shows once more.
    AsyncStorage.setItem(missSeenKey(userId), JSON.stringify(next)).catch(() => {});
  };

  return (
    <PointCelebration
      content={showing ? missMoment({ tagger: showing.tagger, best }) : null}
      onClose={close}
    />
  );
}
