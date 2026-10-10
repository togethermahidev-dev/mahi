import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getMessages, type Message } from '@/api';
import { messagePreviewText } from '@/lib/sharedPost';
import { reportError } from '@/lib/sentry';
import { previewMessages } from '@/lib/contextMenuPreview';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  ALPHA,
  FONT_SIZE,
  LINE_HEIGHT,
  RADIUS,
  SPACE,
  withAlpha,
} from '@/constants/tokens';
import { themeColors } from '@/hooks/useAppTheme';

/**
 * A chat's hold-to-preview pop-up (standard, no switch): the latest few messages, read
 * fresh from the server each time it opens — a loading state first, nothing kept on the phone,
 * and reading them here doesn't mark them read.
 */
export default function ChatPreview({
  conversationId,
  name,
  currentUserId,
  dark,
}: {
  conversationId: string;
  name: string;
  currentUserId: string | undefined;
  dark: boolean;
}): React.JSX.Element {
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const { muted } = themeColors(dark);
  const ownBubble = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a15)
    : withAlpha(COLORS.offBlack, ALPHA.a10);
  const otherBubble = dark
    ? withAlpha(COLORS.offWhite, ALPHA.a07)
    : withAlpha(COLORS.offBlack, ALPHA.a05);

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getMessages(conversationId).then(({ data, error }) => {
      if (error) {
        reportError(error, { flow: 'messages', action: 'loadPreview', extra: { conversationId } });
      }
      if (!live) return;
      if (data) setMessages(previewMessages(data));
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [conversationId]);

  let body: React.ReactNode;
  if (failed) {
    body = <Text style={[styles.note, { color: muted }]}>Couldn't load messages</Text>;
  } else if (!messages) {
    body = <ActivityIndicator color={muted} accessibilityLabel="Loading messages" />;
  } else if (messages.length === 0) {
    body = <Text style={[styles.note, { color: muted }]}>No messages yet</Text>;
  } else {
    body = messages.map((msg) => {
      const own = msg.sender_id === currentUserId;
      return (
        <View
          key={msg.id}
          style={[
            styles.bubble,
            own ? styles.own : styles.other,
            { backgroundColor: own ? ownBubble : otherBubble },
          ]}
        >
          <Text style={[styles.bubbleText, { color: text }]} numberOfLines={3}>
            {messagePreviewText(msg)}
          </Text>
        </View>
      );
    });
  }

  return (
    <View style={styles.root}>
      <Text style={[styles.name, { color: text }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={[styles.list, (failed || !messages?.length) && styles.centered]}>{body}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: SPACE.s16,
    gap: SPACE.s12,
  },
  name: {
    fontSize: FONT_SIZE.f16,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  // The newest message sits at the bottom, as in the chat.
  list: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: SPACE.s8,
    overflow: 'hidden',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: RADIUS.r16,
    paddingHorizontal: SPACE.s14,
    paddingVertical: SPACE.s8,
  },
  own: {
    alignSelf: 'flex-end',
  },
  other: {
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: FONT_SIZE.f14,
    fontFamily: FONTS.regular,
    lineHeight: LINE_HEIGHT.l20,
  },
  note: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.regular,
  },
});
