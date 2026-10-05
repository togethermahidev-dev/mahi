import { createContext, useContext, useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useChromeStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { POST_CARD, SPACE } from '@/constants/tokens';

/**
 * With the phone's tab bar (build 11+): the room the bar takes from the bottom of the screen that
 * a page must keep clear. The swipe pages end above the bar, so inside them it is 0; null = no
 * tab bar at all (build 10, or a pop-up with no bar under it, which sets it back to null).
 */
export const TabBarRoomContext = createContext<number | null>(null);

/** The room the tab bar takes at the bottom of this page, or 0 where there is none. */
export function useTabBarRoom(): number {
  return useContext(TabBarRoomContext) ?? 0;
}

/**
 * The size of the swipe pages: the whole window, or with the phone's tab bar the space above it
 * (TabsNavigator measures it). Each page, and each Feed post, is one of these tall.
 */
export const PageSizeContext = createContext<{ width: number; height: number } | null>(null);

export function usePageSize(): { width: number; height: number } {
  const window = useWindowDimensions();
  return useContext(PageSizeContext) ?? window;
}

/**
 * The room the glass bar takes on the Camera's left edge (its gap, width and a little space
 * beside it), or 0 when the bar is off. Things on the left in the middle of the Camera start past
 * it. The bar is on no other screen, so nothing else keeps room for it; with the phone's tab bar
 * there is no glass bar.
 */
export function useRailRoom(): number {
  const inTabs = useContext(TabBarRoomContext) !== null;
  const shown = useFeatureFlag('nav-glass-rail') && !inTabs;
  const { navRail } = useAppTheme();
  const { left } = useSafeAreaInsets();
  return shown ? left + navRail.edgeGap + navRail.width + SPACE.s8 : 0;
}

/** While `open`, the glass bar or Apple's tab bar hides (a full-screen view it would sit on top of). */
export function useCoverRail(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    return useChromeStore.getState().cover();
  }, [open]);
}

/**
 * Opacity for anything that floats over a post or the pages: it fades out while a post is held
 * (hold to view) and back on release.
 */
export function useChromeFade() {
  const viewing = useChromeStore((s) => s.viewing);
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withTiming(viewing ? 0 : 1, {
      duration: viewing ? POST_CARD.hideMs : POST_CARD.showMs,
    });
  }, [viewing, opacity]);
  return { viewing, style: useAnimatedStyle(() => ({ opacity: opacity.value })) };
}
