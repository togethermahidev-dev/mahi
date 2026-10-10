import React, { useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import KeyboardInset from '@/components/KeyboardInset';
import ReactionRow from '@/components/ReactionRow';
import { themeColors } from '@/hooks/useAppTheme';
import { loadSwiftUI } from '@/lib/expoUiModule';
import { haptic } from '@/lib/haptics';
import { DOUBLE_TAP_EMOJI, QUICK_EMOJI, type MessageHoldAction } from '@/lib/messageReactions';
import {
  ALPHA,
  COLORS,
  DURATION,
  RADIUS,
  SCALE,
  SIZE,
  SPACE,
  SPRING,
  withAlpha,
} from '@/constants/tokens';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';

const ACTION_WORDS: Record<MessageHoldAction, string> = { edit: 'Edit', unsend: 'Unsend' };

/**
 * Hold a message to react or act on it (owner, 2026-10-07).
 *
 * On an iPhone build with @expo/ui (build 11+): Apple's own context menu lifts the bubble and
 * shows, above the menu, the quick row of six emoji and a "+" (a ControlGroup, Apple's compact
 * row), then Edit / Unsend for your own message. Elsewhere (build 10, Android): a bottom sheet
 * with the same row and choices. A double tap is a heart, with a heart popping off the bubble
 * (Reduce Motion: it fades in and out, no spring).
 * Picking is felt (`selection`); the double tap too (`tick`).
 *
 * `children` stay what they were: the bubble, its taps intact. A bubble that opens something (a
 * shared post) hands its tap here as `onPress`, so a hold on it still brings up the menu; one tap
 * then opens at once, and the double-tap heart gives way to it (reactions stay in the menu).
 */
export default function MessageHoldMenu({
  enabled,
  canReact,
  mine,
  actions,
  dark,
  onReact,
  onMore,
  onAction,
  onPress,
  children,
}: {
  /** False: just `children` (a message still sending, or theirs in a waiting request). */
  enabled: boolean;
  /** Reactions are allowed here (an open chat). */
  canReact: boolean;
  /** The emoji I already reacted with, if any. */
  mine: string | null;
  /** What else the hold offers (my own message: Edit while fresh, Unsend). */
  actions: MessageHoldAction[];
  dark: boolean;
  onReact: (emoji: string) => void;
  /** The "+": any other emoji. */
  onMore: () => void;
  onAction: (action: MessageHoldAction) => void;
  /** One tap on the bubble (a shared post opens). Without it, a double tap is a heart. */
  onPress?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { bg, text, dangerText, border } = themeColors(dark);

  // The heart that pops off the bubble on a double tap.
  const reduceMotion = useReducedMotion();
  const [heartScale] = useState(() => new Animated.Value(0));
  const [heartFade] = useState(() => new Animated.Value(0));
  const popHeart = () => {
    if (reduceMotion) {
      // No spring: the heart shows at its size, and fades.
      heartScale.setValue(1);
      heartFade.setValue(0);
      Animated.sequence([
        Animated.timing(heartFade, { toValue: 1, duration: DURATION.d200, useNativeDriver: true }),
        Animated.timing(heartFade, { toValue: 0, duration: DURATION.d400, useNativeDriver: true }),
      ]).start();
      return;
    }
    heartScale.setValue(0);
    heartFade.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: SCALE.s1_3, ...SPRING.medal, useNativeDriver: true }),
      Animated.timing(heartFade, { toValue: 0, duration: DURATION.d400, useNativeDriver: true }),
    ]).start();
  };
  const pick = (emoji: string) => {
    haptic('selection');
    onReact(emoji);
  };
  const doubleTapped = () => {
    if (!canReact) return;
    haptic('tick');
    if (mine !== DOUBLE_TAP_EMOJI) popHeart();
    onReact(DOUBLE_TAP_EMOJI);
  };
  const doubleTap = Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd(doubleTapped);
  const oneTap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) onPress?.();
    });

  // VoiceOver: the same choices as actions on the bubble.
  const a11yActions = enabled
    ? [
        ...(canReact
          ? [
              ...QUICK_EMOJI.map((e) => ({ name: `react:${e}`, label: `React with ${e}` })),
              { name: 'more', label: 'Any other emoji' },
            ]
          : []),
        ...actions.map((a) => ({ name: a, label: ACTION_WORDS[a] })),
      ]
    : undefined;
  const onA11yAction = (name: string) => {
    if (name.startsWith('react:')) pick(name.slice('react:'.length));
    else if (name === 'more') onMore();
    else if (name === 'edit' || name === 'unsend') onAction(name);
  };

  const body = (
    <GestureDetector gesture={onPress ? oneTap : doubleTap}>
      <View collapsable={false}>
        {children}
        <View pointerEvents="none" style={styles.heartWrap}>
          <Animated.Text
            style={[styles.heart, { opacity: heartFade, transform: [{ scale: heartScale }] }]}
          >
            {DOUBLE_TAP_EMOJI}
          </Animated.Text>
        </View>
      </View>
    </GestureDetector>
  );

  if (!enabled) return body;

  const swift = Platform.OS === 'ios' ? loadSwiftUI() : null;
  if (swift) {
    const { Host, ContextMenu, Button, ControlGroup, RNHostView } = swift.ui;
    return (
      <Host matchContents colorScheme={dark ? 'dark' : 'light'}>
        <ContextMenu>
          <ContextMenu.Trigger>
            <RNHostView matchContents>
              <View
                accessibilityActions={a11yActions}
                onAccessibilityAction={(e) => onA11yAction(e.nativeEvent.actionName)}
                accessibilityHint="Hold for reactions and more"
              >
                {body}
              </View>
            </RNHostView>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            {canReact ? (
              <ControlGroup>
                {QUICK_EMOJI.map((emoji) => (
                  <Button key={emoji} label={emoji} onPress={() => pick(emoji)} />
                ))}
                <Button label="More" systemImage="plus" onPress={onMore} />
              </ControlGroup>
            ) : null}
            {actions.includes('edit') ? (
              <Button label="Edit" systemImage="pencil" onPress={() => onAction('edit')} />
            ) : null}
            {actions.includes('unsend') ? (
              <Button
                label="Unsend"
                systemImage="trash"
                role="destructive"
                onPress={() => onAction('unsend')}
              />
            ) : null}
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    );
  }

  const close = () => setSheetOpen(false);
  return (
    <>
      <Pressable
        onLongPress={() => setSheetOpen(true)}
        accessibilityHint="Hold for reactions and more"
        accessibilityActions={a11yActions}
        onAccessibilityAction={(e) => onA11yAction(e.nativeEvent.actionName)}
      >
        {body}
      </Pressable>
      {sheetOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
          <View style={styles.fill}>
            <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
            <View style={[styles.sheet, { backgroundColor: bg }]}>
              {canReact ? (
                <ReactionRow
                  mine={mine}
                  dark={dark}
                  onPick={(emoji) => {
                    close();
                    pick(emoji);
                  }}
                  onMore={() => {
                    close();
                    onMore();
                  }}
                />
              ) : null}
              {actions.map((action) => (
                <Pressable
                  key={action}
                  onPress={() => {
                    close();
                    onAction(action);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    { borderTopColor: border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.rowText, { color: action === 'unsend' ? dangerText : text }]}
                  >
                    {ACTION_WORDS[action]}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={close}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  { borderTopColor: border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
              </Pressable>
              <KeyboardInset />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  heartWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Inter Tight carries no emoji glyphs: the phone's own emoji font draws the heart.
  heart: { ...GLYPH.hero },
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withAlpha(COLORS.black, ALPHA.a45) },
  sheet: {
    borderTopLeftRadius: RADIUS.r24,
    borderTopRightRadius: RADIUS.r24,
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s24,
    paddingBottom: SPACE.s16,
    gap: SPACE.s12,
  },
  row: {
    minHeight: SIZE.z48,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { ...TYPOGRAPHY.body },
  cancelText: { ...TYPOGRAPHY.bodyStrong },
  pressed: { opacity: ALPHA.a70 },
});
