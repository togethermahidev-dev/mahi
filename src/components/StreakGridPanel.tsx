import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getPostDates } from '@/api';
import { Sentry } from '@/lib/sentry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Grid constants ──────���─────────────────────────────────────────────────────
const CELL_SIZE = 13;
const CELL_GAP  = 2;
const LABEL_W   = 28;  // width reserved for day-of-week labels
const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS: [number, string][] = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];

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

// ─── Helpers ────────��──────────────────────────────────────────────────────────

/** YYYY-MM-DD for a Date using local time. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build the grid: weeks (columns) of 7 day-cells. */
function buildGrid(todayStr: string) {
  const today = new Date(todayStr + 'T00:00:00');
  // Go back 364 days then adjust to nearest Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay()); // back to Sunday

  const weeks: string[][] = [];
  let week: string[] = [];
  const cursor = new Date(start);

  while (cursor <= today) {
    week.push(toDateStr(cursor));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.length > 0) {
    weeks.push(week);
  }

  return { weeks, startDate: start };
}

/** Determine which column index each month label should appear at. */
function buildMonthLabels(weeks: string[][]): { col: number; label: string }[] {
  const labels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let c = 0; c < weeks.length; c++) {
    // Use the first day of each week
    const d = new Date(weeks[c][0] + 'T00:00:00');
    const m = d.getMonth();
    if (m !== lastMonth) {
      labels.push({ col: c, label: MONTHS[m] });
      lastMonth = m;
    }
  }
  return labels;
}

// ─── Component ───────────────────────────────────��─────────────────────────────

export default function StreakGridPanel({
  visible,
  onClose,
  userId,
  streakCurrent,
  streakHighest,
  streakLastUploadDate,
  fitnessRoutine,
  dark,
}: StreakGridPanelProps): React.JSX.Element | null {
  const bg    = dark ? '#1C1C19' : '#FFFFFF';
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const border = dark ? 'rgba(232,232,227,0.08)' : 'rgba(26,26,23,0.06)';

  const cellPosted  = '#59c2d7';
  const cellMissed  = dark ? 'rgba(89,194,215,0.25)' : 'rgba(89,194,215,0.20)';  // blue tint for missed
  const cellRest    = dark ? 'rgba(89,194,215,0.08)' : 'rgba(89,194,215,0.06)';
  const cellToday   = '#59c2d7';

  const slideAnim    = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const scrollRef    = useRef<ScrollView>(null);

  const [mounted, setMounted]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [postDates, setPostDates] = useState<Set<string>>(new Set());

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const trainingDays = useMemo(
    () => (fitnessRoutine ? new Set(fitnessRoutine.split(',')) : null),
    [fitnessRoutine],
  );

  // ─── Animation lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Sentry.addBreadcrumb({ category: 'streak_grid', message: 'Streak grid opened', level: 'info' });
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
      });
    }
  }, [visible]);

  // ─── Data fetch ─────────���────────────────────────────────────────────────────
  const fetchPostDates = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 370); // slightly more than a year to cover grid start
    const sinceStr = toDateStr(since);
    console.log('[StreakGrid] fetching post dates |', userId, '| since:', sinceStr);

    const { data, error } = await getPostDates(userId, sinceStr);
    if (error) {
      console.error('[StreakGrid] fetch failed |', error.message);
      Sentry.captureException(error, {
        tags: { flow: 'streak_grid', action: 'fetch' },
        extra: { userId, sinceStr },
      });
    } else {
      console.log('[StreakGrid] loaded |', data?.length ?? 0, 'post dates');
      setPostDates(new Set(data ?? []));
    }
    setLoading(false);
  };

  // ─── Grid data (memoised — only changes once per day) ────────────────────────
  const { weeks, monthLabels } = useMemo(() => {
    const g = buildGrid(todayStr);
    return { weeks: g.weeks, monthLabels: buildMonthLabels(g.weeks) };
  }, [todayStr]);

  // ─── Precompute day-of-week name for every grid cell (avoids per-render Intl) ─
  const dayNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const week of weeks) {
      for (const dateStr of week) {
        const d = new Date(dateStr + 'T00:00:00');
        map.set(dateStr, d.toLocaleDateString('en-US', { weekday: 'long' }));
      }
    }
    return map;
  }, [weeks]);

  // ─── Streak status ──────────────────────────────────────────────────────────
  const yesterdayStr = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return toDateStr(y);
  }, []);
  const isOnStreak = !!streakLastUploadDate && streakCurrent > 0
    && (streakLastUploadDate === todayStr || streakLastUploadDate === yesterdayStr);

  // ─── Cell colour ────────────────────────────────────────────────────────────
  const getCellColor = (dateStr: string): string => {
    if (postDates.has(dateStr)) return cellPosted;
    if (dateStr === todayStr) return 'transparent'; // today gets a border instead
    if (dateStr > todayStr) return cellRest;

    // Past day with no post — check if it was a training day
    const dayName = dayNameMap.get(dateStr) ?? '';
    const isRestDay = trainingDays ? !trainingDays.has(dayName) : false;
    return isRestDay ? cellRest : cellMissed;
  };

  // ─── Early exit (all hooks must be above this line) ─────────────────────────
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
        <View style={[styles.topBar, { borderBottomColor: border, paddingTop: Platform.OS === 'ios' ? 60 : 32 }]}>
          <Text style={[styles.title, { color: text }]}>STREAK</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.closeBtnText, { color: muted }]}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>

        {/* Status indicator */}
        <Text
          style={[
            styles.statusText,
            { color: isOnStreak ? '#59c2d7' : muted },
          ]}
        >
          {isOnStreak
            ? `On a ${streakCurrent}-day streak`
            : 'Streak tracker'}
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

        {/* Grid */}
        {loading ? (
          <ActivityIndicator color={muted} style={styles.loader} />
        ) : (
          <View style={styles.gridContainer}>
            {/* Month labels */}
            <View style={[styles.monthRow, { marginLeft: LABEL_W }]}>
              {monthLabels.map(({ col, label }) => (
                <Text
                  key={`${label}-${col}`}
                  style={[
                    styles.monthLabel,
                    { color: muted, left: col * (CELL_SIZE + CELL_GAP) },
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.gridRow}>
              {/* Day-of-week labels */}
              <View style={[styles.dayLabels, { width: LABEL_W }]}>
                {DAY_LABELS.map(([row, label]) => (
                  <Text
                    key={label}
                    style={[
                      styles.dayLabel,
                      { color: muted, top: row * (CELL_SIZE + CELL_GAP) },
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {/* Scrollable grid */}
              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={() =>
                  scrollRef.current?.scrollToEnd({ animated: false })
                }
              >
                <View style={styles.weeksRow}>
                  {weeks.map((week, ci) => (
                    <View key={ci} style={styles.weekCol}>
                      {week.map((dateStr) => {
                        const isToday = dateStr === todayStr && !postDates.has(dateStr);
                        return (
                          <View
                            key={dateStr}
                            style={[
                              styles.cell,
                              { backgroundColor: getCellColor(dateStr) },
                              isToday && { borderWidth: 1, borderColor: cellToday },
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────���────────────────────
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
  },
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
    marginBottom: 32,
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
  gridContainer: {
    paddingHorizontal: 24,
  },
  monthRow: {
    height: 18,
    position: 'relative',
    marginBottom: 4,
  },
  monthLabel: {
    position: 'absolute',
    fontFamily: 'JosefinSans_400Regular',
    fontSize: 10,
    top: 0,
  },
  gridRow: {
    flexDirection: 'row',
  },
  dayLabels: {
    position: 'relative',
    height: 7 * (CELL_SIZE + CELL_GAP) - CELL_GAP,
  },
  dayLabel: {
    position: 'absolute',
    fontFamily: 'JosefinSans_400Regular',
    fontSize: 9,
    lineHeight: CELL_SIZE,
    left: 0,
  },
  weeksRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  weekCol: {
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 2,
  },
});
