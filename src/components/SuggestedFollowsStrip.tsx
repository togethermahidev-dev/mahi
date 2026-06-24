import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSuggestedFollows } from '@/hooks/useSuggestedFollows';
import type { SuggestedUser } from '@/api';

const ACCENT = '#59c2d7';

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
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const cardBg = dark ? 'rgba(232,232,227,0.06)' : 'rgba(26,26,23,0.04)';
  const avatarBg = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.08)';

  const data = useMemo(
    () => (excludeUserId ? suggestions.filter((u) => u.id !== excludeUserId) : suggestions),
    [suggestions, excludeUserId]
  );

  // Don't render an empty strip
  if (data.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={[styles.header, { color: muted }]}>SUGGESTED FOR YOU</Text>
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
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => onPressUser(item.id)}
              style={[styles.card, { backgroundColor: cardBg }]}
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
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

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => follow(item.id)}
                style={[styles.followBtn, { backgroundColor: ACCENT }]}
              >
                <Text style={styles.followBtnText}>FOLLOW</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const CARD_WIDTH = 132;

const styles = StyleSheet.create({
  root: {
    width: '100%',
    marginTop: 24,
  },
  header: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 24,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginRight: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 10,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontFamily: 'JosefinSans_700Bold',
  },
  name: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
    maxWidth: '100%',
  },
  handle: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
    maxWidth: '100%',
  },
  followBtn: {
    borderRadius: 50,
    paddingHorizontal: 22,
    paddingVertical: 7,
  },
  followBtnText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
});
