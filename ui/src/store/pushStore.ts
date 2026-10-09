import { create } from 'zustand';
import { registerPushToken } from '@/api';
import {
  getPushPermission,
  markPushPrimerAnswered,
  requestPushPermission,
  wasPushPrimerAnswered,
} from '@/lib/push';
import type { PushPermission } from '@/lib/pushPrimer';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';

interface PushState {
  registered: boolean;
  /** What the phone says about notifications for Mahi; null until first read. */
  permission: PushPermission | null;
  /** Whether the notifications page has been answered on this device; null until first read. */
  primerAnswered: boolean | null;
  /** Read the phone's permission and what this device remembers; register when allowed. */
  refresh: () => Promise<void>;
  /** Link this device's token to the signed-in user (no-op without permission). */
  register: () => Promise<void>;
  /** Show the OS prompt, then register if allowed. */
  requestAndRegister: () => Promise<void>;
  /** The notifications page's two buttons. Turn on shows the OS prompt; the page closes after it. */
  answerPrimer: (allow: boolean) => Promise<void>;
  reset: () => void;
}

export const usePushStore = create<PushState>((set, get) => ({
  registered: false,
  permission: null,
  primerAnswered: null,

  refresh: async () => {
    try {
      const [permission, primerAnswered] = await Promise.all([
        getPushPermission(),
        wasPushPrimerAnswered(),
      ]);
      set({ permission, primerAnswered });
      if (permission === 'granted' && !get().registered) await get().register();
    } catch (err) {
      // The page and the banner simply don't show until the phone can be read.
      reportError(err, { flow: 'push', action: 'refresh' });
    }
  },

  register: async () => {
    const { error } = await registerPushToken();
    if (error) {
      console.log('[pushStore] register failed', error.message);
      reportError(error, {
        flow: 'push',
        action: 'register',
        extra: { rpc: 'register_push_token' },
      });
      return;
    }
    set({ registered: true });
  },

  requestAndRegister: async () => {
    const granted = await requestPushPermission();
    set({ permission: await getPushPermission() });
    if (granted) await get().register();
  },

  answerPrimer: async (allow) => {
    // Remembered first: the phone's question sends the app to the back and front again, and
    // the refresh that follows must already find the page answered.
    await markPushPrimerAnswered();
    let granted = false;
    try {
      if (allow) granted = await requestPushPermission();
      set({ permission: await getPushPermission() });
    } catch (err) {
      reportError(err, { flow: 'push', action: 'answerPrimer', extra: { allow } });
    }
    // Whatever happened, the page has had its answer and closes.
    set({ primerAnswered: true });
    track('push_primer_answered', { choice: allow ? 'allow' : 'not_now', granted });
    if (granted) await get().register();
  },

  // Signing out forgets the link to the account, not what the phone itself allows.
  reset: () => set({ registered: false }),
}));
