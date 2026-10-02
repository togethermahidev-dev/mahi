import { useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useChromeStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { POST_CARD, SPACE } from '@/constants/tokens';

/**
 * The room the glass bar takes on the left edge (its gap, width and a little space beside it),
 * or 0 when the bar is off. Things that sit on the left in the middle of a page start past it.
 */
export function useRailRoom(): number {
  const shown = useFeatureFlag('nav-glass-rail');
  const { navRail } = useAppTheme();
  const { left } = useSafeAreaInsets();
  return shown ? left + navRail.edgeGap + navRail.width + SPACE.s8 : 0;
}

/** While `open`, the glass bar hides (a full-screen view it would sit on top of). */
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
