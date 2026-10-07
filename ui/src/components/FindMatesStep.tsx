import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FindMatesSheet from '@/components/FindMatesSheet';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useContactsFinder } from '@/hooks/useContactsFinder';
import { findMatesSeenKey, showFindMatesStep } from '@/lib/contactMatch';

/**
 * "Find your mates" right after sign-up: once the welcome cards are closed (`after`), before the
 * notifications page and the tips, so no two full-screen pages ever stack. Once per account on
 * this device, for an account made in the last day, on builds and with the switch that have it.
 * The choice is made once, when the cards close; `onSettled(true)` lets the next page through.
 */
export default function FindMatesStep({
  userId,
  createdAt,
  after,
  onSettled,
}: {
  userId: string;
  /** When the account was made (the auth user's created_at). */
  createdAt: string | undefined;
  /** The page before this one is out of the way. */
  after: boolean;
  onSettled: (settled: boolean) => void;
}): React.JSX.Element | null {
  const { dark } = useAppTheme();
  const available = useContactsFinder();
  const [state, setState] = useState<'waiting' | 'open' | 'done'>('waiting');

  useEffect(() => {
    if (!after || state !== 'waiting') return;
    let cancelled = false;
    AsyncStorage.getItem(findMatesSeenKey(userId))
      .catch(() => null)
      .then((seen) => {
        if (cancelled) return;
        const show = showFindMatesStep({
          available,
          createdAt,
          seen: seen === '1',
          now: Date.now(),
        });
        setState(show ? 'open' : 'done');
      });
    return () => {
      cancelled = true;
    };
  }, [after, state, userId, createdAt, available]);

  useEffect(() => {
    onSettled(state === 'done');
  }, [state, onSettled]);

  if (state !== 'open') return null;
  const close = () => {
    setState('done');
    // Failing to save only means the step shows once more.
    AsyncStorage.setItem(findMatesSeenKey(userId), '1').catch(() => {});
  };
  return <FindMatesSheet visible mode="welcome" onClose={close} dark={dark} />;
}
