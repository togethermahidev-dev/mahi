import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Animated,
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { searchProfiles, type ProfileSearchResult } from '@/api';
import { useAuthStore, useBlockStore } from '@/store';
import UserProfileScreen from '@/screens/UserProfileScreen';
import { Sentry } from '@/lib/sentry';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

function UserRow({
  item,
  dark,
  onPress,
}: {
  item: ProfileSearchResult;
  dark: boolean;
  onPress: () => void;
}) {
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const avatarBg = dark ? '#2A2A27' : '#E8E8E3';

  const displayName = item.display_name ?? item.first_name ?? item.username ?? '—';
  const initials = displayName[0]?.toUpperCase() ?? '?';

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
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
      {item.streak_current != null && item.streak_current > 0 ? (
        <Text style={[styles.streakText, { color: muted }]}>🔥 {item.streak_current}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

interface GlobalSearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

export default function GlobalSearchOverlay({
  visible,
  onClose,
  dark,
}: GlobalSearchOverlayProps): React.JSX.Element | null {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-24)).current;
  const inputRef = useRef<TextInput>(null);

  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const inputBg = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tint = dark ? 'dark' : 'light';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe-up anywhere on the overlay dismisses it (and blocks the gesture
  // from leaking through to the VerticalNavigator behind it).
  const dismissPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, { dy }) => Math.abs(dy) > 20,
      onPanResponderRelease: (_e, { dy, vy }) => {
        if (dy < -60 || vy < -0.4) {
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
      Animated.parallel([
        Animated.spring(fadeAnim, {
          toValue: 1,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        inputRef.current?.focus();
      });
    } else {
      inputRef.current?.blur();
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -24, duration: 180, useNativeDriver: true }),
      ]).start();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQuery('');
      setResults([]);
      setSearched(false);
      setProfileUserId(null);
    }
  }, [visible]);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await searchProfiles(value);
        if (error) {
          console.log('[GlobalSearch] search error |', error.message);
          Sentry.captureMessage(error.message, {
            level: 'warning',
            tags: { flow: 'search' },
            extra: { query: value },
          });
        }
        const filtered = (data ?? []).filter((u) => !useBlockStore.getState().isBlocked(u.id));
        console.log('[GlobalSearch] query:', value, '| results:', filtered.length);
        setResults(filtered);
        setSearched(true);
      } catch (e) {
        console.log('[GlobalSearch] search exception |', e);
        Sentry.captureException(e, { tags: { flow: 'search' }, extra: { query: value } });
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]} {...dismissPan.panHandlers}>
      {/* Full-screen frosted glass background */}
      <BlurView intensity={35} tint={tint} style={StyleSheet.absoluteFill} />

      {/* Subtle colour wash on top of blur */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: dark ? 'rgba(18,18,16,0.25)' : 'rgba(250,250,248,0.25)',
          },
        ]}
        pointerEvents="none"
      />

      {/* Tap backdrop to dismiss */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.inner, { transform: [{ translateY: slideAnim }] }]}>
          {/* Search bar row */}
          <View style={styles.barRow}>
            <View style={[styles.pill, { backgroundColor: inputBg }]}>
              <Text style={[styles.magnify, { color: muted }]}>⌕</Text>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: text }]}
                placeholder="Search users..."
                placeholderTextColor={muted}
                value={query}
                onChangeText={handleChange}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.cancelText, { color: text }]}>CANCEL</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View
            style={[
              styles.divider,
              { backgroundColor: dark ? 'rgba(232,232,227,0.1)' : 'rgba(26,26,23,0.08)' },
            ]}
          />

          {/* Results */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={muted} />
            </View>
          ) : searched && results.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: muted }]}>No results for "{query}"</Text>
            </View>
          ) : !searched ? (
            <View style={styles.centered}>
              <Text style={[styles.hintText, { color: muted }]}>Search for people on MAHI</Text>
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
                      console.log('[GlobalSearch] tap own profile — ignored |', item.id);
                      return;
                    }
                    console.log('[GlobalSearch] tap profile |', item.id, '| user:', item.username);
                    Sentry.addBreadcrumb({
                      category: 'search',
                      message: `Profile tapped: ${item.username}`,
                      level: 'info',
                    });
                    Keyboard.dismiss();
                    setProfileUserId(item.id);
                  }}
                />
              )}
              ItemSeparatorComponent={() => (
                <View
                  style={[
                    styles.separator,
                    { backgroundColor: dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.06)' },
                  ]}
                />
              )}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
              style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}
            />
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Full-screen profile — shown when a search result is tapped */}
      {profileUserId ? (
        <UserProfileScreen
          key={profileUserId}
          userId={profileUserId}
          onBack={() => setProfileUserId(null)}
          dark={dark}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  inner: {
    paddingTop: Platform.OS === 'ios' ? 64 : 36,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    // Subtle inner border for glass feel
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  magnify: {
    fontSize: 20,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 15,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  centered: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 15,
  },
  hintText: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 15,
    letterSpacing: 1,
  },
  handle: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 13,
  },
  streakText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
  },
  separator: {
    height: 1,
  },
});
