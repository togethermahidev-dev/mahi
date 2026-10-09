import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { STROKE } from '@/constants/tokens';
import type { InviteChannel } from '@/lib/myInvites';
import type { ShareTarget } from '@/lib/tagSlots';
import { ProfileIcon } from '@/components/ScreenIcons';

/**
 * How an invite went out, as a small line drawing for its row in "Your invites": WhatsApp, a text,
 * the share sheet, a copied link, a contact, or a plain link (older invites). The tag screen's
 * buttons also draw Snap and IG (plain marks, not the brands' artwork). Hidden from VoiceOver: the
 * words beside it say the same.
 */
export default function InviteChannelIcon({
  channel,
  size,
  color,
}: {
  channel: Exclude<InviteChannel, 'joined'> | Exclude<ShareTarget, 'more'>;
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
      ) : channel === 'snapchat' ? (
        // A ghost.
        <Path
          d="M12 3a5 5 0 0 0-5 5v3l-2 1 2 1c-.5 1.5-1.8 2.5-3.5 3 1 .8 2 .7 3 1l.5 1.5c1 0 2-.5 3 0 .8.4 1.3 1 2 1s1.2-.6 2-1c1-.5 2 0 3 0l.5-1.5c1-.3 2-.2 3-1-1.7-.5-3-1.5-3.5-3l2-1-2-1V8a5 5 0 0 0-5-5z"
          {...line}
        />
      ) : channel === 'instagram' ? (
        // A camera: rounded square, lens and flash.
        <>
          <Rect x="3" y="3" width="18" height="18" rx="5" {...line} />
          <Circle cx="12" cy="12" r="4" {...line} />
          <Circle cx="17.2" cy="6.8" r="0.6" {...line} />
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
