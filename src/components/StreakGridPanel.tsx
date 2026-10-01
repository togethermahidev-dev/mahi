import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import StreakCalendar from '@/components/StreakCalendar';
import { Sentry } from '@/lib/sentry';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SIZE, OFFSET, BORDER_WIDTH } from '@/constants/tokens';

interface StreakGridPanelProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  streakCurrent: number;
  streakHighest: number;
  streakLastUploadDate: string | null;
  fitnessRoutine: string | null;
  dark: boolean;
}

/** Another user's streak calendar, in a native page sheet (swipe down to close). */
export default function StreakGridPanel({ visible, onClose, dark, ...grid }: StreakGridPanelProps) {
  const bg = dark ? COLORS.bgDark : COLORS.white;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Its own provider: the sheet's insets differ from the screen behind it. */}
      <SafeAreaProvider style={{ backgroundColor: bg }}>
        <Sheet onClose={onClose} dark={dark} {...grid} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ onClose, dark, ...grid }: Omit<StreakGridPanelProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.08) : withAlpha(COLORS.offBlack, 0.06);

  useEffect(() => {
    Sentry.addBreadcrumb({ category: 'streak_grid', message: 'Streak grid opened', level: 'info' });
  }, []);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={[styles.topBar, { borderBottomColor: border, paddingTop: insets.top + SPACE.s20 }]}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          Streak
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close streak"
          style={({ pressed }) => [styles.closeBtn, { borderColor: muted }, pressed && styles.pressed]}
          hitSlop={OFFSET.o8}
        >
          <Text style={[styles.closeBtnText, { color: muted }]}>{'✕'}</Text>
        </Pressable>
      </View>

      <StreakCalendar {...grid} dark={dark} flow="streak_grid" fill />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.s24,
    paddingBottom: SPACE.s16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f16,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  closeBtnText: {
    fontSize: FONT_SIZE.f14,
  },
});
