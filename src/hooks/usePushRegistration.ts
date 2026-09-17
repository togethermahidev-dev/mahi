import { useEffect } from 'react';
import { Alert } from 'react-native';
import { getPushPermission, markPushPrompted, onPushTokenChange, wasPushPrompted } from '@/lib/push';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAuthStore, usePushStore } from '@/store';

/**
 * Links this device to the signed-in user for pushes. Asks once per device, with an
 * explanation, before the OS prompt; re-registers when the OS rotates the token.
 */
export function usePushRegistration(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const promptEnabled = useFeatureFlag('push-core');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const { register, requestAndRegister } = usePushStore.getState();

    (async () => {
      const permission = await getPushPermission();
      if (cancelled) return;
      if (permission === 'granted') return register();
      if (permission !== 'undetermined' || !promptEnabled || (await wasPushPrompted())) return;
      if (cancelled) return;
      await markPushPrompted();
      Alert.alert(
        "Don't miss a tag",
        'Friends will tag you to get you training. Turn on notifications so you know when you have 48 hours to post.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Turn on', onPress: () => void requestAndRegister() },
        ]
      );
    })();

    const unsubscribe = onPushTokenChange(() => void register());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId, promptEnabled]);
}
