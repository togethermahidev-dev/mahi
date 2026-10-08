/**
 * Hold to preview (standard for everyone since 2026-10-06, no switch; needs build 11): on an
 * iPhone, press and hold a profile grid square, a Messages row or a feed post and the content pops out over a
 * blurred background with a short menu below (Apple's context menu, via @expo/ui's SwiftUI
 * ContextMenu). Pure rules, unit-tested; the native side (is @expo/ui in this build?) lives in
 * `src/lib/expoUiModule.ts`, kept apart so these stay testable under node.
 */
import { PREVIEW_MENU } from '@/constants/tokens';
import type { SFSymbolName } from '@/lib/sfSymbols';
import { gridTile, mediaTypeOrPhoto, type MediaType } from '@/lib/videoPosts';

/**
 * On only on iOS, with @expo/ui's native module in this build, and with the flag on. OTA updates
 * also reach build 10, which has no @expo/ui: there it must behave exactly as flag off.
 */
export function contextMenuAvailable(input: {
  platform: string;
  nativeModulePresent: boolean;
  flagOn: boolean;
}): boolean {
  return input.platform === 'ios' && input.nativeModulePresent && input.flagOn;
}

export const MENU_ACTIONS = [
  'open',
  'like',
  'unlike',
  'comment',
  'share',
  'mark-read',
  'view-profile',
] as const;

export type MenuAction = (typeof MENU_ACTIONS)[number];

/** One menu row: what it does, its words, and its Apple icon (SF Symbol name). */
export interface MenuItem {
  action: MenuAction;
  label: string;
  systemImage: SFSymbolName;
}

const OPEN: MenuItem = {
  action: 'open',
  label: 'Open',
  systemImage: 'arrow.up.left.and.arrow.down.right',
};
const LIKE: MenuItem = { action: 'like', label: 'Like', systemImage: 'heart' };
const UNLIKE: MenuItem = { action: 'unlike', label: 'Unlike', systemImage: 'heart.slash' };
const COMMENT: MenuItem = { action: 'comment', label: 'Comment', systemImage: 'bubble.right' };
const SHARE: MenuItem = { action: 'share', label: 'Share', systemImage: 'square.and.arrow.up' };
const MARK_READ: MenuItem = {
  action: 'mark-read',
  label: 'Mark as read',
  systemImage: 'checkmark.message',
};
const VIEW_PROFILE: MenuItem = {
  action: 'view-profile',
  label: 'View profile',
  systemImage: 'person.crop.circle',
};

/** A profile grid square (owner, 2026-10-02): Open, Like / Unlike, Share. */
export function gridMenuItems(input: { liked: boolean; canShare: boolean }): MenuItem[] {
  return [OPEN, input.liked ? UNLIKE : LIKE, ...(input.canShare ? [SHARE] : [])];
}

/**
 * A Messages row: Open, and Mark as read while the chat has unread messages. There is no mute on
 * the server, so the menu offers none.
 */
export function messagesMenuItems(input: { unread: boolean }): MenuItem[] {
  return [OPEN, ...(input.unread ? [MARK_READ] : [])];
}

/** A feed post (replaces hold to view): Like / Unlike, Comment, Share, View profile. */
export function postMenuItems(input: { liked: boolean; canShare: boolean }): MenuItem[] {
  return [input.liked ? UNLIKE : LIKE, COMMENT, ...(input.canShare ? [SHARE] : []), VIEW_PROFILE];
}

/** The same choices as VoiceOver actions, leaving out what a plain tap already does. */
export function menuA11yActions(
  items: MenuItem[],
  skip: MenuAction[] = []
): { name: MenuAction; label: string }[] {
  return items
    .filter((i) => !skip.includes(i.action))
    .map((i) => ({ name: i.action, label: i.label }));
}

/** True for our menu actions; false for VoiceOver's own (activate, escape, magicTap…). */
export function isMenuAction(name: string): name is MenuAction {
  return (MENU_ACTIONS as readonly string[]).includes(name);
}

/** How many of a chat's latest messages its preview shows. */
export const PREVIEW_MESSAGE_COUNT = 6;

/** The newest few messages, still oldest first (as the conversation reads). */
export function previewMessages<T>(messages: T[], count = PREVIEW_MESSAGE_COUNT): T[] {
  return messages.slice(Math.max(0, messages.length - count));
}

/** The first shot that is a photo with a link: the one a post's preview shows. */
export function previewStill(
  shots: { uri: string | null | undefined; kind: MediaType }[]
): string | null {
  return shots.find((s) => s.kind === 'photo' && !!s.uri)?.uri ?? null;
}

/**
 * What Share sends: the post's photo (the main one, else the selfie); a post of two videos sends
 * its main video. A post still uploading has its files on the phone already. Locked: nothing.
 */
export function shareTarget(post: {
  image_url: string;
  pov_image_url: string | null;
  image_path?: string | null;
  pov_image_path?: string | null;
  rear_media_type?: string | null;
  front_media_type?: string | null;
}): { uri: string; ext: 'jpg' | 'mov' | 'mp4'; local: boolean } | null {
  const tile = gridTile(post);
  let uri: string | null = tile.uri;
  let ext: 'jpg' | 'mov' | 'mp4' = 'jpg';
  if (!uri && mediaTypeOrPhoto(post.rear_media_type) === 'video' && post.image_url) {
    uri = post.image_url;
    ext = /\.mov$/i.test(post.image_path ?? post.image_url) ? 'mov' : 'mp4';
  }
  if (!uri) return null;
  return { uri, ext, local: uri.startsWith('file:') };
}

/** The pop-up's size in points: a portrait post, or a chat, with room below for the menu. */
export function previewSize(
  screen: { width: number; height: number },
  kind: 'post' | 'chat'
): { width: number; height: number } {
  if (kind === 'chat') {
    return {
      width: Math.round(screen.width * PREVIEW_MENU.chatWidth),
      height: Math.round(screen.height * PREVIEW_MENU.chatHeight),
    };
  }
  const maxHeight = screen.height * PREVIEW_MENU.postMaxHeight;
  const width = Math.min(
    screen.width * PREVIEW_MENU.postWidth,
    maxHeight / PREVIEW_MENU.postAspect
  );
  return { width: Math.round(width), height: Math.round(width * PREVIEW_MENU.postAspect) };
}
