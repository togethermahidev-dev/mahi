import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { STROKE } from '@/constants/tokens';
import type { InviteChannel } from '@/lib/myInvites';
import type { ShareTarget } from '@/lib/tagSlots';
import { BRAND_MARK } from '@/lib/brandMarks';
import { ProfileIcon } from '@/components/ScreenIcons';

/**
 * How an invite went out, or where a share button sends: WhatsApp, Messages, Snapchat and
 * Instagram are those apps' own logos (owner, 2026-10-10; drawings in src/lib/brandMarks.ts),
 * filled in `color`; the share sheet, a copied link, a contact and a plain link (older invites)
 * are Mahi's line drawings. `outline` draws a line round a logo (Snapchat's ghost). Hidden from
 * VoiceOver: the words beside it say the same.
 */
export default function InviteChannelIcon({
  channel,
  size,
  color,
  outline,
}: {
  channel: Exclude<InviteChannel, 'joined'> | Exclude<ShareTarget, 'more'>;
  size: number;
  color: string;
  outline?: string;
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
      {channel === 'whatsapp' ||
      channel === 'messages' ||
      channel === 'snapchat' ||
      channel === 'instagram' ? (
        <Path
          d={BRAND_MARK[channel]}
          fill={color}
          stroke={outline}
          strokeWidth={outline ? STROKE.s1_2 : undefined}
          strokeLinejoin="round"
        />
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
