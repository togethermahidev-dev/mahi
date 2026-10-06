/**
 * Push notifications — device side only (permission, Expo token, taps).
 * The server decides what to send and when; see supabase/functions/send-push.
 * When Mahi asks for the permission is decided in ./pushPrimer.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushPermission } from './pushPrimer';
import type { PushData } from './pushRoute';

// Device-wide, not per account: the phone's permission belongs to the phone.
const PRIMER_ANSWERED_KEY = '@mahi:push_primer_answered';
const NUDGE_DISMISSED_KEY = '@mahi:push_nudge_dismissed_through';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function isGranted(status: Notifications.NotificationPermissionsStatus): boolean {
  return status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** What the phone says about notifications for Mahi — never prompts. */
export async function getPushPermission(): Promise<PushPermission> {
  const status = await Notifications.getPermissionsAsync();
  if (isGranted(status)) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** Shows the OS prompt. Resolves true when pushes are allowed. */
export async function requestPushPermission(): Promise<boolean> {
  return isGranted(await Notifications.requestPermissionsAsync());
}

/** Whether Mahi's notifications page has been answered on this device (Continue, or Android's back). */
export async function wasPushPrimerAnswered(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRIMER_ANSWERED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPushPrimerAnswered(): Promise<void> {
  try {
    await AsyncStorage.setItem(PRIMER_ANSWERED_KEY, '1');
  } catch {
    // Only means the page may show once more.
  }
}

/** The tags the camera's "turn on notifications" line was dismissed for (see nudgeDismissMark). */
export async function getPushNudgeDismissed(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(NUDGE_DISMISSED_KEY);
  } catch {
    return null;
  }
}

export async function markPushNudgeDismissed(through: string): Promise<void> {
  try {
    await AsyncStorage.setItem(NUDGE_DISMISSED_KEY, through);
  } catch {
    // Only means the line may show again for the same tag.
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
  Notifications.getLastNotificationResponseAsync()
    .then(handle)
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
