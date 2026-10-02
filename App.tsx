import React, { useState, useCallback, useEffect } from 'react';
import { AppState, LogBox, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Suppress known harmless development warnings
LogBox.ignoreLogs(['Tried to register two views with the same name', 'RNDateTimePicker']);
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import SplashScreenComponent from '@/screens/SplashScreen';
import WelcomeScreen from '@/screens/WelcomeScreen';
import InAppAnimationScreen from '@/screens/InAppAnimationScreen';
import HorizontalNavigator from '@/screens/HorizontalNavigator';
import { supabase } from '@/lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useAuthStore,
  useUserStore,
  useFeedStore,
  useMessagesStore,
  useConversationStore,
  useNotificationsStore,
  useProfilePostsStore,
  useFollowStore,
  useSuggestStore,
  useBlockStore,
  useSocialStore,
  usePushStore,
  useTagStore,
  useInviteStore,
  useChromeStore,
} from '@/store';
import { rehydrateTheme } from '@/store/themeStore';
import { useIdentityStore } from '@/store/identityStore';
import { usePurchasesStore } from '@/store/purchasesStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useInviteLink } from '@/hooks/useInviteLink';
import { getAppGate, getProfile, signOut, updateTimezone } from '@/api';
import { gateVerdict, type AppGate } from '@/lib/versionGate';
import { APP_BUILD, APP_VERSION } from '@/lib/appBuild';
import UpdateRequiredScreen from '@/components/UpdateRequiredScreen';
import WelcomeCards from '@/components/WelcomeCards';
import PushPrimer from '@/components/PushPrimer';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost } from '@/components/ToastHost';

// Prevent the native OS splash from auto-hiding before our custom one is drawn.
SplashScreen.preventAutoHideAsync();

/**
 * Keep the profile's time zone in step with the phone's, so the server dates
 * posts in the user's local day. Fire-and-forget: a failure only means the
 * server keeps using the previous zone.
 */
function syncTimezone(userId: string, current: string): void {
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!deviceTz || deviceTz === current) return;
  updateTimezone(userId, deviceTz).then(({ error }) => {
    if (error) Sentry.captureException(error, { tags: { flow: 'auth', action: 'updateTimezone' } });
  });
}

/**
 * Hydrate all per-user state after a session is established. Shared by the
 * cold-start getSession() path and the onAuthStateChange path so the
 * profile-fetch + store-sync logic lives in exactly one place. Each store sync
 * guards against duplicate/concurrent work, so calling this twice on cold start
 * (getSession + INITIAL_SESSION event) is safe.
 */
async function hydrateForUser(userId: string): Promise<void> {
  try {
    const { data } = await getProfile(userId);
    if (data) {
      if (data.is_banned) {
        signOut().catch(() => {});
        return;
      }
      useUserStore.getState().setProfile(data);
      syncTimezone(userId, data.timezone);
    }
  } catch (err) {
    // Never let the profile fetch reject silently (e.g. revoked/expired session).
    console.error('[App] hydrateForUser getProfile failed', err);
    Sentry.captureException(err, { tags: { flow: 'auth', action: 'getProfile' } });
  }

  // Background-hydrate stores (non-blocking). Each guards against duplicate work. The feed and
  // the open tags also drive the camera's posting gate, so they load here, not on a screen.
  useFeedStore.getState().sync();
  useTagStore.getState().syncOpenTags();
  useMessagesStore.getState().sync();
  useNotificationsStore.getState().sync(userId);
  useBlockStore.getState().sync(userId);
}

export default function App(): React.JSX.Element {
  const [splashDone, setSplashDone] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  // The welcome cards are out of the way, so the notifications page may show.
  const [welcomeSettled, setWelcomeSettled] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const { session, isLoading, setSession, setIsLoading } = useAuthStore();

  // Invite links: one that opened the app, one that arrives while it's running, and the
  // claim once there's an account to claim it for.
  useInviteLink();
  const [blockingGate, setBlockingGate] = useState<AppGate | null>(null);
  const { colorScheme } = useAppTheme();

  // Restore persisted session on cold start + handle all auth events (sign in,
  // sign out, token refresh). autoRefreshToken + persistSession are already
  // enabled on the supabase client via AsyncStorage in src/lib/supabase.ts.
  useEffect(() => {
    // Rehydrate theme preference before any screen renders
    rehydrateTheme();

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setIsLoading(false);
      // Load the profile and hydrate stores on cold-start restore
      if (s?.user) hydrateForUser(s.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setIsLoading(false);

      if (s?.user) {
        hydrateForUser(s.user.id);
        Sentry.setUser({ id: s.user.id, email: s.user.email });
        posthog.identify(s.user.id, { email: s.user.email ?? null });
        // Re-evaluate feature flags for the now-identified user.
        posthog.reloadFeatureFlagsAsync().catch(() => {});
      } else {
        useUserStore.getState().reset();
        useFeedStore.getState().reset();
        useMessagesStore.getState().reset();
        useConversationStore.getState().reset();
        useNotificationsStore.getState().reset();
        useProfilePostsStore.getState().reset();
        useFollowStore.getState().reset();
        useSuggestStore.getState().reset();
        useBlockStore.getState().reset();
        useSocialStore.getState().reset();
        usePushStore.getState().reset();
        useTagStore.getState().reset();
        useInviteStore.getState().reset();
        useChromeStore.getState().reset();
        useIdentityStore.getState().reset();
        // Logs RevenueCat out only if it was configured (flag `purchases`); otherwise a no-op.
        usePurchasesStore.getState().reset();
        Sentry.setUser(null);
        posthog.reset();
      }
    });

    // One foreground listener for what expires: the feed's lock and the open tags.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !useAuthStore.getState().user) return;
      useFeedStore.getState().sync(true);
      useTagStore.getState().syncOpenTags();
    });

    return () => {
      subscription.unsubscribe();
      foreground.remove();
    };
  }, []);

  // Update gate: checked on every launch, signed in or not. A failed or slow check never
  // blocks, and the gate stays switched off on the server until the owner turns it on.
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    getAppGate(Platform.OS).then(({ data }) => {
      if (gateVerdict({ version: APP_VERSION, build: APP_BUILD }, data) === 'blocked')
        setBlockingGate(data);
    });
  }, []);

  // Reset camera gate on sign-out so returning users always see the animation
  useEffect(() => {
    if (!session) {
      setShowCamera(false);
      setWelcomeSettled(false);
    }
  }, [session]);

  const onSplashLayout = useCallback(() => {
    SplashScreen.hideAsync().then(() => setSplashDone(true));
  }, []);

  let content: React.JSX.Element;

  // Keep the custom splash on screen while fonts load or session is restoring
  if (!splashDone || !fontsLoaded || isLoading) {
    content = (
      <>
        <SplashScreenComponent onLayout={onSplashLayout} />
        <StatusBar style="light" />
      </>
    );
  } else if (blockingGate) {
    content = (
      <>
        <UpdateRequiredScreen
          minimum={blockingGate.min_version}
          storeUrl={blockingGate.store_url}
          message={blockingGate.message}
        />
        <StatusBar style="auto" />
      </>
    );
  } else if (session && !showCamera) {
    content = (
      <>
        <InAppAnimationScreen onComplete={() => setShowCamera(true)} />
        <StatusBar style="light" />
      </>
    );
  } else if (session && showCamera) {
    content = (
      <>
        <HorizontalNavigator />
        {/* One-time welcome cards, after the intro animation, over the app. */}
        <WelcomeCards userId={session.user.id} onSettled={setWelcomeSettled} />
        {/* One-time "turn on notifications" page, once the cards are out of the way. */}
        <PushPrimer welcomeSettled={welcomeSettled} />
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </>
    );
  } else {
    content = (
      <>
        {/* onAuthComplete is a no-op — onAuthStateChange above drives the
            screen transition. The prop exists for WelcomeScreen's exit animation. */}
        <WelcomeScreen onAuthComplete={() => {}} />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          {content}
          <ToastHost />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
