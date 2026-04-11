import { useEffect } from 'react';
import { useAuthStore, useNotificationsStore } from '@/store';
import type { NotificationWithActor } from '@/api';

export interface UseNotificationsResult {
  items:       NotificationWithActor[];
  unreadCount: number;
  isLoading:   boolean;
  refresh:     () => Promise<void>;
  markRead:    (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** Thin wrapper over useNotificationsStore that owns the realtime subscription lifecycle. */
export function useNotifications(): UseNotificationsResult {
  const userId      = useAuthStore((s) => s.user?.id);
  const items       = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const isSyncing   = useNotificationsStore((s) => s.isSyncing);

  useEffect(() => {
    if (!userId) return;
    useNotificationsStore.getState().subscribe(userId);
    return () => { useNotificationsStore.getState().unsubscribe(userId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    items,
    unreadCount,
    isLoading:   isSyncing && items.length === 0,
    refresh:     async () => { if (userId) await useNotificationsStore.getState().sync(userId); },
    markRead:    (id) => useNotificationsStore.getState().markRead(id),
    markAllRead: async () => { if (userId) await useNotificationsStore.getState().markAllRead(userId); },
  };
}
