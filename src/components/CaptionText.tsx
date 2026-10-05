import React from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import type { TaggedUser } from '@/api';
import { COLORS } from '@/constants/tokens';

interface Props {
  caption: string;
  tagged: TaggedUser[];
  style: StyleProp<TextStyle>;
  onPressUser?: (user: TaggedUser) => void;
  numberOfLines?: number;
}

/**
 * Renders a caption with `@username` tokens highlighted in cyan when the
 * username matches a tagged user. Tapping a highlighted token calls
 * `onPressUser` with that user. Plain text passes through unchanged.
 */
export default function CaptionText({ caption, tagged, style, onPressUser, numberOfLines }: Props) {
  if (!caption) return null;
  if (tagged.length === 0)
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {caption}
      </Text>
    );

  // Escape defensively in case a username contains regex metacharacters.
  const escaped = tagged.map((u) => u.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})\\b`, 'g');
  const byName = new Map(tagged.map((u) => [u.username, u]));

  // The caption split into plain text and tagged names, in order.
  const parts: { start: number; text: string; user?: TaggedUser }[] = [];
  let last = 0;
  for (const m of caption.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ start: last, text: caption.slice(last, start) });
    parts.push({ start, text: m[0], user: byName.get(m[1]) });
    last = start + m[0].length;
  }
  if (last < caption.length) parts.push({ start: last, text: caption.slice(last) });

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map(({ start, text, user }) =>
        user ? (
          <Text
            key={start}
            style={{ color: COLORS.accent }}
            onPress={onPressUser ? () => onPressUser(user) : undefined}
          >
            {text}
          </Text>
        ) : (
          text
        )
      )}
    </Text>
  );
}
