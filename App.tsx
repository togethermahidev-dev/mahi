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
import MainShell from '@/screens/MainShell';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store';
import { Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';

// Prevent the native OS splash from auto-hiding before our custom one is drawn.
SplashScreen.preventAutoHideAsync();

export default function App(): React.JSX.Element {
  const [splashDone, setSplashDone] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [fontsLoaded] = useFonts({
    JosefinSans_400Regular_Italic,
    JosefinSans_600SemiBold,
    JosefinSans_700Bold,
  });

  const { session, isLoading, setSession, setIsLoading } = useAuthStore();

  // Restore persisted session on cold start + handle all auth events (sign in,
  // sign out, token refresh). autoRefreshToken + persistSession are already
  // enabled on the supabase client via AsyncStorage in src/lib/supabase.ts.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[Screen] Auth event:', event, s ? `user=${s.user.email}` : 'signed out');
      setSession(s);
      setIsLoading(false);

      // Keep Sentry & PostHog in sync with auth state
      if (s?.user) {
        Sentry.setUser({ id: s.user.id, email: s.user.email });
        posthog.identify(s.user.id, { email: s.user.email ?? null });
      } else {
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

  // Keep the custom splash on screen while fonts load or session is restoring
  if (!splashDone || !fontsLoaded || isLoading) {
    console.log('[Screen] SplashScreen — splashDone:', splashDone, 'fontsLoaded:', fontsLoaded, 'isLoading:', isLoading);
    return (
      <>
        <SplashScreenComponent onLayout={onSplashLayout} />
        <StatusBar style="light" />
      </>
    );
  }

  if (session && !showCamera) {
    console.log('[Screen] InAppAnimationScreen — user:', session.user.email);
    return (
      <>
        <InAppAnimationScreen onComplete={() => setShowCamera(true)} />
        <StatusBar style="light" />
      </>
    );
  }

  if (session && showCamera) {
    console.log('[Screen] MainShell — user:', session.user.email);
    return (
      <>
        <MainShell />
        <StatusBar style="light" />
      </>
    );
  }

  console.log('[Screen] WelcomeScreen — unauthenticated');
  return (
    <>
      {/* onAuthComplete is a no-op — onAuthStateChange above drives the
          screen transition. The prop exists for WelcomeScreen's exit animation. */}
      <WelcomeScreen onAuthComplete={() => {}} />
      <StatusBar style="auto" />
    </>
  );
}
