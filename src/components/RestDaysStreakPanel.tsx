import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import StreakCalendar from '@/components/StreakCalendar';
import { useAuthStore, useUserStore } from '@/store';
import { updateFitnessRoutine } from '@/api';
import { Sentry } from '@/lib/sentry';
import { WEEKDAY_NAMES } from '@/lib/streakGrid';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SIZE, OFFSET, TRACKING, LINE_HEIGHT, BORDER_WIDTH } from '@/constants/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface RestDaysStreakPanelProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  streakCurrent: number;
  streakHighest: number;
  streakLastUploadDate: string | null;
  fitnessRoutine: string | null;
  dark: boolean;
}

/** Own rest-day editor + streak calendar, in a native page sheet (swipe down to close). */
export default function RestDaysStreakPanel({
  visible,
  onClose,
  dark,
  ...grid
}: RestDaysStreakPanelProps): React.JSX.Element {
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

function Sheet({ onClose, dark, ...grid }: Omit<RestDaysStreakPanelProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.08) : withAlpha(COLORS.offBlack, 0.06);

  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const authUserId = useAuthStore((s) => s.user?.id);

  // Seeded from the current routine each time the sheet opens (it mounts on open).
  const [selectedDays, setSelectedDays] = useState<string[]>(() => {
    const routine = profile?.fitness_routine;
    return routine ? routine.split(',').filter(Boolean) : [];
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Sentry.addBreadcrumb({
      category: 'rest_days_streak',
      message: 'Rest days & streak panel opened',
      level: 'info',
    });
  }, []);

  const toggleDay = (full: string) => {
    setSelectedDays((prev) =>
      prev.includes(full) ? prev.filter((d) => d !== full) : [...prev, full]
    );
  };

  const handleSave = async () => {
    if (!authUserId || !profile) return;
    setSaving(true);
    const routine = selectedDays.length > 0 ? selectedDays.join(',') : null;
    const { error } = await updateFitnessRoutine(authUserId, routine);
    if (error) {
      console.error('[RestDaysStreak] save failed', error);
      Sentry.captureException(error, {
        tags: { flow: 'rest_days_streak', action: 'save' },
        extra: { routine, userId: authUserId },
      });
      Alert.alert('Save failed', 'Could not update your training days. Please try again.');
      setSaving(false);
      return;
    }
    Sentry.addBreadcrumb({
      category: 'rest_days_streak',
      message: `Training days updated: ${routine ?? 'cleared'}`,
      level: 'info',
    });
    setProfile({ ...profile, fitness_routine: routine });
    setSaving(false);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { borderBottomColor: border, paddingTop: insets.top + SPACE.s20 }]}>
        <Text style={[styles.title, { color: text }]} accessibilityRole="header">
          REST DAYS & STREAK
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close rest days and streak"
          style={({ pressed }) => [styles.closeBtn, { borderColor: muted }, pressed && styles.pressed]}
          hitSlop={OFFSET.o8}
        >
          <Text style={[styles.closeBtnText, { color: muted }]}>{'✕'}</Text>
        </Pressable>
      </View>

      {/* Rest-day toggles on top, streak calendar below; the whole sheet scrolls. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.s48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.restSection}>
          <View style={styles.restHeaderRow}>
            <Text style={[styles.sectionTitle, { color: text }]} accessibilityRole="header">
              REST DAYS
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save training days"
              accessibilityState={{ disabled: saving, busy: saving }}
              hitSlop={OFFSET.o8}
              style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={text} />
              ) : (
                <Text style={[styles.saveText, { color: text }]}>Save</Text>
              )}
            </Pressable>
          </View>

          <Text style={[styles.subtitle, { color: muted }]}>
            Select the days you train.{'\n'}Days not selected are rest days.
          </Text>

          <View style={styles.daysRow}>
            {WEEKDAY_NAMES.map((full) => {
              const selected = selectedDays.includes(full);
              return (
                <Pressable
                  key={full}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Train on ${full}`}
                  accessibilityState={{ checked: selected }}
                  style={({ pressed }) => [
                    styles.dayPill,
                    selected
                      ? { backgroundColor: text }
                      : { borderWidth: BORDER_WIDTH.w1_5, borderColor: text },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => toggleDay(full)}
                >
                  <Text style={[styles.dayText, { color: selected ? bg : text }]}>
                    {full.slice(0, 3)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.sectionDivider, { backgroundColor: border }]} />

        <Text
          style={[styles.sectionTitle, styles.streakSectionTitle, { color: text }]}
          accessibilityRole="header"
        >
          STREAK
        </Text>

        <StreakCalendar {...grid} dark={dark} flow="rest_days_streak" />
      </ScrollView>
    </View>
  );
}

// Seven pills across the sheet: 24 padding each side, 8 between.
const PILL_SIZE = (SCREEN_WIDTH - 2 * SPACE.s24 - 6 * SPACE.s8) / 7;

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
    fontSize: FONT_SIZE.f13,
    letterSpacing: TRACKING.t5,
  },
  closeBtn: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    borderWidth: BORDER_WIDTH.w1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: FONT_SIZE.f14,
  },
  pressed: {
    opacity: 0.7,
  },
  scroll: {
    flex: 1,
  },
  restSection: {
    paddingHorizontal: SPACE.s24,
    paddingTop: SPACE.s28,
    alignItems: 'center',
  },
  restHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: SPACE.s20,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.f13,
    letterSpacing: TRACKING.t5,
  },
  saveBtn: {
    minWidth: SIZE.z70,
    alignItems: 'flex-end',
  },
  saveText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f15,
  },
  subtitle: {
    fontFamily: FONTS.italic,
    fontSize: FONT_SIZE.f14,
    textAlign: 'center',
    marginBottom: SPACE.s24,
    lineHeight: LINE_HEIGHT.l22,
  },
  daysRow: {
    flexDirection: 'row',
    gap: SPACE.s8,
    justifyContent: 'center',
  },
  dayPill: {
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: PILL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f11,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: SPACE.s24,
    marginVertical: SPACE.s28,
  },
  streakSectionTitle: {
    textAlign: 'center',
  },
});
