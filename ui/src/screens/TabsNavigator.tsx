import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { PageSizeContext, TabBarRoomContext } from '@/hooks/useChrome';
import HorizontalNavigator, { type TabBarLink } from '@/screens/HorizontalNavigator';
import {
  INITIAL_TAB,
  NATIVE_TABS,
  TAB_TITLE_APPEARANCE,
  cameraBadge,
  movesPages,
  type TabKey,
  tabIcons,
} from '@/lib/nativeTabs';
import { useOpenTags } from '@/hooks/useOpenTags';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { loadScreens } from '@/lib/screensModule';
import { useFeedStore } from '@/store';
import { loadExpoSymbols } from '@/lib/symbolModule';
import { COLORS, ICON_SIZE, SIZE } from '@/constants/tokens';

/**
 * iPhone: the Camera tab is Mahi blue even when not selected, and larger when it is (owner,
 * 2026-10-08). Apple's bar tints every unselected tab alike, so these are ready-made images of
 * Apple's own camera symbols in COLORS.accent (drawn by scripts/tab-icons.swift).
 */
const CAMERA_TAB_ICONS = {
  icon: { type: 'imageSource', imageSource: require('../../assets/tabs/camera.png') },
  selectedIcon: {
    type: 'imageSource',
    imageSource: require('../../assets/tabs/camera-selected.png'),
  },
} as const;

/** What the bar reports when a tab is selected (react-native-screens' TabSelectedEvent). */
type TabSelected = NativeSyntheticEvent<{
  selectedScreenKey: string;
  provenance: number;
  isRepeated: boolean;
  actionOrigin: string;
}>;

/**
 * The phone's own tab bar at the bottom (build 11+, no switch): Messages, Feed, Camera, Profile.
 * On iPhone it is Apple's tab bar (Liquid Glass on iOS 26, with Apple's own selection morph); on
 * Android, Material's bottom navigation.
 *
 * The pages are the swipe pages (HorizontalNavigator; owner, 2026-10-07): Messages ⇄ Feed ⇄
 * Camera ⇄ Profile, sideways only. They fill the screen above the bar. The bar shows which
 * page is up, and a tap on it moves the pages there. Its own tab pages stay empty behind them.
 *
 * Only rendered when `nativeTabsAvailable` (App.tsx): react-native-screens is required lazily,
 * so builds without it never load it.
 */
export default function TabsNavigator(): React.JSX.Element | null {
  const Screens = loadScreens();
  const { dark, colors } = useAppTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const androidIcons = useAndroidIcons();

  const [tab, setTab] = useState<TabKey>(INITIAL_TAB);
  // A locked feed shows a padlock on its tab (only once the feed has been read: never a guess).
  const feedLocked = useFeedStore((s) => s.loaded && s.locked);
  // A tag waiting for your post: a number on the Camera tab (once the tags have been read).
  const { openTags, loaded: tagsLoaded } = useOpenTags();
  const badgeOn = useFeatureFlag('camera-tab-badge');
  // The last selection the native bar confirmed: a change asked from here builds on it.
  const [provenance, setProvenance] = useState(0);
  // The post preview covers everything; the bar hides under it.
  const [composing, setComposing] = useState(false);
  // The room the bar takes at the bottom, measured inside a tab page; a close guess until then.
  const [room, setRoom] = useState(insets.bottom + SIZE.z48);
  const selectRef = useRef<((t: TabKey) => void) | null>(null);
  // While the bar hides the phone reports less room; the pages keep their size meanwhile.
  const composingRef = useRef(false);
  const onRoom = useMemo(
    () => (next: number) => {
      if (!composingRef.current) setRoom(next);
    },
    []
  );
  const onComposingChange = useMemo(
    () => (open: boolean) => {
      composingRef.current = open;
      setComposing(open);
    },
    []
  );

  const link = useMemo<TabBarLink>(
    () => ({ onTabChange: setTab, selectRef, onComposingChange }),
    [onComposingChange]
  );
  // The pages always end above the bar, so a page never changes size (the Feed would jump).
  const pageSize = useMemo(
    () => ({ width: window.width, height: Math.max(0, window.height - room) }),
    [window.width, window.height, room]
  );

  // Android's icons are drawn into images first; nothing shows until they are ready, so the bar
  // never appears without them and then changes.
  if (!Screens || (Platform.OS === 'android' && !androidIcons)) {
    return <View style={[styles.root, { backgroundColor: COLORS.ink }]} />;
  }
  const { Tabs } = Screens;

  const pageBg = (key: TabKey) =>
    key === 'camera' ? COLORS.ink : dark ? COLORS.bgDark : COLORS.white;

  return (
    <View style={[styles.root, { backgroundColor: pageBg(tab) }]}>
      <Tabs.Host
        navStateRequest={{ selectedScreenKey: tab, baseProvenance: provenance }}
        onTabSelected={({ nativeEvent }: TabSelected) => {
          setProvenance(nativeEvent.provenance);
          const key = nativeEvent.selectedScreenKey as TabKey;
          // The tab you're on, tapped again: the pages decide (Camera brings the camera back from
          // the feed; the others do nothing).
          if (nativeEvent.isRepeated) {
            if (movesPages(nativeEvent.actionOrigin)) selectRef.current?.(key);
            return;
          }
          setTab(key);
          // A tap moves the pages (they tick as they settle); a swipe already did.
          if (movesPages(nativeEvent.actionOrigin)) selectRef.current?.(key);
        }}
        tabBarHidden={composing}
        // The Camera is always dark; the other pages follow the app's light / dark setting.
        colorScheme={tab === 'camera' || dark ? 'dark' : 'light'}
        nativeContainerStyle={{ backgroundColor: pageBg(tab) }}
        ios={{ tabBarTintColor: colors.accent, tabBarMinimizeBehavior: 'never' }}
      >
        {NATIVE_TABS.map((t) => (
          <Tabs.Screen
            key={t.key}
            screenKey={t.key}
            title={t.title}
            badgeValue={
              badgeOn
                ? cameraBadge(t.key, { count: openTags.length, loaded: tagsLoaded })
                : undefined
            }
            style={{ backgroundColor: pageBg(t.key) }}
            ios={{
              ...(t.key === 'camera'
                ? CAMERA_TAB_ICONS
                : {
                    icon: { type: 'sfSymbol', name: tabIcons(t, feedLocked).icon },
                    selectedIcon: { type: 'sfSymbol', name: tabIcons(t, feedLocked).selectedIcon },
                  }),
              standardAppearance: TAB_TITLE_APPEARANCE.ios,
            }}
            android={{
              standardAppearance: TAB_TITLE_APPEARANCE.android,
              ...(androidIcons?.[t.key]
                ? { icon: { type: 'imageSource', imageSource: androidIcons[t.key] } }
                : {}),
            }}
          >
            <EmptyTabPage background={pageBg(t.key)} onRoom={onRoom} />
          </Tabs.Screen>
        ))}
      </Tabs.Host>

      {/* The swipe pages, above the bar. Inside them the bar takes no room: they end above it. */}
      <View style={[styles.pages, { height: pageSize.height }]}>
        <PageSizeContext.Provider value={pageSize}>
          <TabBarRoomContext.Provider value={0}>
            <HorizontalNavigator tabBar={link} />
          </TabBarRoomContext.Provider>
        </PageSizeContext.Provider>
      </View>
    </View>
  );
}

/**
 * One of the bar's own tab pages: empty (the swipe pages sit above it), in the page's colour.
 * It measures the room the bar takes (an invisible safe-area probe: the phone counts the tab bar
 * into its bottom safe area).
 */
function EmptyTabPage({
  background,
  onRoom,
}: {
  background: string;
  onRoom: (room: number) => void;
}) {
  return (
    <View collapsable={false} style={[styles.root, { backgroundColor: background }]}>
      <SafeAreaProvider style={StyleSheet.absoluteFill} pointerEvents="none">
        <RoomProbe onRoom={onRoom} />
      </SafeAreaProvider>
    </View>
  );
}

function RoomProbe({ onRoom }: { onRoom: (room: number) => void }) {
  const { bottom } = useSafeAreaInsets();
  useEffect(() => {
    if (bottom > 0) onRoom(bottom);
  }, [bottom, onRoom]);
  return null;
}

/** Android: each tab's Material icon drawn into an image (expo-symbols). null until ready. */
function useAndroidIcons(): Record<TabKey, ImageSourcePropType | null> | null {
  // No icon library in this build: the bar shows the titles alone, straight away.
  const [icons, setIcons] = useState<Record<TabKey, ImageSourcePropType | null> | null>(() =>
    Platform.OS === 'android' && !loadExpoSymbols()
      ? { camera: null, feed: null, messages: null, profile: null }
      : null
  );
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const symbols = loadExpoSymbols();
    if (!symbols) return;
    let live = true;
    Promise.all(
      NATIVE_TABS.map((t) =>
        symbols
          .unstable_getMaterialSymbolSourceAsync(t.androidIcon, ICON_SIZE.i24, COLORS.white)
          .catch(() => null)
      )
    ).then((sources) => {
      if (!live) return;
      const next = { camera: null, feed: null, messages: null, profile: null } as Record<
        TabKey,
        ImageSourcePropType | null
      >;
      NATIVE_TABS.forEach((t, i) => {
        next[t.key] = sources[i];
      });
      setIcons(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return icons;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pages: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
});
