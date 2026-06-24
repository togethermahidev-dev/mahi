import React, { useState, useCallback, useEffect } from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Suppress known harmless development warnings
LogBox.ignoreLogs([
  'Tried to register two views with the same name',
  'RNDateTimePicker',
]);
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  JosefinSans_400Regular_Italic,
  JosefinSans_600SemiBold,
  JosefinSans_700Bold,
} from '@expo-google-fonts/josefin-sans';

import SplashScreenComponent from '@/screens/SplashScreen';
import WelcomeScreen from '@/screens/WelcomeScreen';
import InAppAnimationScreen from '@/screens/InAppAnimationScreen';
import HorizontalNavigator from '@/screens/HorizontalNavigator';
import { supabase } from '@/lib/supabase';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore, useUserStore, useFeedStore, useMessagesStore, useNotificationsStore, useProfilePostsStore, useFollowStore, useBlockStore, useSocialStore } from '@/store';
import { rehydrateTheme } from '@/store/themeStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { getProfile, signOut } from '@/api';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost } from '@/components/ToastHost';

// Prevent the native OS splash from auto-hiding before our custom one is drawn.
SplashScreen.preventAutoHideAsync();

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
      if (data.is_banned) { signOut().catch(() => {}); return; }
      useUserStore.getState().setProfile(data);
    }
  } catch (err) {
    // Never let the profile fetch reject silently (e.g. revoked/expired session).
    console.error('[App] hydrateForUser getProfile failed', err);
    Sentry.captureException(err, { tags: { flow: 'auth', action: 'getProfile' } });
  }

  // Background-hydrate stores (non-blocking). Each guards against duplicate work.
  useFeedStore.getState().sync();
  useMessagesStore.getState().sync(userId);
  useNotificationsStore.getState().sync(userId);
  useBlockStore.getState().sync(userId);
}

export default function App(): React.JSX.Element {
  const [splashDone, setSplashDone] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [fontsLoaded] = useFonts({
    JosefinSans_400Regular_Italic,
    JosefinSans_600SemiBold,
    JosefinSans_700Bold,
  });

  const { session, isLoading, setSession, setIsLoading } = useAuthStore();
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
      // Load profile (+ streak) and hydrate stores on cold-start restore
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
      } else {
        useUserStore.getState().reset();
        useFeedStore.getState().reset();
        useMessagesStore.getState().reset();
        useNotificationsStore.getState().reset();
        useProfilePostsStore.getState().reset();
        useFollowStore.getState().reset();
        useBlockStore.getState().reset();
        useSocialStore.getState().reset();
        Sentry.setUser(null);
        posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Reset camera gate on sign-out so returning users always see the animation
  useEffect(() => {
    if (!session) setShowCamera(false);
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        {content}
        <ToastHost />
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
