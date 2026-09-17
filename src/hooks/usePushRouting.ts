import { useEffect, useRef } from 'react';
import { onPushOpened, type PushData } from '@/lib/push';
import { useNotificationsStore } from '@/store';

export interface PushRoutes {
  openProfile: (userId: string) => void;
  openNotifications: () => void;
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
        if (data.notification_id) {
          useNotificationsStore.getState().markRead(data.notification_id);
        }
        if (data.route === 'profile' && data.user_id) routesRef.current.openProfile(data.user_id);
        else routesRef.current.openNotifications();
      }),
    []
  );
}
