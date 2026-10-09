import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { themeColors } from '@/hooks/useAppTheme';
import { FONTS } from '@/constants/fonts';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  FONT_SIZE,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';

/** The line under every load error: one wording across the app. */
export const LOAD_ERROR_LINE = 'Check your connection and try again.';

interface ListStateProps {
  /**
   * loading: nothing has arrived yet this session. error: the read failed and nothing is on
   * screen. empty: a read worked and found nothing. Never show saved data that then swaps.
   */
  kind: 'loading' | 'error' | 'empty';
  dark: boolean;
  /** Error: "Couldn’t load [your notifications / messages / …]". Empty: what goes here. */
  title?: string;
  /** Error: defaults to "Check your connection and try again." Empty: the next step. */
  line?: string;
  /** Error: defaults to "Try again". Empty: the next step's button, if any. */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional visual for a specific empty state; decorative because the text explains the state. */
  icon?: React.ReactNode;
  /** Optional bigger picture in place of the small marker (the invites list's mate circles). */
  art?: React.ReactNode;
}

/**
 * One loading / error / empty view for every list (round 4 X5). Centred in the space it is
 * given: a spinner, or a title, a line and at most one button.
 */
export default function ListState({
  kind,
  dark,
  title,
  line,
  actionLabel,
  onAction,
  icon,
  art,
}: ListStateProps): React.JSX.Element {
  const { text, muted, border } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const softSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  if (kind === 'loading') {
    return (
      <View style={styles.wrap}>
        <View style={[styles.loadingDisc, { backgroundColor: softSurface }]}>
          <ActivityIndicator color={muted} accessibilityLabel="Loading" />
        </View>
      </View>
    );
  }

  const shownLine = line ?? (kind === 'error' ? LOAD_ERROR_LINE : undefined);
  const shownAction = actionLabel ?? (kind === 'error' ? 'Try again' : undefined);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: surface, borderColor: border }]}>
        {/* No default marker (owner, 2026-10-09: the circle with a dot "isn't needed"); a list
            that has its own picture or icon still shows it. */}
        {art ? (
          <View style={styles.art}>{art}</View>
        ) : icon ? (
          <View style={[styles.marker, { backgroundColor: softSurface }]}>{icon}</View>
        ) : null}
        {title ? (
          <Text style={[styles.title, { color: text }]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {shownLine ? <Text style={[styles.line, { color: muted }]}>{shownLine}</Text> : null}
        {shownAction && onAction ? (
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={shownAction}
          >
            <Text style={styles.buttonText}>{shownAction}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s8,
    paddingHorizontal: SPACE.s32,
    paddingVertical: SPACE.s60,
  },
  card: {
    width: '100%',
    maxWidth: SIZE.z360,
    alignItems: 'center',
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r24,
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s28,
  },
  loadingDisc: {
    width: SIZE.z56,
    height: SIZE.z56,
    borderRadius: RADIUS.r28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.s12,
  },
  art: {
    marginBottom: SPACE.s16,
  },
  title: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  line: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginTop: SPACE.s8,
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s24,
    minHeight: SIZE.z44,
    justifyContent: 'center',
    marginTop: SPACE.s8,
  },
  buttonText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
});
