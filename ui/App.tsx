import React, { useState, useCallback, useEffect } from 'react';
import { AppState, LogBox, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Suppress known harmless development warnings
LogBox.ignoreLogs(['Tried to register two views with the same name', 'RNDateTimePicker']);
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import SplashScreenComponent from '@/screens/SplashScreen';
import WelcomeScreen from '@/screens/WelcomeScreen';
import InAppAnimationScreen from '@/screens/InAppAnimationScreen';
import HorizontalNavigator from '@/screens/HorizontalNavigator';
import TabsNavigator from '@/screens/TabsNavigator';
import { nativeTabsAvailable } from '@/lib/nativeTabs';
import { hasNativeScreens } from '@/lib/screensModule';
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
import { useLiveTag } from '@/hooks/useLiveTag';
import { getAppGate, getProfile, signOut, updateTimezone } from '@/api';
import { gateVerdict, type AppGate } from '@/lib/versionGate';
import { APP_BUILD, APP_VERSION } from '@/lib/appBuild';
import UpdateRequiredScreen from '@/components/UpdateRequiredScreen';
import AccountStanding from '@/components/AccountStanding';
import WelcomeCards from '@/components/WelcomeCards';
import FindMatesStep from '@/components/FindMatesStep';
import MissMoment from '@/components/MissMoment';
import PushPrimer from '@/components/PushPrimer';
import { useCoachBlock } from '@/hooks/useCoachMarks';
import { reportError, Sentry } from '@/lib/sentry';
import { posthog } from '@/lib/posthog';
import { syncAnalyticsIdentity } from '@/lib/analytics';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastHost } from '@/components/ToastHost';

/** The phone's own tab bar on builds that have it (build 11+), else the swipe pages. */
function MainNavigator(): React.JSX.Element {
  return nativeTabsAvailable(Platform.OS, hasNativeScreens()) ? (
    <TabsNavigator />
  ) : (
    <HorizontalNavigator />
  );
}

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
    if (error) {
      reportError(error, {
        flow: 'auth',
        action: 'updateTimezone',
        extra: { timezone: deviceTz, previous: current },
      });
    }
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
    const { data, error } = await getProfile(userId);
    if (error) reportError(error, { flow: 'auth', action: 'getProfile', extra: { userId } });
    if (data) {
      if (data.is_banned) {
        signOut()
          .then(({ error: signOutError }) => {
            if (signOutError) reportError(signOutError, { flow: 'auth', action: 'signOutBanned' });
          })
          .catch((err) => reportError(err, { flow: 'auth', action: 'signOutBanned' }));
        return;
      }
      useUserStore.getState().setProfile(data);
      syncTimezone(userId, data.timezone);
    }
  } catch (err) {
    // Never let the profile fetch reject silently (e.g. revoked/expired session).
    console.error('[App] hydrateForUser getProfile failed', err);
    reportError(err, { flow: 'auth', action: 'getProfile', extra: { userId } });
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
  const [introDone, setIntroDone] = useState(false);
  // The welcome cards are out of the way, so the notifications page may show.
  const [welcomeSettled, setWelcomeSettled] = useState(false);
  // "Find your mates" after the cards (new accounts only); then the notifications page may show.
  const [findMatesSettled, setFindMatesSettled] = useState(false);
  const onboardingSettled = welcomeSettled && findMatesSettled;
  // One-time tips and the tag reminder start only once the welcome pages are closed.
  useCoachBlock(!onboardingSettled);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const { session, isLoading, setSession, setIsLoading } = useAuthStore();

  // Invite links: one that opened the app, one that arrives while it's running, and the
  // claim once there's an account to claim it for.
  useInviteLink();
  // A mate's tag on the lock screen and the home-screen widget (build 13+, switch `live-tag`);
  // ended and cleared on sign-out.
  useLiveTag();
  const [blockingGate, setBlockingGate] = useState<AppGate | null>(null);
  const { colorScheme } = useAppTheme();

  // Restore persisted session on cold start + handle all auth events (sign in,
  // sign out, token refresh). autoRefreshToken + persistSession are already
  // enabled on the supabase client via AsyncStorage in src/lib/supabase.ts.
  useEffect(() => {
    // Rehydrate theme preference before any screen renders
    rehydrateTheme().catch((err) =>
      reportError(err, { flow: 'settings', action: 'rehydrateTheme', level: 'warning' })
    );

    supabase.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) reportError(error, { flow: 'auth', action: 'getSession' });
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
        void syncAnalyticsIdentity(s.user);
        // Re-evaluate feature flags for the now-identified user.
        posthog
          .reloadFeatureFlagsAsync()
          .catch((err) =>
            reportError(err, { flow: 'flags', action: 'reloadFeatureFlags', level: 'warning' })
          );
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
        // Forgets the account only if this phone was carrying one: a signed-out launch keeps
        // its one anonymous id instead of counting as a new person every time.
        void syncAnalyticsIdentity(null);
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
    getAppGate(Platform.OS).then(({ data, error }) => {
      if (error) {
        reportError(error, {
          flow: 'settings',
          action: 'getAppGate',
          level: 'warning',
          extra: { platform: Platform.OS, rpc: 'get_app_gate' },
        });
      }
      if (gateVerdict({ version: APP_VERSION, build: APP_BUILD }, data) === 'blocked')
        setBlockingGate(data);
    });
  }, []);

  // Reset camera gate on sign-out so returning users always see the animation
  useEffect(() => {
    if (!session) {
      setShowCamera(false);
      setIntroDone(false);
      setWelcomeSettled(false);
      setFindMatesSettled(false);
    }
  }, [session]);

  const onSplashLayout = useCallback(() => {
    SplashScreen.hideAsync()
      .catch((err) => reportError(err, { flow: 'startup', action: 'hideSplash' }))
      .finally(() => setSplashDone(true));
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
  } else if (session) {
    content = (
      <>
        {showCamera && <MainNavigator />}
        {introDone && (
          <>
            <WelcomeCards userId={session.user.id} onSettled={setWelcomeSettled} />
            <FindMatesStep
              userId={session.user.id}
              createdAt={session.user.created_at}
              after={welcomeSettled}
              onSettled={setFindMatesSettled}
            />
            <PushPrimer welcomeSettled={onboardingSettled} />
            <AccountStanding userId={session.user.id} />
            <MissMoment userId={session.user.id} />
          </>
        )}
        {!introDone && (
          <InAppAnimationScreen
            onReveal={() => setShowCamera(true)}
            onComplete={() => setIntroDone(true)}
          />
        )}
        <StatusBar style={!introDone ? 'light' : colorScheme === 'dark' ? 'light' : 'dark'} />
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
