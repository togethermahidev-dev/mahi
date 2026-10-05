import { useEffect, useRef } from 'react';
import { onPushOpened } from '@/lib/push';
import { pushDestination, type PushData } from '@/lib/pushRoute';
import { useNotificationsStore } from '@/store';
import { track } from '@/lib/analytics';

export interface PushRoutes {
  openProfile: (userId: string) => void;
  openNotifications: () => void;
  openCamera: () => void;
  openMessages: () => void;
}

/** Sends a tapped push to the screen it is about, and marks its notification read. */
export function usePushRouting(routes: PushRoutes): void {
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  });

  useEffect(
    () =>
      onPushOpened((data: PushData) => {
        track('push_opened', { route: data.route ?? 'post' });
        if (data.notification_id) {
          useNotificationsStore.getState().markRead(data.notification_id);
        }
        const to = pushDestination(data);
        if (to === 'profile' && data.user_id) routesRef.current.openProfile(data.user_id);
        else if (to === 'camera') routesRef.current.openCamera();
        else if (to === 'messages') routesRef.current.openMessages();
        else routesRef.current.openNotifications();
      }),
    []
  );
}
