import React from 'react';
import Svg, { Path, Circle, Line, G, Text as SvgText } from 'react-native-svg';
import { FONTS } from '@/constants/fonts';
import { COLORS } from '@/constants/tokens';

export interface IconProps {
  size: number;
  color: string;
}

export function SearchIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={1.8} />
      <Line
        x1="16.5"
        y1="16.5"
        x2="22"
        y2="22"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function FeedIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Three stacked post lines — social feed / news feed */}
      <Path d="M4 6h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 12h16" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 18h10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ProfileIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/**
 * LikeIcon — medal with count inside the disc.
 * Mahi colorway: ribbon tails in #E05A5A (left) + #59c2d7 (right),
 * disc echo offset in #59c2d7, disc filled #59c2d7 when liked / outline when not.
 * Count number always visible inside the disc.
 */
export function LikeIcon({
  size,
  color,
  filled = false,
  count = 0,
}: IconProps & { filled?: boolean; count?: number }) {
  const discCx = 12;
  const discCy = 10;
  const discR = 8;
  const countStr = count > 999 ? '999+' : String(count);
  const fontSize = countStr.length > 2 ? 5 : countStr.length > 1 ? 6 : 7;
  const textColor = filled ? COLORS.white : color;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Ribbon tails — always visible */}
      {/* Left ribbon — red */}
      <Path d="M9 17 L7 24 L12 21 Z" fill={COLORS.dangerAlt} />
      {/* Right ribbon — Mahi blue */}
      <Path d="M15 17 L17 24 L12 21 Z" fill={COLORS.accent} />
      {/* Centre ribbon strip */}
      <Path d="M10.5 17 L11 24 L13 24 L13.5 17 Z" fill={color} opacity={0.5} />

      {/* Echo disc — always #59c2d7, offset (+1.5, +1.5) */}
      <Circle cx={discCx + 1.5} cy={discCy + 1.5} r={discR} fill={COLORS.accent} opacity={0.35} />

      {/* Main disc */}
      <Circle
        cx={discCx}
        cy={discCy}
        r={discR}
        fill={filled ? COLORS.accent : 'transparent'}
        stroke={filled ? COLORS.accent : color}
        strokeWidth={1.5}
      />

      {/* Count text inside disc */}
      <SvgText
        x={discCx}
        y={discCy + fontSize * 0.38}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="bold"
        fill={textColor}
        fontFamily={FONTS.bold}
      >
        {countStr}
      </SvgText>
    </Svg>
  );
}

/**
 * CommentIcon — speech bubble with Mahi dual-layer echo.
 * Same double-layer treatment as MessagesIcon.
 */
export function CommentIcon({ size, color }: IconProps) {
  const bubble = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Echo layer — #59c2d7, offset */}
      <G transform="translate(1.5, 1.5)">
        <Path d={bubble} fill={COLORS.accent} opacity={0.35} />
      </G>
      {/* Main bubble */}
      <Path
        d={bubble}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SettingsIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function NotificationsIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Bell body — rounded cap, flared skirt */}
      <Path
        d="M12 3 C9.24 3 7 5.24 7 8 v4 l-2 2 v1 h14 v-1 l-2 -2 V8 c0 -2.76 -2.24 -5 -5 -5 z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Clapper */}
      <Path
        d="M10 18 a2 2 0 1 0 4 0 h-4 z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * HeartIcon — simple heart for like button (IG Reels / TikTok style).
 * Filled red when liked, outline when not.
 */
export function HeartIcon({ size, color, filled = false }: IconProps & { filled?: boolean }) {
  const heart =
    'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={heart}
        fill={filled ? COLORS.dangerAlt : 'transparent'}
        stroke={filled ? COLORS.dangerAlt : color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function MessagesIcon({ size, color }: IconProps) {
  const bubble = 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Blue echo — offset behind, same treatment as the MAHI logo */}
      <G transform="translate(2, 2)">
        <Path d={bubble} fill={COLORS.accent} />
      </G>
      {/* Main bubble — front layer, adapts to theme */}
      <Path
        d={bubble}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
