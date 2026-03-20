import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { searchProfiles, type ProfileSearchResult } from '@/api';

function UserRow({ item, dark }: { item: ProfileSearchResult; dark: boolean }) {
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const avatarBg = dark ? '#2A2A27' : '#E8E8E3';

  const displayName = item.display_name ?? item.first_name ?? item.username ?? '—';
  const initials    = displayName[0]?.toUpperCase() ?? '?';

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7}>
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
        <View style={styles.streakBadge}>
          <Text style={[styles.streakText, { color: muted }]}>
            🔥 {item.streak_current}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function SearchScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg        = dark ? '#1C1C19' : '#FFFFFF';
  const text      = dark ? '#E8E8E3' : '#1A1A17';
  const muted     = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const inputBg   = dark ? '#2A2A27' : '#F2F2EF';
  const border    = dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.08)';

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const { data } = await searchProfiles(value);
      setResults(data ?? []);
      setSearched(true);
      setLoading(false);
    }, 350);
  }, []);

  const hasContent = loading || searched;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>

      {hasContent ? (
        /* Active state — bar at top, results below */
        <>
          <View style={styles.barTop}>
            <View style={[styles.pill, { backgroundColor: inputBg }]}>
              <Text style={[styles.magnify, { color: muted }]}>⌕</Text>
              <TextInput
                style={[styles.input, { color: text }]}
                placeholder="Search users, workouts..."
                placeholderTextColor={muted}
                value={query}
                onChangeText={handleChange}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={muted} />
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: muted }]}>No results for "{query}"</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <UserRow item={item} dark={dark} />}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: border }]} />
              )}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
            />
          )}
        </>
      ) : (
        /* Idle state — pill dead centre */
        <View style={styles.idleCenter}>
          <View style={[styles.pill, { backgroundColor: inputBg }]}>
            <Text style={[styles.magnify, { color: muted }]}>⌕</Text>
            <TextInput
              style={[styles.input, { color: text }]}
              placeholder="Search users, workouts..."
              placeholderTextColor={muted}
              value={query}
              onChangeText={handleChange}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
  },
  idleCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  barTop: {
    paddingTop: Platform.OS === 'ios' ? 72 : 48,
    paddingBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 50,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.15)',
  },
  magnify: {
    fontSize: 20,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 15,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 15,
  },
  list: {
    paddingHorizontal: 4,
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
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  streakText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
  },
  separator: {
    height: 1,
  },
});
