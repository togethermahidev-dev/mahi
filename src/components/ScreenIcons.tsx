import React from 'react';
import Svg, { Path, Circle, Line, G, Text as SvgText, Rect } from 'react-native-svg';

export interface IconProps {
  size: number;
  color: string;
}

export function HomeIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ProIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
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
  const discCx    = 12;
  const discCy    = 10;
  const discR     = 8;
  const countStr  = count > 999 ? '999+' : String(count);
  const fontSize  = countStr.length > 2 ? 5 : countStr.length > 1 ? 6 : 7;
  const textColor = filled ? '#FFFFFF' : color;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Ribbon tails — always visible */}
      {/* Left ribbon — red */}
      <Path
        d="M9 17 L7 24 L12 21 Z"
        fill="#E05A5A"
      />
      {/* Right ribbon — Mahi blue */}
      <Path
        d="M15 17 L17 24 L12 21 Z"
        fill="#59c2d7"
      />
      {/* Centre ribbon strip */}
      <Path
        d="M10.5 17 L11 24 L13 24 L13.5 17 Z"
        fill={color}
        opacity={0.5}
      />

      {/* Echo disc — always #59c2d7, offset (+1.5, +1.5) */}
      <Circle
        cx={discCx + 1.5}
        cy={discCy + 1.5}
        r={discR}
        fill="#59c2d7"
        opacity={0.35}
      />

      {/* Main disc */}
      <Circle
        cx={discCx}
        cy={discCy}
        r={discR}
        fill={filled ? '#59c2d7' : 'transparent'}
        stroke={filled ? '#59c2d7' : color}
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
        fontFamily="JosefinSans_700Bold"
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
  const bubble = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Echo layer — #59c2d7, offset */}
      <G transform="translate(1.5, 1.5)">
        <Path d={bubble} fill="#59c2d7" opacity={0.35} />
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

export function MessagesIcon({ size, color }: IconProps) {
  const bubble = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Blue echo — offset behind, same treatment as the MAHI logo */}
      <G transform="translate(2, 2)">
        <Path d={bubble} fill="#59c2d7" />
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
