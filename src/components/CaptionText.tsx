import React from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import type { TaggedUser } from '@/api';

interface Props {
  caption:      string;
  tagged:       TaggedUser[];
  style:        StyleProp<TextStyle>;
  onPressUser?: (user: TaggedUser) => void;
}

/**
 * Renders a caption with `@username` tokens highlighted in cyan when the
 * username matches a tagged user. Tapping a highlighted token calls
 * `onPressUser` with that user. Plain text passes through unchanged.
 */
export default function CaptionText({ caption, tagged, style, onPressUser }: Props) {
  if (!caption) return null;
  if (tagged.length === 0) return <Text style={style}>{caption}</Text>;

  // Escape defensively in case a username contains regex metacharacters.
  const escaped = tagged.map((u) => u.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})\\b`, 'g');
  const byName = new Map(tagged.map((u) => [u.username, u]));

  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of caption.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(caption.slice(last, start));
    const user = byName.get(m[1]);
    parts.push(
      <Text
        key={`${start}-${m[1]}`}
        style={{ color: '#59c2d7' }}
        onPress={user && onPressUser ? () => onPressUser(user) : undefined}
      >
        {m[0]}
      </Text>,
    );
    last = start + m[0].length;
  }
  if (last < caption.length) parts.push(caption.slice(last));

  return <Text style={style}>{parts}</Text>;
}
