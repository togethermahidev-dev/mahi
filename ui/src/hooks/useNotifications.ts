import { useEffect } from 'react';
import { useAuthStore, useNotificationsStore } from '@/store';
import type { NotificationWithActor } from '@/api';

export interface UseNotificationsResult {
  items: NotificationWithActor[];
  unreadCount: number;
  /** Nothing read yet this session (show a spinner, never "nothing here"). */
  isLoading: boolean;
  /** The read failed and nothing is on screen (show "Couldn't load…" with Try again). */
  failed: boolean;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** Thin wrapper over useNotificationsStore that owns the realtime subscription lifecycle. */
export function useNotifications(): UseNotificationsResult {
  const userId = useAuthStore((s) => s.user?.id);
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loaded = useNotificationsStore((s) => s.loaded);
  const error = useNotificationsStore((s) => s.error);

  useEffect(() => {
    if (!userId) return;
    useNotificationsStore.getState().subscribe(userId);
    return () => {
      useNotificationsStore.getState().unsubscribe(userId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    items,
    unreadCount,
    isLoading: !loaded && !error && items.length === 0,
    failed: error && items.length === 0,
    refresh: async () => {
      if (userId) await useNotificationsStore.getState().sync(userId);
    },
    markRead: (id) => useNotificationsStore.getState().markRead(id),
    markAllRead: async () => {
      if (userId) await useNotificationsStore.getState().markAllRead(userId);
    },
  };
}
