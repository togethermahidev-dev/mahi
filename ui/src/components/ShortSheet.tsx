import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ALPHA, COLORS, DURATION, withAlpha } from '@/constants/tokens';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { hasNativeExpoUI, loadSwiftUI } from '@/lib/expoUiModule';
import { shortSheetKind } from '@/lib/shortSheet';

/** Closes the sheet with its animation, then runs `then` (or tells the owner it was dismissed). */
export type CloseShortSheet = (then?: () => void) => void;

interface ShortSheetProps {
  /** Shown or not. A sheet that is only mounted while open can leave this out. */
  visible?: boolean;
  dark: boolean;
  /**
   * Ask for the phone's own sheet. Only for a sheet that has been seen on a phone that way: not
   * one with a text field (the keyboard must never cover it), not the invite you accept.
   */
  native?: boolean;
  /** What VoiceOver calls the grey area you tap to close. */
  closeLabel?: string;
  /** The person closed it: a tap outside, a swipe down, Android's back. Called once it has gone. */
  onDismiss: () => void;
  /** The sheet's own card. `close` closes it with its animation, then runs what you pass. */
  children: (close: CloseShortSheet) => React.ReactNode;
}

/**
 * A short sheet at the bottom of the screen (src/lib/shortSheet.ts says which one shows).
 * - The phone's own: Apple's sheet, sized to its content, with its dimming, grab handle and swipe
 *   down (builds 11 and later, switch `native-short-sheets`).
 * - Ours: the grey fades in on its own and only the card slides up; with Reduce Motion the card
 *   fades too. It used to be one see-through layer that slid up, grey and all.
 */
export default function ShortSheet(props: ShortSheetProps): React.JSX.Element | null {
  const switchOn = useFeatureFlag('native-short-sheets');
  const kind = shortSheetKind({
    wantsNative: props.native === true,
    switchOn,
    hasNative: hasNativeExpoUI(),
  });
  return kind === 'native' ? <NativeShortSheet {...props} /> : <OurShortSheet {...props} />;
}

function OurShortSheet({
  visible = true,
  closeLabel = 'Close',
  onDismiss,
  children,
}: ShortSheetProps): React.JSX.Element | null {
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  // Stays mounted while it animates out after `visible` goes false.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const run = useCallback(
    (shown: boolean, done?: () => void) => {
      Animated.timing(progress, {
        toValue: shown ? 1 : 0,
        duration: shown ? DURATION.d300 : DURATION.d200,
        easing: shown ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    },
    [progress]
  );

  useEffect(() => {
    if (visible) run(true);
    else run(false, () => setMounted(false));
  }, [visible, run]);

  const close: CloseShortSheet = (then) => run(false, then ?? onDismiss);

  if (!mounted) return null;
  const card = reduceMotion
    ? { opacity: progress }
    : {
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) },
        ],
      };
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <View style={styles.fill}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close()}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          />
        </Animated.View>
        <Animated.View style={card}>{children(close)}</Animated.View>
      </View>
    </Modal>
  );
}

function NativeShortSheet({
  visible = true,
  dark,
  onDismiss,
  children,
}: ShortSheetProps): React.JSX.Element | null {
  const { width } = useWindowDimensions();
  // Ours to lower: a swipe down, a tap outside, or `close`. The owner's `visible` lowers it too.
  const [presented, setPresented] = useState(true);
  if (!visible && !presented) setPresented(true);
  // What runs once the sheet has fully gone, when it was closed from inside.
  const [after, setAfter] = useState<(() => void) | null>(null);

  const swift = loadSwiftUI();
  if (!swift) return null;
  const { Host, BottomSheet, Group, RNHostView } = swift.ui;
  const { presentationDragIndicator } = swift.modifiers;

  const close: CloseShortSheet = (then) => {
    setAfter(() => then ?? null);
    setPresented(false);
  };

  return (
    // A clear layer the sheet is presented from; it takes no touches and no room.
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Host style={StyleSheet.absoluteFill} colorScheme={dark ? 'dark' : 'light'}>
        <BottomSheet
          isPresented={visible && presented}
          onIsPresentedChange={(open) => {
            if (!open) setPresented(false);
          }}
          onDismiss={() => {
            const then = after;
            setAfter(null);
            // Lowered by the owner (`visible` went false): nothing to tell them.
            if (!visible) return;
            (then ?? onDismiss)();
          }}
          fitToContents
        >
          <Group modifiers={[presentationDragIndicator('visible')]}>
            <RNHostView matchContents>
              <View style={{ width }}>{children(close)}</View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: withAlpha(COLORS.black, ALPHA.a45),
  },
});
