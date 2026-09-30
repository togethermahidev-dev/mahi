import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useConversation } from '@/hooks/useConversation';
import { useMessages } from '@/hooks/useMessages';
import { groupMessagesByDate, type GroupedRow } from '@/lib/groupMessages';
import type { ConversationPreview } from '@/api';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

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
  const muted = dark ? withAlpha(COLORS.offWhite, 0.4) : withAlpha(COLORS.offBlack, 0.4);
  const border = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.12);
  const ownBubble = dark ? withAlpha(COLORS.offWhite, 0.15) : withAlpha(COLORS.offBlack, 0.1);
  const otherBubble = dark ? withAlpha(COLORS.offWhite, 0.07) : withAlpha(COLORS.offBlack, 0.05);

  const { messages, isLoading, isLoadingOlder, hasMore, send, loadOlder, markRead } =
    useConversation(conversation.id);
  const { accept, deny } = useMessages();

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  // Track local accepted state so the banner dismisses immediately
  const [accepted, setAccepted] = useState(conversation.status === 'active');

  const flatListRef = useRef<FlatList>(null);

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

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => sub.remove();
  }, []);

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

  const handleDeny = async () => {
    await deny(conversation.id);
    onBack();
  };

  // FlatList renders newest at bottom — use inverted list with reversed grouped rows
  const rows = useMemo<GroupedRow[]>(() => groupMessagesByDate(messages).reverse(), [messages]);

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onBack}>
      <View style={[styles.root, { backgroundColor: bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: border }]}>
          <TouchableOpacity
            onPress={onBack}
            style={[styles.backBtn, { borderColor: border }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: text }]}>‹</Text>
          </TouchableOpacity>
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
              <TouchableOpacity
                style={[styles.requestBtn, { borderColor: text }]}
                onPress={handleAccept}
                activeOpacity={0.7}
              >
                <Text style={[styles.requestBtnText, { color: text }]}>ACCEPT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.requestBtn, styles.denyBtn]}
                onPress={handleDeny}
                activeOpacity={0.7}
              >
                <Text style={[styles.requestBtnText, styles.denyText]}>DENY</Text>
              </TouchableOpacity>
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

        {/* Input bar */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.inputBar, { borderTopColor: border, backgroundColor: bg }]}>
            <TextInput
              style={[styles.input, { color: text, borderColor: border }]}
              placeholder="Message…"
              placeholderTextColor={muted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { opacity: inputText.trim() ? 1 : 0.35 }]}
              onPress={handleSend}
              activeOpacity={0.7}
              disabled={!inputText.trim() || sending}
            >
              <Text style={[styles.sendText, { color: text }]}>SEND</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? SPACE.s60 : SPACE.s32,
    paddingBottom: SPACE.s16,
    paddingHorizontal: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: FONT_SIZE.f20,
    fontFamily: FONTS.italic,
    lineHeight: 22,
  },
  headerName: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.bold,
    letterSpacing: 3,
  },
  requestBanner: {
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACE.s10,
  },
  requestText: {
    fontSize: FONT_SIZE.f12,
    fontFamily: FONTS.italic,
    textAlign: 'center',
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s12,
  },
  requestBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.r50,
    paddingHorizontal: SPACE.s20,
    paddingVertical: SPACE.s6,
  },
  denyBtn: {
    borderColor: COLORS.danger,
  },
  requestBtnText: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.semiBold,
    letterSpacing: 2,
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
    fontFamily: FONTS.italic,
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize: FONT_SIZE.f10,
    fontFamily: FONTS.italic,
    paddingHorizontal: SPACE.s4,
  },
  dayHeader: {
    alignItems: 'center',
    paddingVertical: SPACE.s8,
    marginTop: SPACE.s4,
  },
  dayHeaderText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.italic,
    letterSpacing: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACE.s60,
  },
  emptyText: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.italic,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACE.s16,
    paddingTop: SPACE.s10,
    // Extra bottom padding on iOS to clear the home-indicator area —
    // without a SafeAreaView the input bar was sitting under the indicator.
    paddingBottom: Platform.OS === 'ios' ? SPACE.s34 : SPACE.s10,
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
    fontFamily: FONTS.italic,
    maxHeight: 100,
  },
  sendBtn: {
    paddingBottom: SPACE.s8,
  },
  sendText: {
    fontSize: FONT_SIZE.f11,
    fontFamily: FONTS.bold,
    letterSpacing: 2,
  },
});
