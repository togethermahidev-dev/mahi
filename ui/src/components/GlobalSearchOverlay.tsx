import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Animated,
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
  Keyboard,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchIcon } from '@/components/ScreenIcons';
import { searchProfiles, type ProfileSearchResult } from '@/api';
import { useInviteAMate } from '@/components/ShareSheet';
import PointsBadge from '@/components/PointsBadge';
import { useAuthStore, useBlockStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { Sentry, reportError } from '@/lib/sentry';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BLUR_INTENSITY,
  DURATION,
  FONT_SIZE,
  ICON_SIZE,
  LAYER,
  LAYOUT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  SPRING,
  SWIPE,
  TRACKING,
  WAIT,
  withAlpha,
} from '@/constants/tokens';
import { useCoverRail } from '@/hooks/useChrome';
import { themeColors } from '@/hooks/useAppTheme';
import { INVITE_BUTTON } from '@/lib/tagSlots';

function UserRow({
  item,
  dark,
  onPress,
}: {
  item: ProfileSearchResult;
  dark: boolean;
  onPress: () => void;
}) {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted, border } = themeColors(dark);
  const avatarBg = dark ? COLORS.surfaceDark : COLORS.offWhite;
  const surface = dark ? COLORS.surfaceDark2 : COLORS.white;

  const displayName = item.display_name ?? item.first_name ?? item.username ?? '—';
  const initials = displayName[0]?.toUpperCase() ?? '?';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: surface, borderColor: border },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.username ? `${displayName}, @${item.username}` : displayName}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url, cache: 'force-cache' }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarInitial, { color: text }]}>{initials}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: text }]}>{displayName}</Text>
        {item.username ? (
          <Text style={[styles.handle, { color: muted }]}>@{item.username}</Text>
        ) : null}
      </View>
      {/* No "0 points" next to anyone: a 0 shows nothing, as on posts. */}
      {item.streak_current ? (
        <PointsBadge points={item.streak_current} style={[styles.points, { color: muted }]} />
      ) : null}
    </Pressable>
  );
}

interface GlobalSearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
  /** Your own row: go to your Profile page (closing search). Without it, the row closes search. */
  onOpenOwnProfile?: () => void;
}

export default function GlobalSearchOverlay({
  visible,
  onClose,
  dark,
  onOpenOwnProfile,
}: GlobalSearchOverlayProps): React.JSX.Element | null {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-OFFSET.o24)).current;
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  // Reduce Motion: no slide, only the fade.
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  // Opened from Messages, the glass bar would sit on the results: it hides while search is open.
  useCoverRail(visible);

  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const inputBg = dark ? withAlpha(COLORS.white, ALPHA.a12) : withAlpha(COLORS.black, ALPHA.a08);
  const tint = dark ? 'dark' : 'light';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  // "Invite a mate" under a search that found no one: the link is being made.
  const [inviting, setInviting] = useState(false);
  // The link opens in Mahi's share sheet (switch `share-sheet`; off: the phone's).
  const { invite: inviteAMate, sheet: inviteSheet } = useInviteAMate();
  const [searched, setSearched] = useState(false);
  /** The last search failed: say so (never "no one called…"), with Try again. */
  const [failed, setFailed] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe-up anywhere on the overlay dismisses it (and blocks the gesture
  // from leaking through to the pages behind it).
  const dismissPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, { dy }) => Math.abs(dy) > SWIPE.slop,
      onPanResponderRelease: (_e, { dy, vy }) => {
        if (dy < -SWIPE.distance || vy < -SWIPE.velocity) {
          Keyboard.dismiss();
          onClose();
        }
      },
      // Allow child elements (search bar, result rows, cancel) to reclaim touches.
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  useEffect(() => {
    if (visible) {
      console.log('[GlobalSearch] opened');
      Sentry.addBreadcrumb({ category: 'search', message: 'Search overlay opened', level: 'info' });
      if (reduceMotion) slideAnim.setValue(0);
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          ...SPRING.overlay,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          ...SPRING.overlay,
          useNativeDriver: true,
        }),
      ]).start(() => {
        inputRef.current?.focus();
      });
    } else {
      inputRef.current?.blur();
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: DURATION.d180, useNativeDriver: true }),
        // Reduce Motion: it fades out where it is, no slide up.
        Animated.timing(slideAnim, {
          toValue: reduceMotion ? 0 : -OFFSET.o24,
          duration: DURATION.d180,
          useNativeDriver: true,
        }),
      ]).start();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQuery('');
      setResults([]);
      setSearched(false);
      setFailed(false);
      setProfileUserId(null);
    }
  }, [visible]);

  const runSearch = useCallback(async (value: string) => {
    setLoading(true);
    try {
      const { data, error } = await searchProfiles(value);
      if (error) {
        console.log('[GlobalSearch] search error |', error.message);
        reportError(error, {
          flow: 'search',
          action: 'searchProfiles',
          level: 'warning',
          extra: { queryLength: value.length },
        });
      }
      const filtered = (data ?? []).filter((u) => !useBlockStore.getState().isBlocked(u.id));
      setResults(filtered);
      setFailed(!!error || !data);
      setSearched(true);
    } catch (e) {
      console.log('[GlobalSearch] search exception |', e);
      reportError(e, {
        flow: 'search',
        action: 'searchProfiles',
        extra: { queryLength: value.length },
      });
      setResults([]);
      setFailed(true);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setResults([]);
        setSearched(false);
        setFailed(false);
        return;
      }
      debounceRef.current = setTimeout(() => void runSearch(value), WAIT.search);
    },
    [runSearch]
  );

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]} {...dismissPan.panHandlers}>
      {/* Full-screen frosted glass background */}
      <BlurView intensity={BLUR_INTENSITY.i35} tint={tint} style={StyleSheet.absoluteFill} />

      {/* Subtle colour wash on top of blur */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: dark
              ? withAlpha(COLORS.inkSoft, ALPHA.a25)
              : withAlpha(COLORS.paper, ALPHA.a25),
          },
        ]}
        pointerEvents="none"
      />

      {/* Tap backdrop to dismiss. Hidden from screen readers: the Cancel button does the same. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessible={false}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      />

      <View style={styles.content} pointerEvents="box-none">
        <Animated.View
          style={{ paddingTop: insets.top + SPACE.s8, transform: [{ translateY: slideAnim }] }}
        >
          {/* Search bar row */}
          <View style={styles.barRow}>
            <View style={[styles.pill, { backgroundColor: inputBg }]}>
              <View style={styles.magnify}>
                <SearchIcon size={ICON_SIZE.i16} color={muted} />
              </View>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: text }]}
                placeholder="Name or @username"
                placeholderTextColor={muted}
                value={query}
                onChangeText={handleChange}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                enablesReturnKeyAutomatically
                clearButtonMode="while-editing"
                accessibilityLabel="Search people"
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel search"
              hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
            >
              <Text style={[styles.cancelText, { color: text }]}>Cancel</Text>
            </Pressable>
          </View>

          {/* Divider */}
          <View
            style={[
              styles.divider,
              {
                backgroundColor: dark
                  ? withAlpha(COLORS.offWhite, ALPHA.a10)
                  : withAlpha(COLORS.offBlack, ALPHA.a08),
              },
            ]}
          />

          {/* Results */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={muted} />
            </View>
          ) : searched && failed && results.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: text }]}>
                Search isn’t working right now.
              </Text>
              <Text style={[styles.hintText, { color: muted }]}>
                Check your connection and try again.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                onPress={() => void runSearch(query)}
                accessibilityRole="button"
              >
                <Text style={styles.retryBtnText}>Try again</Text>
              </Pressable>
            </View>
          ) : searched && results.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: text }]}>
                No one called “{query.trim()}” on Mahi yet.
              </Text>
              <Text style={[styles.hintText, { color: muted }]}>Not on Mahi yet? Invite them.</Text>
              <Pressable
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                onPress={() => {
                  if (inviting) return;
                  setInviting(true);
                  void inviteAMate().finally(() => setInviting(false));
                }}
                disabled={inviting}
                accessibilityRole="button"
                accessibilityHint="Makes a link to share. When they join, you’ll follow each other."
                accessibilityState={{ busy: inviting }}
              >
                {inviting ? (
                  <ActivityIndicator color={COLORS.offBlack} />
                ) : (
                  <Text style={styles.retryBtnText}>{INVITE_BUTTON}</Text>
                )}
              </Pressable>
            </View>
          ) : !searched ? (
            <View style={styles.centered}>
              <Text style={[styles.hintText, { color: muted }]}>
                Find friends on Mahi. Follow each other and you can tag each other.
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <UserRow
                  item={item}
                  dark={dark}
                  onPress={() => {
                    if (item.id === currentUserId) {
                      // Your own row goes to your Profile page.
                      Keyboard.dismiss();
                      if (onOpenOwnProfile) onOpenOwnProfile();
                      else onClose();
                      return;
                    }
                    Sentry.addBreadcrumb({
                      category: 'search',
                      message: `Profile tapped: ${item.id}`,
                      level: 'info',
                    });
                    Keyboard.dismiss();
                    setProfileUserId(item.id);
                  }}
                />
              )}
              // Rows that run under the keyboard stay reachable by scrolling.
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              style={{ maxHeight: windowHeight * LAYOUT.searchResultsHeight }}
            />
          )}
        </Animated.View>
      </View>

      {/* Full-screen profile — shown when a search result is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
      {inviteSheet}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: ALPHA.a70,
  },
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: LAYER.overlay,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.s16,
    paddingBottom: SPACE.s14,
    gap: SPACE.s10,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s16,
    paddingVertical: Platform.OS === 'ios' ? SPACE.s12 : SPACE.s9,
    // Subtle inner border for glass feel
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(COLORS.white, ALPHA.a25),
  },
  magnify: {
    marginRight: SPACE.s8,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f15,
  },
  cancelBtn: {
    paddingVertical: SPACE.s8,
    paddingHorizontal: SPACE.s4,
  },
  cancelText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SPACE.s16,
    marginBottom: SPACE.s4,
  },
  list: {
    paddingHorizontal: SPACE.s20,
    paddingTop: SPACE.s8,
    paddingBottom: SPACE.s24,
  },
  centered: {
    alignItems: 'center',
    paddingTop: SPACE.s48,
    paddingHorizontal: SPACE.s24,
  },
  emptyText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
    textAlign: 'center',
    marginBottom: SPACE.s8,
  },
  hintText: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f14,
    letterSpacing: TRACKING.t0_5,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.pill,
    minHeight: SIZE.z44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.s24,
    marginTop: SPACE.s16,
  },
  retryBtnText: {
    color: COLORS.offBlack,
    fontSize: FONT_SIZE.f15,
    fontFamily: FONTS.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.r20,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s12,
    gap: SPACE.s12,
    marginBottom: SPACE.s8,
  },
  avatar: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: FONT_SIZE.f18,
    fontFamily: FONTS.bold,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
    letterSpacing: TRACKING.t1,
  },
  handle: {
    fontFamily: FONTS.regular,
    fontSize: FONT_SIZE.f13,
  },
  points: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
  },
});
