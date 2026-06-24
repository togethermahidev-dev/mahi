import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore, useUserStore } from '@/store';
import { getPostDates, updateFitnessRoutine } from '@/api';
import { Sentry } from '@/lib/sentry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Rest-day editor constants ────────────────────────────────────────────────
const DAYS = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' },
];

// ─── Streak grid constants ────────────────────────────────────────────────────
const CELL_SIZE = 28;
const CELL_GAP = 4;
const MONTH_LABEL_W = 44;
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAYS_BLOCK_W = 7 * CELL_SIZE + 6 * CELL_GAP;

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

type MonthBlock = {
  label: string;
  year: number;
  leadingBlanks: number; // 0-6, Monday-first offset of the 1st of the month
  days: string[]; // YYYY-MM-DD for each day of the month (up to today for the current month)
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** YYYY-MM-DD for a Date using local time. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build 12 month blocks from 11 months ago through the current month. */
function buildMonthGrid(todayStr: string): MonthBlock[] {
  const today = new Date(todayStr + 'T00:00:00');
  const months: MonthBlock[] = [];

  for (let offset = 11; offset >= 0; offset--) {
    const first = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    // Mon-first weekday offset: Sun=0 → 6, Mon=1 → 0, Tue=2 → 1, ...
    const leadingBlanks = (first.getDay() + 6) % 7;

    // How many days to include — full month unless we're on the current month
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lastDay = offset === 0 ? today.getDate() : daysInMonth;

    const days: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      days.push(toDateStr(new Date(first.getFullYear(), first.getMonth(), d)));
    }

    months.push({
      label: MONTH_NAMES[first.getMonth()],
      year: first.getFullYear(),
      leadingBlanks,
      days,
    });
  }

  return months;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RestDaysStreakPanel({
  visible,
  onClose,
  userId,
  streakCurrent,
  streakHighest,
  streakLastUploadDate,
  fitnessRoutine,
  dark,
}: RestDaysStreakPanelProps): React.JSX.Element | null {
  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.06)';

  const cellPosted = '#59c2d7';
  const cellMissed = dark ? 'rgba(89,194,215,0.55)' : 'rgba(89,194,215,0.50)';
  const cellRest = dark ? 'rgba(89,194,215,0.22)' : 'rgba(89,194,215,0.18)';
  const cellToday = '#59c2d7';

  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const authUserId = useAuthStore((s) => s.user?.id);

  // Panel slide-in (legacy RN Animated — same spring as the source panels)
  const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(false);

  // ─── Rest-day editor state ───────────────────────────────────────────────
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ─── Streak grid state ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [postDates, setPostDates] = useState<Set<string>>(new Set());

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const trainingDays = useMemo(
    () => (fitnessRoutine ? new Set(fitnessRoutine.split(',')) : null),
    [fitnessRoutine]
  );

  // ─── Animation lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Sentry.addBreadcrumb({
        category: 'rest_days_streak',
        message: 'Rest days & streak panel opened',
        level: 'info',
      });
      // Seed rest-day editor from the current routine
      const routine = profile?.fitness_routine;
      setSelectedDays(routine ? routine.split(',').filter(Boolean) : []);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 160,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      fetchPostDates();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMounted(false);
        setSaving(false);
      });
    }
  }, [visible]);

  // ─── Data fetch (streak grid) ────────────────────────────────────────────
  const fetchPostDates = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 370); // slightly more than a year to cover grid start
    const sinceStr = toDateStr(since);
    console.log('[RestDaysStreak] fetching post dates |', userId, '| since:', sinceStr);

    const { data, error } = await getPostDates(userId, sinceStr);
    if (error) {
      console.error('[RestDaysStreak] fetch failed |', error.message);
      Sentry.captureException(error, {
        tags: { flow: 'rest_days_streak', action: 'fetch' },
        extra: { userId, sinceStr },
      });
    } else {
      console.log('[RestDaysStreak] loaded |', data?.length ?? 0, 'post dates');
      setPostDates(new Set(data ?? []));
    }
    setLoading(false);
  };

  // ─── Rest-day editor handlers ────────────────────────────────────────────
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

  // ─── Grid data (memoised — only changes once per day) ────────────────────
  const months = useMemo(() => buildMonthGrid(todayStr), [todayStr]);

  // ─── Streak status ───────────────────────────────────────────────────────
  const yesterdayStr = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return toDateStr(y);
  }, []);
  const isOnStreak =
    !!streakLastUploadDate &&
    streakCurrent > 0 &&
    (streakLastUploadDate === todayStr || streakLastUploadDate === yesterdayStr);

  // ─── Cell colour ─────────────────────────────────────────────────────────
  // weekdayIndex is 0=Mon ... 6=Sun, derived from the cell's column in the grid.
  const getCellColor = (dateStr: string, weekdayIndex: number): string => {
    if (postDates.has(dateStr)) return cellPosted;
    if (dateStr === todayStr) return cellToday; // today filled with brand cyan
    if (dateStr > todayStr) return cellRest;

    // Past day with no post — check if it was a training day
    const isRestDay = trainingDays ? !trainingDays.has(WEEKDAY_NAMES[weekdayIndex]) : false;
    return isRestDay ? cellRest : cellMissed;
  };

  // ─── Early exit (all hooks must be above this line) ─────────────────────
  if (!mounted && !visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Full-screen panel */}
      <Animated.View
        style={[styles.panel, { backgroundColor: bg, transform: [{ translateX: slideAnim }] }]}
      >
        {/* Header */}
        <View
          style={[
            styles.topBar,
            { borderBottomColor: border, paddingTop: Platform.OS === 'ios' ? 60 : 32 },
          ]}
        >
          <Text style={[styles.title, { color: text }]}>REST DAYS & STREAK</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: muted }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.closeBtnText, { color: muted }]}>{'✕'}</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable content: rest-day toggles on top, streak grid below */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Section 1: Rest-day editor ──────────────────────────────── */}
          <View style={styles.restSection}>
            <View style={styles.restHeaderRow}>
              <Text style={[styles.sectionTitle, { color: text }]}>REST DAYS</Text>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.saveBtn}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={text} />
                ) : (
                  <Text style={[styles.saveText, { color: text }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.subtitle, { color: muted }]}>
              Select the days you train.{'\n'}Days not selected are rest days.
            </Text>

            <View style={styles.daysRow}>
              {DAYS.map(({ label, full }) => {
                const selected = selectedDays.includes(full);
                return (
                  <TouchableOpacity
                    key={full}
                    style={[
                      styles.dayPill,
                      selected
                        ? { backgroundColor: text }
                        : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: text },
                    ]}
                    onPress={() => toggleDay(full)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayText, { color: selected ? bg : text }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Divider ─────────────────────────────────────────────────── */}
          <View style={[styles.sectionDivider, { backgroundColor: border }]} />

          {/* ── Section 2: Streak grid ──────────────────────────────────── */}
          <Text style={[styles.sectionTitle, styles.streakSectionTitle, { color: text }]}>
            STREAK
          </Text>

          {/* Status indicator */}
          <Text style={[styles.statusText, { color: isOnStreak ? '#59c2d7' : muted }]}>
            {isOnStreak ? `On a ${streakCurrent}-day streak` : 'Streak tracker'}
          </Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: text }]}>{streakCurrent}</Text>
              <Text style={[styles.statLabel, { color: muted }]}>STREAK</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: muted }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: text }]}>{streakHighest}</Text>
              <Text style={[styles.statLabel, { color: muted }]}>BEST</Text>
            </View>
          </View>

          {/* Legend / key */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cellPosted }]} />
              <Text style={[styles.legendText, { color: muted }]}>Active</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cellMissed }]} />
              <Text style={[styles.legendText, { color: muted }]}>Missed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: cellRest }]} />
              <Text style={[styles.legendText, { color: muted }]}>Rest day</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: 'transparent', borderWidth: 1, borderColor: cellToday },
                ]}
              />
              <Text style={[styles.legendText, { color: muted }]}>Today</Text>
            </View>
          </View>

          {/* Bordered grid frame — rendered at full height; the outer ScrollView
              scrolls the whole month canvas (no inner pan, avoids gesture clash) */}
          {loading ? (
            <ActivityIndicator color={muted} style={styles.loader} />
          ) : (
            <View style={[styles.gridFrame, { borderColor: border }]}>
              {/* Fixed weekday header */}
              <View style={styles.weekdayHeader}>
                {WEEKDAY_LABELS.map((label, i) => (
                  <View
                    key={i}
                    style={[
                      styles.weekdayCell,
                      i < WEEKDAY_LABELS.length - 1 && { marginRight: CELL_GAP },
                    ]}
                  >
                    <Text style={[styles.weekdayText, { color: muted }]}>{label}</Text>
                  </View>
                ))}
              </View>

              {/* Full month canvas — no clipping viewport / pan gesture */}
              <View>
                {months.map((month) => (
                  <View key={`${month.label}-${month.year}`} style={styles.monthRow}>
                    <Text style={[styles.monthLabel, { color: muted }]}>{month.label}</Text>
                    <View style={styles.daysBlock}>
                      {Array.from({ length: month.leadingBlanks }).map((_, i) => (
                        <View key={`blank-${i}`} style={styles.blankCell} />
                      ))}
                      {month.days.map((dateStr, dayIdx) => {
                        const weekdayIndex = (month.leadingBlanks + dayIdx) % 7;
                        const isToday = dateStr === todayStr && !postDates.has(dateStr);
                        return (
                          <View
                            key={dateStr}
                            style={[
                              styles.cell,
                              { backgroundColor: getCellColor(dateStr, weekdayIndex) },
                              isToday && { borderWidth: 1, borderColor: cellToday },
                            ]}
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const PILL_SIZE = (SCREEN_WIDTH - 48 - 6 * 8) / 7; // 24px padding each side, 8px gap

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 600,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 13,
    letterSpacing: 5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  // ─── Rest-day editor section ──
  restSection: {
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: 'center',
  },
  restHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 13,
    letterSpacing: 5,
  },
  saveBtn: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  saveText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 15,
  },
  subtitle: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
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
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 11,
  },
  // ─── Divider between sections ──
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 24,
    marginVertical: 28,
  },
  streakSectionTitle: {
    textAlign: 'center',
  },
  // ─── Streak grid section ──
  statusText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 13,
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 28,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  statDivider: {
    width: 1,
    height: 40,
    opacity: 0.3,
  },
  loader: {
    marginTop: 60,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  gridFrame: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  weekdayHeader: {
    flexDirection: 'row',
    marginLeft: MONTH_LABEL_W,
    marginBottom: 8,
  },
  weekdayCell: {
    width: CELL_SIZE,
    alignItems: 'center',
  },
  weekdayText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: CELL_GAP * 2,
  },
  monthLabel: {
    width: MONTH_LABEL_W,
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 12,
    lineHeight: CELL_SIZE,
  },
  daysBlock: {
    width: DAYS_BLOCK_W,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  blankCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
  },
});
