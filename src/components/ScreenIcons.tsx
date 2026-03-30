import React from 'react';
import Svg, { Path, Circle, Line, G } from 'react-native-svg';

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
      {/* Top card — avatar dot + two text lines */}
      <Circle cx="5" cy="6" r="1.5" stroke={color} strokeWidth={1.6} />
      <Path d="M9 5.5h7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M9 8h5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      {/* Image block */}
      <Path
        d="M3 11h18v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
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
