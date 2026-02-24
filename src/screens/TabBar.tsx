import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Platform,
  useColorScheme,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Line } from 'react-native-svg';

import CameraScreen from './CameraScreen';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

interface IconProps {
  size: number;
  color: string;
}

function HomeIcon({ size, color }: IconProps) {
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

function SearchIcon({ size, color }: IconProps) {
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

function CameraIcon({ size, color }: IconProps) {
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

function ActivityIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 20V10M12 20V4M6 20v-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ProfileIcon({ size, color }: IconProps) {
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

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'home',     Icon: HomeIcon },
  { key: 'search',   Icon: SearchIcon },
  { key: 'camera',   Icon: CameraIcon },
  { key: 'activity', Icon: ActivityIcon },
  { key: 'profile',  Icon: ProfileIcon },
] as const;

// ─── Placeholder screen ───────────────────────────────────────────────────────

function Placeholder({ bg }: { bg: string }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: bg }]} />;
}

// ─── MainShell ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 50;

export default function TabBar(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState(2); // camera is the default tab
  const dark = useColorScheme() === 'dark';
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10,
      onPanResponderRelease: (_evt, { dx }) => {
        const current = activeTabRef.current;
        if (dx < -SWIPE_THRESHOLD && current < TABS.length - 1) {
          // Swipe left → next tab
          setActiveTab(current + 1);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (dx > SWIPE_THRESHOLD && current > 0) {
          // Swipe right → previous tab
          setActiveTab(current - 1);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
    })
  ).current;

  const tabBg        = dark ? '#1C1C19' : '#FFFFFF';
  const activeColor  = dark ? '#FFFFFF' : '#0F0F0D';
  const mutedColor   = dark ? '#444444' : '#BBBBBB';
  const borderColor  = dark ? '#2A2A27' : '#E8E8E3';
  const placeholderBg = dark ? '#1C1C19' : '#F5F5F0';

  function renderContent() {
    switch (activeTab) {
      case 2:  return <CameraScreen />;
      default: return <Placeholder bg={placeholderBg} />;
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.content} {...panResponder.panHandlers}>{renderContent()}</View>

      <View style={[styles.tabBar, { backgroundColor: tabBg, borderTopColor: borderColor }]}>
        {TABS.map(({ key, Icon }, i) => {
          const isActive = activeTab === i;
          const isCenter = i === 2;
          const iconColor = isActive ? activeColor : mutedColor;

          return (
            <TouchableOpacity
              key={key}
              style={styles.tabItem}
              activeOpacity={0.7}
              onPress={() => setActiveTab(i)}
            >
              {isCenter ? (
                // Camera tab — always rendered as a pill/circle button
                <View
                  style={[
                    styles.centerWrap,
                    {
                      backgroundColor: activeColor,
                      opacity: isActive ? 1 : 0.55,
                    },
                  ]}
                >
                  <Icon size={22} color={tabBg} />
                </View>
              ) : (
                <Icon size={24} color={iconColor} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TAB_HEIGHT   = 60;
const BOTTOM_INSET = Platform.OS === 'ios' ? 20 : 0;

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    height: TAB_HEIGHT + BOTTOM_INSET,
    paddingBottom: BOTTOM_INSET,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_HEIGHT,
  },

  // Center camera tab — pill/circle treatment
  centerWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
