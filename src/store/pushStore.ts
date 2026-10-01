import { create } from 'zustand';
import { registerPushToken } from '@/api';
import { requestPushPermission } from '@/lib/push';
import { Sentry } from '@/lib/sentry';

interface PushState {
  registered: boolean;
  /** Link this device's token to the signed-in user (no-op without permission). */
  register: () => Promise<void>;
  /** Show the OS prompt, then register if allowed. */
  requestAndRegister: () => Promise<void>;
  reset: () => void;
}

export const usePushStore = create<PushState>((set, get) => ({
  registered: false,

  register: async () => {
    const { error } = await registerPushToken();
    if (error) {
      console.log('[pushStore] register failed', error.message);
      Sentry.captureException(error, { tags: { flow: 'push', action: 'register' } });
      return;
    }
    set({ registered: true });
  },

  requestAndRegister: async () => {
    if (await requestPushPermission()) await get().register();
  },

  reset: () => set({ registered: false }),
}));
