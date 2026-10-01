import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { swipeLog } from '@/lib/swipeDebug';
import { BlurTargetView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VerticalNavigator, { type VerticalControl } from '@/screens/VerticalNavigator';
import ProfileScreen from '@/screens/ProfileScreen';
import MessagesScreen from '@/screens/MessagesScreen';
import NavRail, { type RailTab } from '@/components/NavRail';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useAppTheme } from '@/hooks/useAppTheme';
import { horizontalRelease, horizontalSwipe, rubberBand, type Rect } from '@/lib/swipeRules';

// ─── Panel registry ───────────────────────────────────────────────────────────
// Panels, left to right — Profile (0) ← VerticalNavigator (1, default) → Messages (2)
const PANEL_COUNT = 3;
const DEFAULT_INDEX = 1; // VerticalNavigator is the entry panel

/** The snap to a panel. Runs even with Reduce Motion on, as it always has. */
const SPRING = { damping: 22, stiffness: 160, mass: 0.9, reduceMotion: ReduceMotion.Never };

// ─── HorizontalNavigator ──────────────────────────────────────────────────────

export default function HorizontalNavigator(): React.JSX.Element {
  const showRail = useFeatureFlag('nav-glass-rail');
  const railMorph = useFeatureFlag('nav-rail-morph');
  const { dark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [hIndex, setHIndex] = useState(DEFAULT_INDEX);
  const [vIndex, setVIndex] = useState(0);
  const [overlay, setOverlay] = useState(false);
  const verticalRef = useRef<VerticalControl | null>(null);
  const blurTargetRef = useRef<View | null>(null);

  // What the swipe reads on the UI thread.
  const indexSV = useSharedValue(DEFAULT_INDEX);
  const blockedSV = useSharedValue(false);
  // Where the tape sits, in panels (0 = Profile); fractional mid-swipe.
  const page = useSharedValue(DEFAULT_INDEX);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);
  const base = useSharedValue(0);
  // nav-rail-morph: where the rail is on screen. A touch that starts there belongs to the rail.
  const railRectSV = useSharedValue<Rect | null>(null);
  const railOwnsTouches = showRail && railMorph && !overlay;
  useEffect(() => {
    if (!railOwnsTouches) railRectSV.value = null;
  }, [railOwnsTouches, railRectSV]);

  // The tape has been sent to `index`: record it and tick.
  const settle = (index: number) => {
    setHIndex(index);
    indexSV.value = index;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Snap the horizontal tape to a target panel with a spring animation.
  const navigateHorizontal = (index: number) => {
    settle(index);
    page.value = withSpring(index, SPRING);
  };

  const safeInsets = { top: insets.top, bottom: insets.bottom };

  // Take clear horizontal swipes (see swipeRules); vertical ones are left to VerticalNavigator
  // and to the lists inside the panels. Runs on the UI thread.
  // The Feed list's scrolling. A vertical list starts tracking after ~10pt of movement in any
  // direction, before this swipe decides at 20pt; without running alongside it, the list wins
  // and sideways swipes on Feed do nothing.
  const feedList = useMemo(() => Gesture.Native(), []);

  const swipe = Gesture.Pan()
    .manualActivation(true)
    .simultaneousWithExternalGesture(feedList)
    .onTouchesDown((e, manager) => {
      'worklet';
      const t = e.changedTouches[0];
      if (e.numberOfTouches !== 1 || !t) return;
      startX.value = t.absoluteX;
      startY.value = t.absoluteY;
      decided.value = false;
      // A touch in a system strip, or with a pop-up open, is let go straight away.
      const first = horizontalSwipe({
        startX: t.absoluteX,
        startY: t.absoluteY,
        dx: 0,
        dy: 0,
        width,
        height,
        insets: safeInsets,
        blocked: blockedSV.value,
        exclude: railRectSV.value,
      });
      scheduleOnRN(
        swipeLog,
        `H down x${Math.round(t.absoluteX)} y${Math.round(t.absoluteY)} ${first}${blockedSV.value ? ' blocked' : ''}`
      );
      if (first === 'fail') {
        decided.value = true;
        manager.fail();
      }
    })
    .onTouchesMove((e, manager) => {
      'worklet';
      const t = e.allTouches[0];
      if (decided.value || !t) return;
      const decision = horizontalSwipe({
        startX: startX.value,
        startY: startY.value,
        dx: t.absoluteX - startX.value,
        dy: t.absoluteY - startY.value,
        width,
        height,
        insets: safeInsets,
        blocked: blockedSV.value,
      });
      if (decision === 'wait') return;
      decided.value = true;
      scheduleOnRN(
        swipeLog,
        `H ${decision} dx${Math.round(t.absoluteX - startX.value)} dy${Math.round(t.absoluteY - startY.value)}`
      );
      if (decision === 'activate') manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      'worklet';
      scheduleOnRN(swipeLog, 'H started (pages move)');
      cancelAnimation(page);
      base.value = indexSV.value;
    })
    .onUpdate((e) => {
      'worklet';
      // Follows the finger; rubber-band resistance past Profile and Messages.
      page.value = rubberBand(
        base.value - (e.absoluteX - startX.value) / width,
        0,
        PANEL_COUNT - 1
      );
    })
    .onEnd((e, success) => {
      'worklet';
      // Cut short (the phone took the touch): snap back to the panel it started on.
      const next = success
        ? horizontalRelease(
            indexSV.value,
            PANEL_COUNT,
            e.absoluteX - startX.value,
            e.velocityX / 1000
          )
        : indexSV.value;
      indexSV.value = next;
      page.value = withSpring(next, SPRING);
      scheduleOnRN(settle, next);
    })
    .onFinalize((_e, success) => {
      'worklet';
      scheduleOnRN(swipeLog, `H end ${success ? 'ok' : 'cancelled/failed'}`);
    });

  const tapeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -page.value * width }] }));

  const railTab: RailTab =
    hIndex === 0 ? 'profile' : hIndex === 2 ? 'messages' : vIndex === 0 ? 'camera' : 'feed';

  const selectTab = (tab: RailTab) => {
    if (tab === 'profile') return navigateHorizontal(0);
    if (tab === 'messages') return navigateHorizontal(2);
    // indexSV, not hIndex: a drag along the rail can switch twice before the next render.
    if (indexSV.value !== 1) navigateHorizontal(1);
    verticalRef.current?.navigateTo(tab === 'camera' ? 0 : 1);
  };

  // Android blurs a BlurTargetView's content; iOS blurs whatever is behind natively.
  const Tape = Platform.OS === 'android' ? BlurTargetView : View;
  const panel = { width };

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.root}>
        <Tape ref={blurTargetRef} style={styles.root}>
          <Animated.View style={[styles.tape, { width: width * PANEL_COUNT }, tapeStyle]}>
            {/* Panel 0: Profile — always mounted; `isActive` flips true when the
                tape settles on index 0 so ProfileScreen can recover a raced/empty
                first posts-sync (hand-rolled nav focus, not react-navigation). */}
            <View style={[styles.panel, panel]}>
              <ProfileScreen isActive={hIndex === 0} />
            </View>

            {/* Panel 1: VerticalNavigator (main content) — default visible panel */}
            <View style={[styles.panel, panel]}>
              <VerticalNavigator
                controlRef={verticalRef}
                feedList={feedList}
                railShown={showRail}
                onIndexChange={setVIndex}
                onNavigateLeft={() => navigateHorizontal(0)}
                onNavigateRight={() => navigateHorizontal(2)}
                onOverlayChange={(active) => {
                  blockedSV.value = active;
                  setOverlay(active);
                }}
              />
            </View>

            {/* Panel 2: Messages */}
            <View style={[styles.panel, panel]}>
              <MessagesScreen onBack={() => navigateHorizontal(1)} />
            </View>
          </Animated.View>
        </Tape>

        {showRail && !overlay ? (
          <NavRail
            active={railTab}
            onSelect={selectTab}
            onDark={railTab === 'camera' || dark}
            blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
            morph={railMorph}
            onRect={
              railMorph
                ? (rect) => {
                    railRectSV.value = rect;
                  }
                : undefined
            }
          />
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  tape: {
    flexDirection: 'row',
    flex: 1,
  },
  panel: {
    flex: 1,
    overflow: 'hidden',
  },
});
