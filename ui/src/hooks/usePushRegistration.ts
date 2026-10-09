import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onPushTokenChange } from '@/lib/push';
import { useAuthStore, usePushStore } from '@/store';

/**
 * Links this device to the signed-in user for pushes: reads the phone's permission on sign-in
 * and each time the app comes back to the front (someone may have just switched notifications
 * on in Settings), registers when allowed, and re-registers when the OS rotates the token.
 * Asking for the permission is the notifications page's job (usePushPrimer), and after Not now the feed banner's (PushBanner).
 */
export function usePushRegistration(): void {
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) return;
    const { refresh, register } = usePushStore.getState();
    void refresh();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = onPushTokenChange(() => void register());
    return () => {
      foreground.remove();
      unsubscribe();
    };
  }, [userId]);
}
