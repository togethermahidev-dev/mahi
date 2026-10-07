import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { STROKE } from '@/constants/tokens';
import type { InviteChannel } from '@/lib/myInvites';
import { ProfileIcon } from '@/components/ScreenIcons';

/**
 * How an invite went out, as a small line drawing for its row in "Your invites": WhatsApp, a text,
 * the share sheet, a copied link, a contact, or a plain link (older invites). Hidden from
 * VoiceOver: the row's words say the same.
 */
export default function InviteChannelIcon({
  channel,
  size,
  color,
}: {
  channel: Exclude<InviteChannel, 'joined'>;
  size: number;
  color: string;
}): React.JSX.Element {
  if (channel === 'contact') return <ProfileIcon size={size} color={color} />;
  const line = {
    stroke: color,
    strokeWidth: STROKE.s1_8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {channel === 'whatsapp' ? (
        <>
          {/* A round chat bubble with a phone inside. */}
          <Path d="M3 21l1.5-4.6A8.6 8.6 0 1 1 7.7 19.5z" {...line} />
          <Path
            d="M9 8.5c0 3.3 3.2 6.5 6.5 6.5l1-1.6-2-1-1 .8a5 5 0 0 1-2.2-2.2l.8-1-1-2z"
            {...line}
          />
        </>
      ) : channel === 'messages' ? (
        <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...line} />
      ) : channel === 'share' ? (
        <>
          <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" {...line} />
          <Path d="M16 6l-4-4-4 4" {...line} />
          <Path d="M12 2v13" {...line} />
        </>
      ) : channel === 'copy' ? (
        <>
          <Rect x="9" y="9" width="12" height="12" rx="2" {...line} />
          <Path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" {...line} />
        </>
      ) : (
        <>
          <Path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" {...line} />
          <Path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" {...line} />
        </>
      )}
    </Svg>
  );
}
