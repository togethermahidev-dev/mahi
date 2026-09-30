import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  CameraIcon,
  FeedIcon,
  MessagesIcon,
  ProfileIcon,
  type IconProps,
} from '@/components/ScreenIcons';
import { SPACE, RADIUS } from '@/constants/tokens';

export type RailTab = 'camera' | 'feed' | 'messages' | 'profile';

const TABS: { key: RailTab; Icon: React.ComponentType<IconProps> }[] = [
  { key: 'camera', Icon: CameraIcon },
  { key: 'feed', Icon: FeedIcon },
  { key: 'messages', Icon: MessagesIcon },
  { key: 'profile', Icon: ProfileIcon },
];

interface NavRailProps {
  active: RailTab;
  onSelect: (tab: RailTab) => void;
  /** The screen behind is dark (Camera), so icons go light whatever the theme. */
  onDark: boolean;
  /** Android blurs this view's content (expo-blur needs a BlurTargetView ref there). */
  blurTarget?: React.RefObject<View | null>;
}

/**
 * Floating glass rail on the right edge: Apple's Liquid Glass on iOS 26+, a frosted blur on
 * older iPhones and on Android. Centred vertically, inside the safe area.
 */
export default function NavRail({ active, onSelect, onDark, blurTarget }: NavRailProps) {
  const { colors, navRail } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scheme = onDark ? 'dark' : 'light';
  const iconColor = onDark ? colors.offWhite : colors.offBlack;

  const buttons = TABS.map(({ key, Icon }) => {
    const selected = key === active;
    return (
      <TouchableOpacity
        key={key}
        accessibilityRole="button"
        accessibilityLabel={key}
        accessibilityState={{ selected }}
        activeOpacity={0.7}
        onPress={() => {
          if (selected) return;
          Haptics.selectionAsync();
          onSelect(key);
        }}
        style={[
          styles.button,
          { width: navRail.width - 8, height: navRail.width - 8, marginVertical: navRail.gap / 2 },
          selected && { backgroundColor: colors.accent },
        ]}
      >
        <Icon size={20} color={selected ? colors.offBlack : iconColor} />
      </TouchableOpacity>
    );
  });

  const shape = [styles.rail, { width: navRail.width, borderRadius: navRail.width / 2 }];

  let body: React.JSX.Element;
  if (isLiquidGlassAvailable()) {
    body = (
      <GlassView style={shape} glassEffectStyle="regular" colorScheme={scheme} isInteractive>
        {buttons}
      </GlassView>
    );
  } else if (Platform.OS === 'ios' || blurTarget) {
    body = (
      <BlurView
        style={[shape, styles.clip]}
        intensity={60}
        tint={onDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
      >
        {buttons}
      </BlurView>
    );
  } else {
    body = (
      <View style={[shape, { backgroundColor: onDark ? colors.glassOnDark : colors.glassOnLight }]}>
        {buttons}
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        {
          right: insets.right + navRail.edgeGap,
          top: insets.top,
          bottom: insets.bottom,
        },
      ]}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    justifyContent: 'center',
    zIndex: 300,
  },
  rail: {
    alignItems: 'center',
    paddingVertical: SPACE.s4,
  },
  clip: {
    overflow: 'hidden',
  },
  button: {
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
