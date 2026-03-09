import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

const TABS = ['INBOX', 'REQUESTS'] as const;
type TabIndex = 0 | 1;

export default function MessagesScreen(): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg       = dark ? '#1C1C19' : '#FFFFFF';
  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.4)' : 'rgba(26,26,23,0.4)';
  const border   = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.12)';

  const [activeTab, setActiveTab] = useState<TabIndex>(0);
  const indicatorAnim = useRef(new Animated.Value(0)).current;

  const switchTab = (index: TabIndex) => {
    setActiveTab(index);
    Animated.spring(indicatorAnim, {
      toValue: index,
      damping: 18,
      stiffness: 140,
      useNativeDriver: false, // translateX on a non-transform layout element
    }).start();
  };

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Text style={[styles.headerTitle, { color: text }]}>MESSAGES</Text>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: border }]}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={styles.tab}
            onPress={() => switchTab(i as TabIndex)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === i ? text : muted },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Animated underline indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: text,
              transform: [
                {
                  translateX: indicatorAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      {/* Tab content */}
      <View style={styles.content}>
        {activeTab === 0 ? (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderTitle, { color: text }]}>INBOX</Text>
            <Text style={[styles.placeholderSub, { color: muted }]}>Coming soon</Text>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={[styles.placeholderTitle, { color: text }]}>REQUESTS</Text>
            <Text style={[styles.placeholderSub, { color: muted }]}>Coming soon</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 8,
  },
  tabBar: {
    flexDirection: 'row',
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '50%',
    height: 2,
    borderRadius: 1,
  },
  content: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 20,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
  },
  placeholderSub: {
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
});
