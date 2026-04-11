import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  type NotificationWithActor,
} from '@/api';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Channel registry — outside store state so channel changes don't trigger renders
const notifChannels = new Map<string, RealtimeChannel>();

interface NotificationsState {
  items:       NotificationWithActor[];
  unreadCount: number;
  isSyncing:   boolean;

  sync:        (userId: string) => Promise<void>;
  markRead:    (notificationId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  /** Subscribe to new notifications arriving in real-time. */
  subscribe:   (userId: string) => void;
  /** Tear down the notifications subscription. */
  unsubscribe: (userId: string) => void;
  reset:       () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items:       [],
  unreadCount: 0,
  isSyncing:   false,

  sync: async (userId: string) => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    const [itemsResult, unreadResult] = await Promise.all([
      getNotifications(userId),
      getUnreadCount(userId),
    ]);

    if (itemsResult.data)           set({ items: itemsResult.data });
    if (unreadResult.data != null)  set({ unreadCount: unreadResult.data });
    set({ isSyncing: false });
  },

  markRead: async (notificationId: string) => {
    const { items, unreadCount } = get();
    const target = items.find((n) => n.id === notificationId);
    if (!target) return;

    const prevIsRead = target.is_read;
    const prevUnreadCount = unreadCount;

    // Optimistic: flip this one to read, decrement count only if it was unread
    set((state) => ({
      items: state.items.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n,
      ),
      unreadCount: prevIsRead ? state.unreadCount : state.unreadCount - 1,
    }));

    const { error } = await markAsRead(notificationId);
    if (error) {
      // Rollback on failure
      set((state) => ({
        items: state.items.map((n) =>
          n.id === notificationId ? { ...n, is_read: prevIsRead } : n,
        ),
        unreadCount: prevUnreadCount,
      }));
    }
  },

  markAllRead: async (userId: string) => {
    const { items, unreadCount } = get();
    const prevItems = items;
    const prevUnreadCount = unreadCount;

    // Optimistic: flip all to read, zero the count
    set((state) => ({
      items: state.items.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));

    const { error } = await markAllAsRead(userId);
    if (error) {
      // Rollback on failure
      set({ items: prevItems, unreadCount: prevUnreadCount });
    }
  },

  subscribe: (userId: string) => {
    const key = `notifications:${userId}`;
    if (notifChannels.has(key)) return; // already subscribed

    type NotifRow = {
      id: string;
      user_id: string;
      actor_id: string;
      type: string;
      post_id: string | null;
      comment_id: string | null;
      is_read: boolean;
      created_at: string;
    };
    type NotifPayload = { new: NotifRow };

    const handleInsert = async (payload: NotifPayload) => {
      // Dedupe: ignore rows we already have (e.g. from an in-flight sync)
      if (get().items.some((n) => n.id === payload.new.id)) return;

      // Fetch the actor profile separately — the realtime payload is the raw row
      const { data: actor } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', payload.new.actor_id)
        .single();

      // If actor lookup fails (deleted user, RLS, etc.), skip rather than fabricate
      if (!actor) return;

      const notification = { ...payload.new, actor } as NotificationWithActor;

      set((state) => ({
        items: [notification, ...state.items],
        unreadCount: state.unreadCount + 1,
      }));
    };

    const ch = supabase
      .channel(key)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, handleInsert)
      .subscribe();

    notifChannels.set(key, ch);
  },

  unsubscribe: (userId: string) => {
    const key = `notifications:${userId}`;
    const ch = notifChannels.get(key);
    if (ch) { supabase.removeChannel(ch); notifChannels.delete(key); }
  },

  reset: () => {
    // Tear down all active channels
    notifChannels.forEach((ch) => supabase.removeChannel(ch));
    notifChannels.clear();
    set({ items: [], unreadCount: 0, isSyncing: false });
  },
}));
