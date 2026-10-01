import React, { useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSuggestedFollows } from '@/hooks/useSuggestedFollows';
import type { SuggestedUser } from '@/api';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SIZE, TRACKING } from '@/constants/tokens';

const ACCENT = COLORS.accent;

interface SuggestedFollowsStripProps {
  /**
   * Open a suggested user's profile. The host screen owns the overlay
   * (UserProfileScreen) so the strip stays presentational.
   */
  onPressUser: (userId: string) => void;
  /**
   * Optional profile id to hide from the strip — e.g. the user whose profile
   * is currently being viewed, so we never suggest the page you're already on.
   */
  excludeUserId?: string;
}

/**
 * Horizontal strip of "suggested for you" follow cards. Reads from
 * useSuggestedFollows() (syncs on mount). Purely presentational — the Follow
 * action and profile open are delegated to the hook/store and the host screen.
 * Renders nothing when there are no suggestions.
 */
export default function SuggestedFollowsStrip({
  onPressUser,
  excludeUserId,
}: SuggestedFollowsStripProps): React.JSX.Element | null {
  const { dark, colors } = useAppTheme();
  const { suggestions, follow } = useSuggestedFollows();

  // Surfaces follow the established translucent offWhite/offBlack convention
  // (same tokens StreakGridPanel/RestDaysStreakPanel use for borders/fills)
  // rather than introducing new opaque hex.
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const cardBg = dark ? withAlpha(COLORS.offWhite, 0.06) : withAlpha(COLORS.offBlack, 0.04);
  const avatarBg = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.08);

  const data = useMemo(
    () => (excludeUserId ? suggestions.filter((u) => u.id !== excludeUserId) : suggestions),
    [suggestions, excludeUserId]
  );

  // Closed by default so the photo grid below gets the room; tap the title to open.
  const [open, setOpen] = useState(false);

  // Don't render an empty strip
  if (data.length === 0) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={styles.root}>
      <Pressable
        style={({ pressed }) => [styles.headerRow, pressed && { opacity: 0.6 }]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Suggested for you"
        accessibilityState={{ expanded: open }}
        hitSlop={{ top: SPACE.s8, bottom: SPACE.s8 }}
      >
        <Text style={[styles.header, { color: muted }]}>Suggested for you</Text>
        <Text style={[styles.chevron, { color: muted }, open && styles.chevronOpen]}>›</Text>
      </Pressable>
      {open ? (
        <FlashList<SuggestedUser>
          data={data}
          horizontal
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const displayName = item.display_name ?? item.username ?? '—';
            const initials = displayName[0]?.toUpperCase() ?? '?';

            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: cardBg },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => onPressUser(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${displayName}'s profile`}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View
                    style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}
                  >
                    <Text style={[styles.avatarInitial, { color: colors.text }]}>{initials}</Text>
                  </View>
                )}

                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                {item.username ? (
                  <Text style={[styles.handle, { color: muted }]} numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    styles.followBtn,
                    { backgroundColor: ACCENT },
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => follow(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Follow @${item.username ?? displayName}`}
                >
                  <Text style={styles.followBtnText}>Follow</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />
      ) : null}
    </View>
  );
}

const CARD_WIDTH = 132;

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginTop: SPACE.s24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s8,
    marginBottom: SPACE.s12,
  },
  header: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  chevron: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.semiBold,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  listContent: {
    paddingHorizontal: SPACE.s24,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: RADIUS.r16,
    paddingVertical: SPACE.s16,
    paddingHorizontal: SPACE.s12,
    marginRight: SPACE.s12,
    alignItems: 'center',
  },
  avatar: {
    width: SIZE.z56,
    height: SIZE.z56,
    borderRadius: RADIUS.r28,
    marginBottom: SPACE.s10,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f22,
    fontFamily: FONTS.bold,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
    letterSpacing: TRACKING.t1,
    textAlign: 'center',
    maxWidth: '100%',
  },
  handle: {
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f12,
    marginTop: SPACE.s2,
    marginBottom: SPACE.s12,
    maxWidth: '100%',
  },
  followBtn: {
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s22,
    paddingVertical: SPACE.s7,
  },
  followBtnText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
});
