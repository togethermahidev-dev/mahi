import { useEffect, useRef } from 'react';
import { onPushOpened, type PushData } from '@/lib/push';
import { useNotificationsStore } from '@/store';
import { track } from '@/lib/analytics';

export interface PushRoutes {
  openProfile: (userId: string) => void;
  openNotifications: () => void;
  openCamera: () => void;
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
        if (data.route === 'profile' && data.user_id) routesRef.current.openProfile(data.user_id);
        else if (data.route === 'camera') routesRef.current.openCamera();
        else routesRef.current.openNotifications();
      }),
    []
  );
}
