import React, { useState } from 'react';
import { View, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { VideoIcon } from '@/components/ScreenIcons';
import { loadSwiftUI } from '@/lib/expoUiModule';
import type { MenuAction, MenuItem } from '@/lib/contextMenuPreview';
import { COLORS, ICON_SIZE } from '@/constants/tokens';

/**
 * Hold to preview (flag `context-menu-preview`, iPhone, build 11): press and hold `children` and
 * Apple's context menu lifts the preview over a blurred background with `items` below.
 *
 * Render this only when `useContextMenuPreview()` is true — it needs @expo/ui's native views.
 *
 * - `children` stay exactly what they were (taps, double taps and their gesture-handler gestures
 *   keep working inside): they are hosted in SwiftUI only so the system's long press can own the
 *   hold. The system's hold gives way when the finger moves, so scrolling and page swipes win.
 * - The preview's content is mounted only while the pop-up shows (`renderPreview`), so a list of
 *   these keeps no second picture per row in memory.
 */
export default function PreviewMenu({
  enabled = true,
  width,
  height,
  style,
  dark,
  items,
  onAction,
  previewSize,
  previewBackground,
  renderPreview,
  children,
}: {
  /** False: just `children`, exactly as without the pop-up (no extra views). */
  enabled?: boolean;
  /** The held content's size. Without `height` it takes its own height (a list row). */
  width: number;
  height?: number;
  /** Outer spacing (margins) around the held content. */
  style?: StyleProp<ViewStyle>;
  dark: boolean;
  items: MenuItem[];
  onAction: (action: MenuAction) => void;
  previewSize: { width: number; height: number };
  /** Fills the pop-up while its content loads. */
  previewBackground: string;
  /** What pops out; mounted when the pop-up opens and dropped when it closes. */
  renderPreview: () => React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  if (!enabled) return <>{children}</>;
  const swift = loadSwiftUI();
  const size = height == null ? { width } : { width, height };

  // Never expected (the caller checked), but a build without @expo/ui shows the plain content.
  if (!swift) return <View style={[size, style]}>{children}</View>;

  const { Host, ContextMenu, Button, RNHostView, VStack } = swift.ui;
  const { frame, onAppear, onDisappear } = swift.modifiers;

  return (
    <Host
      style={[size, style]}
      matchContents={height == null ? { vertical: true } : undefined}
      colorScheme={dark ? 'dark' : 'light'}
    >
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <View style={size}>{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <VStack
            modifiers={[
              frame({ width: previewSize.width, height: previewSize.height }),
              onAppear(() => setOpen(true)),
              onDisappear(() => setOpen(false)),
            ]}
          >
            <RNHostView matchContents>
              <View style={[previewSize, { backgroundColor: previewBackground }]}>
                {open ? renderPreview() : null}
              </View>
            </RNHostView>
          </VStack>
        </ContextMenu.Preview>
        <ContextMenu.Items>
          {items.map((item) => (
            <Button
              key={item.action}
              label={item.label}
              systemImage={item.systemImage}
              onPress={() => onAction(item.action)}
            />
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

/** A post's pop-up: its photo, filling the preview; a post of two videos shows the video mark. */
export function PostPreviewImage({ uri }: { uri: string | null }): React.JSX.Element {
  if (!uri) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.videoTile]}>
        <VideoIcon size={ICON_SIZE.i32} color={COLORS.white} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri, cache: 'force-cache' }}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  videoTile: {
    backgroundColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
