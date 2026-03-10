import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useMessages } from '@/hooks/useMessages';
import type { ConversationPreview } from '@/api';

const TABS = ['INBOX', 'REQUESTS'] as const;
type TabIndex = 0 | 1;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConvoRow({
  item,
  showAccept,
  onAccept,
  text,
  muted,
  border,
}: {
  item:        ConversationPreview;
  showAccept:  boolean;
  onAccept?:   () => void;
  text:        string;
  muted:       string;
  border:      string;
}) {
  const name     = item.other_profile.display_name ?? item.other_profile.username;
  const initials = (item.other_profile.username ?? '?')[0].toUpperCase();
  const preview  = item.last_message?.content
    ? item.last_message.content.length > 40
      ? item.last_message.content.slice(0, 40) + '…'
      : item.last_message.content
    : '';

  return (
    <View style={[styles.convoRow, { borderBottomColor: border }]}>
      {/* Avatar */}
      {item.other_profile.avatar_url ? (
        <Image source={{ uri: item.other_profile.avatar_url }} style={styles.convoAvatar} />
      ) : (
        <View style={[styles.convoAvatar, styles.convoAvatarFallback, { backgroundColor: muted }]}>
          <Text style={[styles.convoInitial, { color: text }]}>{initials}</Text>
        </View>
      )}

      {/* Name + last message */}
      <View style={styles.convoInfo}>
        <Text style={[styles.convoName, { color: text }]}>{name}</Text>
        {preview ? (
          <Text style={[styles.convoPreview, { color: muted }]}>{preview}</Text>
        ) : null}
      </View>

      {/* Right side: timestamp or accept button */}
      <View style={styles.convoRight}>
        <Text style={[styles.convoTime, { color: muted }]}>
          {relativeTime(item.updated_at)}
        </Text>
        {showAccept && onAccept ? (
          <TouchableOpacity
            style={[styles.acceptBtn, { borderColor: text }]}
            onPress={onAccept}
            activeOpacity={0.7}
          >
            <Text style={[styles.acceptText, { color: text }]}>ACCEPT</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function MessagesScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg     = dark ? '#1C1C19' : '#FFFFFF';
  const text   = dark ? '#E8E8E3' : '#1A1A17';
  const muted  = dark ? 'rgba(232,232,227,0.4)' : 'rgba(26,26,23,0.4)';
  const border = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';

  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const { inbox, requests, isLoading, refresh, accept } = useMessages();

  const switchTab = (index: TabIndex) => {
    setActiveTab(index);
    Animated.spring(indicatorAnim, {
      toValue: index,
      damping: 18,
      stiffness: 140,
      useNativeDriver: false,
    }).start();
  };

  const emptyText = activeTab === 0 ? 'No messages yet' : 'No requests';

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Text style={[styles.headerTitle, { color: text }]}>MESSAGES</Text>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: border }]}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={styles.tab}
            onPress={() => switchTab(i as TabIndex)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === i ? text : muted },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Animated underline indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: text,
              transform: [
                {
                  translateX: indicatorAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      {/* Tab content */}
      <View style={styles.content}>
        {activeTab === 0 ? (
          <FlatList
            data={inbox}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConvoRow
                item={item}
                showAccept={false}
                text={text}
                muted={muted}
                border={border}
              />
            )}
            refreshing={isLoading}
            onRefresh={refresh}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.placeholder}>
                  <Text style={[styles.placeholderTitle, { color: text }]}>INBOX</Text>
                  <Text style={[styles.placeholderSub, { color: muted }]}>{emptyText}</Text>
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConvoRow
                item={item}
                showAccept={true}
                onAccept={() => accept(item.id)}
                text={text}
                muted={muted}
                border={border}
              />
            )}
            refreshing={isLoading}
            onRefresh={refresh}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.placeholder}>
                  <Text style={[styles.placeholderTitle, { color: text }]}>REQUESTS</Text>
                  <Text style={[styles.placeholderSub, { color: muted }]}>{emptyText}</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
  tabBar: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '50%',
    height: 2,
    borderRadius: 1,
  },
  content: {
    flex: 1,
  },
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  convoAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  convoAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  convoInitial: {
    fontSize: 16,
    fontFamily: 'JosefinSans_700Bold',
  },
  convoInfo: {
    flex: 1,
    gap: 3,
  },
  convoName: {
    fontSize: 13,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 1.5,
  },
  convoPreview: {
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  convoRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  convoTime: {
    fontSize: 11,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  acceptBtn: {
    borderWidth: 1,
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  acceptText: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 20,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  placeholderSub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
