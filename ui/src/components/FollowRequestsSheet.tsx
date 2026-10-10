import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFollowRequests } from '@/hooks/useFollowRequests';
import { useToastStore } from '@/store/toastStore';
import { reportError } from '@/lib/sentry';
import ListState from '@/components/ListState';
import UserProfileScreen from '@/screens/UserProfileScreen';
import type { FollowRequest } from '@/api';
import {
  ALPHA,
  BORDER_WIDTH,
  COLORS,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { GLYPH, TYPOGRAPHY } from '@/constants/typography';
import { themeColors } from '@/lib/themeColors';

/**
 * Follow requests to my private account (switch `private-accounts`): Confirm or Delete each,
 * the inline Accept / Not now pattern of the notifications list. Read fresh on every open, live
 * while open, never kept on the phone. Delete is silent: they aren't told.
 */
export default function FollowRequestsSheet({
  visible,
  onClose,
  dark,
}: {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { text, muted, border, bg } = themeColors(dark);
  const surface = dark ? COLORS.surfaceDark : COLORS.white;
  const iconSurface = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a08)
    : withAlpha(COLORS.offBlack, ALPHA.a05);
  const { requests, failed, isLoading, reload, respond } = useFollowRequests(visible);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const show = useToastStore((s) => s.show);

  const answer = async (request: FollowRequest, accept: boolean) => {
    const { data, error } = await respond(request.requester_id, accept);
    if (error) {
      reportError(error, {
        flow: 'follows',
        action: 'answerFollowRequest',
        level: 'warning',
        extra: { accept, rpc: 'respond_follow_request' },
      });
      show('Couldn’t answer that request. Try again.');
      return;
    }
    if (accept && data?.status === 'accepted') show(`@${request.username} follows you now.`);
  };

  const slop = { top: OFFSET.o4, bottom: OFFSET.o4, left: OFFSET.o4, right: OFFSET.o4 };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { backgroundColor: iconSurface, borderColor: border },
              pressed && styles.pressed,
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: text }]} accessibilityRole="header">
              Follow requests
            </Text>
            <Text style={[styles.headerLine, { color: muted }]}>
              Only people you confirm see your workouts
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ListState kind="loading" dark={dark} />
        ) : failed && !requests ? (
          <ListState
            kind="error"
            dark={dark}
            title="Couldn’t load your follow requests"
            onAction={() => void reload()}
          />
        ) : (
          <FlashList
            data={requests ?? []}
            keyExtractor={(r) => r.requester_id}
            contentContainerStyle={{ ...styles.list, paddingBottom: insets.bottom + SPACE.s12 }}
            ListEmptyComponent={
              <ListState
                kind="empty"
                dark={dark}
                title="No follow requests"
                line="When someone asks to follow you, they show up here."
              />
            }
            renderItem={({ item }) => {
              const name = item.display_name ?? item.username;
              return (
                <View style={[styles.row, { backgroundColor: surface, borderColor: border }]}>
                  <Pressable
                    style={({ pressed }) => [styles.who, pressed && styles.pressed]}
                    onPress={() => setProfileUserId(item.requester_id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, @${item.username}`}
                    accessibilityHint="Opens their profile"
                  >
                    {item.avatar_url ? (
                      <Image
                        source={{ uri: item.avatar_url, cache: 'force-cache' }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.avatar,
                          styles.avatarFallback,
                          { backgroundColor: iconSurface },
                        ]}
                      >
                        <Text style={[styles.initial, { color: text }]}>
                          {(name[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.handle, { color: muted }]} numberOfLines={1}>
                        @{item.username} wants to follow you
                      </Text>
                    </View>
                  </Pressable>
                  <View style={styles.buttons}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Confirm @${item.username}’s follow request`}
                      hitSlop={slop}
                      style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}
                      onPress={() => void answer(item, true)}
                    >
                      <Text style={styles.confirmText}>Confirm</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete @${item.username}’s follow request`}
                      accessibilityHint="They won’t be told"
                      hitSlop={slop}
                      style={({ pressed }) => [
                        styles.delete,
                        { borderColor: border },
                        pressed && styles.pressed,
                      ]}
                      onPress={() => void answer(item, false)}
                    >
                      <Text style={[styles.deleteText, { color: text }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}

        {profileUserId ? (
          <UserProfileScreen
            key={profileUserId}
            userId={profileUserId}
            onBack={() => setProfileUserId(null)}
            dark={dark}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pressed: {
    opacity: ALPHA.a70,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    // Shown in a page sheet, which already starts below the status bar.
    paddingTop: SPACE.s16,
    paddingBottom: SPACE.s20,
    paddingHorizontal: SPACE.s20,
    gap: SPACE.s12,
  },
  backBtn: {
    width: SIZE.z44,
    height: SIZE.z44,
    borderRadius: RADIUS.r22,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    ...GLYPH.icon,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...TYPOGRAPHY.sheetTitle,
  },
  headerLine: {
    ...TYPOGRAPHY.caption,
    marginTop: SPACE.s2,
  },
  list: {
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
  },
  row: {
    gap: SPACE.s12,
    paddingVertical: SPACE.s12,
    paddingHorizontal: SPACE.s16,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r20,
    marginBottom: SPACE.s8,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s12,
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
  initial: {
    ...TYPOGRAPHY.h4,
  },
  rowText: {
    flex: 1,
    gap: SPACE.s2,
  },
  name: {
    ...TYPOGRAPHY.bodyStrong,
  },
  handle: {
    ...TYPOGRAPHY.caption,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACE.s8,
  },
  confirm: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.r50,
    minHeight: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s16,
  },
  confirmText: {
    ...TYPOGRAPHY.labelStrong,
    color: COLORS.offBlack,
  },
  delete: {
    flex: 1,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    minHeight: SIZE.z36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.s16,
  },
  deleteText: {
    ...TYPOGRAPHY.labelStrong,
  },
});
