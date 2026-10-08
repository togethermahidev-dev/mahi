import React from 'react';
import { Platform } from 'react-native';
import Svg, { Path, Circle, Line, G, Rect } from 'react-native-svg';
import { COLORS, ALPHA, STROKE } from '@/constants/tokens';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import {
  SF_SYMBOL_WEIGHT,
  sfSymbolFor,
  symbolsAvailable,
  type ScreenIconKey,
} from '@/lib/sfSymbols';
import { hasNativeSymbols, loadExpoSymbols } from '@/lib/symbolModule';

export interface IconProps {
  size: number;
  color: string;
}

/*
 * Each plain icon below has two looks: today's drawing, and on iPhone Apple's own icon (SF Symbol,
 * flag `ios-sf-symbols`, build 11+). The exported icons at the bottom pick one, so call sites don't
 * change. The brand "echo" icons (CommentIcon, MessagesIcon) are always drawn.
 * Mapping and rules: src/lib/sfSymbols.ts.
 */

/**
 * Apple's icon at the same size and colour when this iPhone build has it and the flag is on;
 * otherwise the drawing (Android, build 10, flag off). Hidden from VoiceOver like the drawings:
 * the button around each icon carries the label.
 */
function SymbolOr({
  icon,
  size,
  color,
  children,
}: IconProps & { icon: ScreenIconKey; children: React.ReactElement }) {
  const flagOn = useFeatureFlag('ios-sf-symbols');
  const name = sfSymbolFor(icon, symbolsAvailable(Platform.OS, hasNativeSymbols(), flagOn));
  const symbols = name ? loadExpoSymbols() : null;
  if (!name || !symbols) return children;
  return (
    <symbols.SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={SF_SYMBOL_WEIGHT}
      fallback={children}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function SearchDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={STROKE.s1_8} />
      <Line
        x1="16.5"
        y1="16.5"
        x2="22"
        y2="22"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CameraDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={STROKE.s1_8} />
    </Svg>
  );
}

function FeedDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Three stacked post lines — social feed / news feed */}
      <Path d="M4 6h16" stroke={color} strokeWidth={STROKE.s1_8} strokeLinecap="round" />
      <Path d="M4 12h16" stroke={color} strokeWidth={STROKE.s1_8} strokeLinecap="round" />
      <Path d="M4 18h10" stroke={color} strokeWidth={STROKE.s1_8} strokeLinecap="round" />
    </Svg>
  );
}

function ProfileDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth={STROKE.s1_8} />
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
        <Path d={bubble} fill={COLORS.accent} opacity={ALPHA.a35} />
      </G>
      {/* Main bubble */}
      <Path
        d={bubble}
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SettingsDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="3"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function NotificationsDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Bell body — rounded cap, flared skirt */}
      <Path
        d="M12 3 C9.24 3 7 5.24 7 8 v4 l-2 2 v1 h14 v-1 l-2 -2 V8 c0 -2.76 -2.24 -5 -5 -5 z"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Clapper */}
      <Path
        d="M10 18 a2 2 0 1 0 4 0 h-4 z"
        stroke={color}
        strokeWidth={STROKE.s1_8}
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
function HeartDrawing({ size, color, filled = false }: IconProps & { filled?: boolean }) {
  const heart =
    'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={heart}
        fill={filled ? COLORS.dangerAlt : 'transparent'}
        stroke={filled ? COLORS.dangerAlt : color}
        strokeWidth={STROKE.s1_8}
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
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** VideoIcon — a film camera: marks a video in a post or on a profile square. */
function VideoDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 10l5.5-3.2a.6.6 0 0 1 .9.5v9.4a.6.6 0 0 1-.9.5L15 14"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const SPEAKER = 'M11 5L6 9H3v6h3l5 4V5z';

/** SoundOnIcon — a speaker with sound waves (the video is playing with sound). */
function SoundOnDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={SPEAKER} stroke={color} strokeWidth={STROKE.s1_8} strokeLinejoin="round" />
      <Path
        d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** SoundOffIcon — a speaker with a cross (the video is muted). */
function SoundOffDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={SPEAKER} stroke={color} strokeWidth={STROKE.s1_8} strokeLinejoin="round" />
      <Path
        d="M16 9.5l5 5M21 9.5l-5 5"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Three dots in a row: the '…' menu on posts and comments. */
function MoreDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={5} cy={12} r={2} />
      <Circle cx={12} cy={12} r={2} />
      <Circle cx={19} cy={12} r={2} />
    </Svg>
  );
}

function EmojiDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={STROKE.s1_8} />
      <Circle cx="9" cy="10" r="1.2" fill={color} />
      <Circle cx="15" cy="10" r="1.2" fill={color} />
      <Path
        d="M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2"
        stroke={color}
        strokeWidth={STROKE.s1_8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function KeyboardDrawing({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="20" height="14" rx="2.5" stroke={color} strokeWidth={STROKE.s1_8} />
      <G fill={color}>
        <Circle cx="6.5" cy="9.5" r="1" />
        <Circle cx="10.2" cy="9.5" r="1" />
        <Circle cx="13.8" cy="9.5" r="1" />
        <Circle cx="17.5" cy="9.5" r="1" />
      </G>
      <Path d="M8 15h8" stroke={color} strokeWidth={STROKE.s1_8} strokeLinecap="round" />
    </Svg>
  );
}

// ── The icons the app uses ──

export function SearchIcon(props: IconProps) {
  return (
    <SymbolOr icon="search" {...props}>
      <SearchDrawing {...props} />
    </SymbolOr>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <SymbolOr icon="camera" {...props}>
      <CameraDrawing {...props} />
    </SymbolOr>
  );
}

export function FeedIcon(props: IconProps) {
  return (
    <SymbolOr icon="feed" {...props}>
      <FeedDrawing {...props} />
    </SymbolOr>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <SymbolOr icon="profile" {...props}>
      <ProfileDrawing {...props} />
    </SymbolOr>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <SymbolOr icon="settings" {...props}>
      <SettingsDrawing {...props} />
    </SymbolOr>
  );
}

export function NotificationsIcon(props: IconProps) {
  return (
    <SymbolOr icon="notifications" {...props}>
      <NotificationsDrawing {...props} />
    </SymbolOr>
  );
}

/** Filled = liked: a solid heart in the same red as the drawing. */
export function HeartIcon({ size, color, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <SymbolOr
      icon={filled ? 'heartFilled' : 'heart'}
      size={size}
      color={filled ? COLORS.dangerAlt : color}
    >
      <HeartDrawing size={size} color={color} filled={filled} />
    </SymbolOr>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <SymbolOr icon="video" {...props}>
      <VideoDrawing {...props} />
    </SymbolOr>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <SymbolOr icon="soundOn" {...props}>
      <SoundOnDrawing {...props} />
    </SymbolOr>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <SymbolOr icon="soundOff" {...props}>
      <SoundOffDrawing {...props} />
    </SymbolOr>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <SymbolOr icon="more" {...props}>
      <MoreDrawing {...props} />
    </SymbolOr>
  );
}

/** The composers' emoji button. */
export function EmojiIcon(props: IconProps) {
  return (
    <SymbolOr icon="emoji" {...props}>
      <EmojiDrawing {...props} />
    </SymbolOr>
  );
}

/** The same button while emoji is up: back to letters. */
export function KeyboardIcon(props: IconProps) {
  return (
    <SymbolOr icon="keyboard" {...props}>
      <KeyboardDrawing {...props} />
    </SymbolOr>
  );
}

/** A small clock: the on-time line under a poster's name. Always drawn. */
export function ClockIcon({ size, color }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={STROKE.s2} />
      <Path
        d="M12 7v5l3 2"
        stroke={color}
        strokeWidth={STROKE.s2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
