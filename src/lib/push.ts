/**
 * Push notifications — device side only (permission, Expo token, taps).
 * The server decides what to send and when; see supabase/functions/send-push.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** What the server puts in a push's `data`. */
export type PushData = {
  route?: 'post' | 'profile';
  post_id?: string | null;
  user_id?: string;
  notification_id?: string;
};

const PROMPTED_KEY = '@mahi:push_prompted';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function isGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return (
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** 'granted' | 'denied' | 'undetermined' — never prompts. */
export async function getPushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  const status = await Notifications.getPermissionsAsync();
  if (isGranted(status)) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** Shows the OS prompt. Resolves true when pushes are allowed. */
export async function requestPushPermission(): Promise<boolean> {
  return isGranted(await Notifications.requestPermissionsAsync());
}

/** Whether this device has already shown Mahi's explainer before the OS prompt. */
export async function wasPushPrompted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPTED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPushPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    // Only means the explainer may show again.
  }
}

/** This device's Expo push token, or null without permission or on failure. */
export async function getPushToken(): Promise<string | null> {
  try {
    if ((await getPushPermission()) !== 'granted') return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    return (await Notifications.getExpoPushTokenAsync()).data;
  } catch (err) {
    console.log('[push] token unavailable', err);
    return null;
  }
}

export function pushPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** Fires when the OS rotates this device's push token. Returns an unsubscribe. */
export function onPushTokenChange(cb: () => void): () => void {
  const sub = Notifications.addPushTokenListener(() => cb());
  return () => sub.remove();
}

/**
 * Fires when the user taps a push — including the one that launched the app.
 * Returns an unsubscribe.
 */
export function onPushOpened(cb: (data: PushData) => void): () => void {
  const seen = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (seen.has(id)) return;
    seen.add(id);
    cb((response.notification.request.content.data ?? {}) as PushData);
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
