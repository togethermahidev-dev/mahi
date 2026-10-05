import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardInset from '@/components/KeyboardInset';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useConversation } from '@/hooks/useConversation';
import { useMessages } from '@/hooks/useMessages';
import { groupMessagesByDate, type GroupedRow } from '@/lib/groupMessages';
import type { ConversationPreview } from '@/api';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  BORDER_WIDTH,
  FONT_SIZE,
  LINE_HEIGHT,
  OFFSET,
  RADIUS,
  SIZE,
  SPACE,
  TRACKING,
  withAlpha,
} from '@/constants/tokens';

interface ConversationScreenProps {
  conversation: ConversationPreview;
  currentUserId: string;
  onBack: () => void;
}

export default function ConversationScreen({
  conversation,
  currentUserId,
  onBack,
}: ConversationScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a40)
    : withAlpha(COLORS.offBlack, ALPHA.a40);
  const border = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a12)
    : withAlpha(COLORS.offBlack, ALPHA.a12);
  const ownBubble = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a15)
    : withAlpha(COLORS.offBlack, ALPHA.a10);
  const otherBubble = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a07)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  const { messages, isLoading, isLoadingOlder, hasMore, send, loadOlder, markRead } =
    useConversation(conversation.id);
  const { accept, deny } = useMessages();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  // Track local accepted state so the banner dismisses immediately
  const [accepted, setAccepted] = useState(conversation.status === 'active');

  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  // The keyboard covers the home-indicator strip, so that inset only applies while it is closed.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardOpen(true)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const otherName = conversation.other_profile.display_name ?? conversation.other_profile.username;

  const isRequest = !accepted;
  const isReceiver = conversation.initiated_by !== currentUserId;

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    setSending(true);
    setInputText('');
    const sent = await send(content);
    // Put the text back rather than losing it — the send is safe to try again.
    if (!sent) setInputText(content);
    setSending(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // Read on open, and again as each message arrives while the screen is up.
  const newest = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!isLoading) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, isLoading, newest]);

  const handleAccept = async () => {
    await accept(conversation.id);
    setAccepted(true);
  };

  const handleDeny = () => {
    Alert.alert(
      'Deny request?',
      `The request from @${conversation.other_profile.username} and its messages will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deny',
          style: 'destructive',
          onPress: async () => {
            await deny(conversation.id);
            onBack();
          },
        },
      ]
    );
  };

  // FlatList renders newest at bottom — use inverted list with reversed grouped rows
  const rows = useMemo<GroupedRow[]>(() => groupMessagesByDate(messages).reverse(), [messages]);

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onBack}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View
          style={[styles.header, { borderBottomColor: border, paddingTop: insets.top + SPACE.s8 }]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: border },
              pressed && styles.pressed,
            ]}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </Pressable>
          <Text style={[styles.headerName, { color: text }]} numberOfLines={1}>
            {otherName}
          </Text>
          {/* Spacer to keep name centred */}
          <View style={styles.backBtn} />
        </View>

        {/* Request banner — shown to the receiver before they accept */}
        {isRequest && isReceiver ? (
          <View style={[styles.requestBanner, { borderBottomColor: border, backgroundColor: bg }]}>
            <Text style={[styles.requestText, { color: muted }]}>
              Message request from @{conversation.other_profile.username}
            </Text>
            <View style={styles.requestActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.requestBtn,
                  { borderColor: text },
                  pressed && styles.pressed,
                ]}
                onPress={handleAccept}
                accessibilityRole="button"
                accessibilityLabel="Accept request"
              >
                <Text style={[styles.requestBtnText, { color: text }]}>Accept</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.requestBtn,
                  styles.denyBtn,
                  pressed && styles.pressed,
                ]}
                onPress={handleDeny}
                accessibilityRole="button"
                accessibilityLabel="Deny request"
              >
                <Text style={[styles.requestBtnText, styles.denyText]}>Deny</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Message list */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={muted} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={rows}
            keyExtractor={(item) => (item.type === 'header' ? item.id : item.msg.id)}
            inverted
            contentContainerStyle={styles.listContent}
            onEndReached={hasMore ? loadOlder : undefined}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingOlder ? (
                <View style={styles.olderWrap}>
                  <ActivityIndicator color={muted} size="small" />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayHeaderText, { color: muted }]}>{item.label}</Text>
                  </View>
                );
              }
              const msg = item.msg;
              const isOwn = msg.sender_id === currentUserId;
              return (
                <View
                  style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}
                >
                  <View
                    style={[styles.bubble, { backgroundColor: isOwn ? ownBubble : otherBubble }]}
                  >
                    <Text style={[styles.bubbleText, { color: text }]}>{msg.content}</Text>
                  </View>
                  {item.showTime ? (
                    <Text style={[styles.bubbleTime, { color: muted }]}>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </Text>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyWrap}>
                  <Text style={[styles.emptyText, { color: muted }]}>No messages yet</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Input bar — the inset below it grows with the keyboard, so the bar rides on top. */}
        <View style={{ backgroundColor: bg }}>
          <View
            style={[
              styles.inputBar,
              {
                borderTopColor: border,
                paddingBottom: keyboardOpen ? SPACE.s10 : Math.max(insets.bottom, SPACE.s10),
              },
            ]}
          >
            <TextInput
              style={[styles.input, { color: text, borderColor: border }]}
              placeholder="Message…"
              placeholderTextColor={muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              // Return sends; long messages still wrap and grow the field.
              submitBehavior="submit"
              maxLength={1000}
              returnKeyType="send"
              enablesReturnKeyAutomatically
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                { opacity: inputText.trim() ? 1 : ALPHA.a35 },
                pressed && styles.pressed,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !inputText.trim() || sending }}
            >
              <Text style={[styles.sendText, { color: text }]}>Send</Text>
            </Pressable>
          </View>
          <KeyboardInset />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: ALPHA.a70,
  },
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACE.s16,
    paddingHorizontal: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l22,
  },
  headerName: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    letterSpacing: TRACKING.t3,
  },
  requestBanner: {
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACE.s10,
  },
  requestText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.regular,
    textAlign: 'center',
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s12,
  },
  requestBtn: {
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s6,
  },
  denyBtn: {
    borderColor: COLORS.danger,
  },
  requestBtnText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.semiBold,
  },
  denyText: {
    color: COLORS.danger,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  olderWrap: {
    paddingVertical: SPACE.s12,
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s12,
    flexGrow: 1,
  },
  bubbleWrap: {
    marginVertical: SPACE.s4,
    maxWidth: '75%',
    gap: SPACE.s3,
  },
  bubbleWrapOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s8,
  },
  bubbleText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l20,
  },
  bubbleTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.regular,
    paddingHorizontal: SPACE.s4,
  },
  dayHeader: {
    alignItems: 'center',
    paddingVertical: SPACE.s8,
    marginTop: SPACE.s4,
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.regular,
    letterSpacing: TRACKING.t1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACE.s60,
  },
  emptyText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.s10,
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.r20,
    paddingHorizontal: SPACE.s16,
    paddingVertical: SPACE.s8,
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    maxHeight: SIZE.z100,
  },
  sendBtn: {
    paddingBottom: SPACE.s8,
  },
  sendText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.bold,
  },
});
