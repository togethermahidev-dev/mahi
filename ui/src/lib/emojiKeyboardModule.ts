/**
 * The emoji keyboard's native side (the local module ui/modules/mahi-emoji-keyboard), loaded only
 * when this build has it.
 *
 * The module ships in build 13. OTA updates also reach builds 10 to 12, which don't have it, so
 * nothing here touches it until `requireOptionalNativeModule('MahiEmojiKeyboard')` (null instead
 * of a throw) says it's there. No module = no emoji button anywhere; typing works as before.
 * iPhone: functions that switch the focused field to the phone's own emoji keyboard and back.
 * Android: a view (androidx EmojiPickerView) shown in the keyboard's place. Rules in
 * src/lib/emojiKeyboard.ts. Tested in src/lib/__tests__/nativeLoaders.test.ts.
 */
import type React from 'react';
import { Platform, type ViewProps } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export interface EmojiKeyboardNative {
  /** iPhone: switch the focused field (or the next one to focus) to emoji, or back to letters.
   * Resolves true when the emoji keyboard is (or will be) up. */
  setEmojiMode(on: boolean): Promise<boolean>;
  /** iPhone: the keyboard changed by itself (the globe key, or the field closed). */
  addListener(
    event: 'onEmojiModeChange',
    listener: (e: { emoji: boolean }) => void
  ): { remove(): void };
}

/** The Android panel; `showLetters` brings the keyboard back to the field it types into. */
export interface EmojiPanelHandle {
  showLetters(): Promise<boolean>;
}
export type EmojiPanelView = React.ComponentType<ViewProps & { ref?: React.Ref<EmojiPanelHandle> }>;

let nativeModule: EmojiKeyboardNative | null | undefined;
let panelView: EmojiPanelView | null | undefined;

function lookUp(): EmojiKeyboardNative | null {
  if (nativeModule === undefined) {
    try {
      nativeModule =
        Platform.OS === 'ios' || Platform.OS === 'android'
          ? requireOptionalNativeModule<EmojiKeyboardNative>('MahiEmojiKeyboard')
          : null;
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

/** True on a build (13+) with the emoji keyboard module. */
export function hasNativeEmojiKeyboard(): boolean {
  return lookUp() != null;
}

/** The native module, or null without it. */
export function loadEmojiKeyboard(): EmojiKeyboardNative | null {
  return lookUp();
}

/** Android's emoji panel view, or null (iPhone, or a build without the module). Looked up once. */
export function loadEmojiPanelView(): EmojiPanelView | null {
  if (panelView !== undefined) return panelView;
  if (Platform.OS !== 'android' || !hasNativeEmojiKeyboard()) {
    panelView = null;
    return panelView;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeView } = require('expo') as typeof import('expo');
    panelView = requireNativeView('MahiEmojiKeyboard') as unknown as EmojiPanelView;
  } catch {
    panelView = null;
  }
  return panelView;
}
