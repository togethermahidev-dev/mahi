import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useConversation } from '@/hooks/useConversation';
import { useMessages } from '@/hooks/useMessages';
import type { ConversationPreview } from '@/api';

interface ConversationScreenProps {
  conversation:  ConversationPreview;
  currentUserId: string;
  onBack:        () => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function ConversationScreen({
  conversation,
  currentUserId,
  onBack,
}: ConversationScreenProps): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg      = dark ? '#1C1C19' : '#FFFFFF';
  const text    = dark ? '#E8E8E3' : '#1A1A17';
  const muted   = dark ? 'rgba(232,232,227,0.4)' : 'rgba(26,26,23,0.4)';
  const border  = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';
  const ownBubble  = dark ? 'rgba(232,232,227,0.15)' : 'rgba(26,26,23,0.1)';
  const otherBubble = dark ? 'rgba(232,232,227,0.07)' : 'rgba(26,26,23,0.05)';

  const { messages, isLoading, send } = useConversation(conversation.id);
  const { accept, deny } = useMessages();

  const [inputText, setInputText] = useState('');
  const [sending, setSending]     = useState(false);
  // Track local accepted state so the banner dismisses immediately
  const [accepted, setAccepted]   = useState(conversation.status === 'active');

  const flatListRef = useRef<FlatList>(null);

  const otherName = conversation.other_profile.display_name ?? conversation.other_profile.username;

  const isRequest  = !accepted;
  const isReceiver = conversation.initiated_by !== currentUserId;

  const handleSend = async () => {
    const content = inputText.trim();
    if (!content || sending) return;
    setSending(true);
    setInputText('');
    await send(content);
    setSending(false);
  };

  const handleAccept = async () => {
    await accept(conversation.id);
    setAccepted(true);
  };

  const handleDeny = async () => {
    await deny(conversation.id);
    onBack();
  };

  // FlatList renders newest at bottom — use inverted list with reversed data
  const reversed = [...messages].reverse();

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={[styles.backArrow, { color: text }]}>←</Text>
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
          data={reversed}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isOwn = item.sender_id === currentUserId;
            return (
              <View style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}>
                <View
                  style={[
                    styles.bubble,
                    { backgroundColor: isOwn ? ownBubble : otherBubble },
                  ]}
                >
                  <Text style={[styles.bubbleText, { color: text }]}>{item.content}</Text>
                </View>
                <Text style={[styles.bubbleTime, { color: muted }]}>
                  {relativeTime(item.created_at)}
                </Text>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingTop:       Platform.OS === 'ios' ? 60 : 32,
    paddingBottom:    16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    alignItems: 'flex-start',
  },
  backArrow: {
    fontSize:   22,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  headerName: {
    flex:       1,
    textAlign:  'center',
    fontSize:   16,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 3,
  },
  requestBanner: {
    paddingHorizontal: 24,
    paddingVertical:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  requestText: {
    fontSize:   12,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign:  'center',
  },
  requestActions: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            12,
  },
  requestBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 20,
    paddingVertical:   6,
  },
  denyBtn: {
    borderColor: '#FF6B6B',
  },
  requestBtnText: {
    fontSize:   10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  denyText: {
    color: '#FF6B6B',
  },
  loadingWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical:   12,
    flexGrow:          1,
  },
  bubbleWrap: {
    marginVertical: 4,
    maxWidth:       '75%',
    gap:            3,
  },
  bubbleWrapOwn: {
    alignSelf:  'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignSelf:  'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius:  16,
    paddingHorizontal: 14,
    paddingVertical:   8,
  },
  bubbleText: {
    fontSize:   14,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 20,
  },
  bubbleTime: {
    fontSize:   10,
    fontFamily: 'JosefinSans_400Regular_Italic',
    paddingHorizontal: 4,
  },
  emptyWrap: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     60,
  },
  emptyText: {
    fontSize:   13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  inputBar: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderTopWidth:    StyleSheet.hairlineWidth,
    gap:               10,
  },
  input: {
    flex:              1,
    borderWidth:       StyleSheet.hairlineWidth,
    borderRadius:      20,
    paddingHorizontal: 16,
    paddingVertical:   8,
    fontSize:          14,
    fontFamily:        'JosefinSans_400Regular_Italic',
    maxHeight:         100,
  },
  sendBtn: {
    paddingBottom: 8,
  },
  sendText: {
    fontSize:   11,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 2,
  },
});
