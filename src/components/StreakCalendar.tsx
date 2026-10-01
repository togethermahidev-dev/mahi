import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getPostDates } from '@/api';
import { Sentry } from '@/lib/sentry';
import { buildMonthGrid, cellKind, isOnStreak, toDateStr, type CellKind } from '@/lib/streakGrid';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS, SIZE, TRACKING, LINE_HEIGHT, BORDER_WIDTH } from '@/constants/tokens';

const CELL_SIZE = SIZE.z28;
const CELL_GAP = SPACE.s4;
const MONTH_LABEL_W = SIZE.z44;
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAYS_BLOCK_W = 7 * CELL_SIZE + 6 * CELL_GAP;

interface StreakCalendarProps {
  userId: string;
  streakCurrent: number;
  streakHighest: number;
  streakLastUploadDate: string | null;
  fitnessRoutine: string | null;
  dark: boolean;
  /** Sentry flow tag and log prefix, e.g. 'streak_grid'. */
  flow: string;
  /** Fill the remaining height and scroll the months inside the frame, starting at today. */
  fill?: boolean;
}

/**
 * Streak status, stats, legend and the 12-month calendar. Fetches the user's post dates fresh
 * each time it mounts (it lives inside a sheet, so that is each open) and shows a spinner until
 * they arrive.
 */
export default function StreakCalendar({
  userId,
  streakCurrent,
  streakHighest,
  streakLastUploadDate,
  fitnessRoutine,
  dark,
  flow,
  fill = false,
}: StreakCalendarProps): React.JSX.Element {
  const muted = dark ? withAlpha(COLORS.offWhite, 0.45) : withAlpha(COLORS.offBlack, 0.45);
  const border = dark ? withAlpha(COLORS.offWhite, 0.08) : withAlpha(COLORS.offBlack, 0.06);
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const cellColor: Record<CellKind, string> = {
    posted: COLORS.accent,
    today: COLORS.accent,
    missed: dark ? withAlpha(COLORS.accent, 0.55) : withAlpha(COLORS.accent, 0.5),
    rest: dark ? withAlpha(COLORS.accent, 0.22) : withAlpha(COLORS.accent, 0.18),
  };

  const [loading, setLoading] = useState(true);
  const [postDates, setPostDates] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const months = useMemo(() => buildMonthGrid(todayStr), [todayStr]);
  const trainingDays = useMemo(
    () => (fitnessRoutine ? new Set(fitnessRoutine.split(',')) : null),
    [fitnessRoutine]
  );
  const onStreak = isOnStreak(streakCurrent, streakLastUploadDate, todayStr);

  useEffect(() => {
    let live = true;
    const since = new Date();
    since.setDate(since.getDate() - 370); // a little over a year, to cover the grid's first month
    const sinceStr = toDateStr(since);
    getPostDates(userId, sinceStr).then(({ data, error }) => {
      if (!live) return;
      if (error) {
        console.error(`[${flow}] fetch failed |`, error.message);
        Sentry.captureException(error, {
          tags: { flow, action: 'fetch' },
          extra: { userId, sinceStr },
        });
      } else {
        setPostDates(new Set(data ?? []));
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [userId, flow]);

  const monthRows = months.map((month) => (
    <View key={`${month.label}-${month.year}`} style={styles.monthRow}>
      <Text style={[styles.monthLabel, { color: muted }]}>{month.label}</Text>
      <View style={styles.daysBlock}>
        {Array.from({ length: month.leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {month.days.map((dateStr, dayIdx) => {
          const kind = cellKind(dateStr, (month.leadingBlanks + dayIdx) % 7, {
            todayStr,
            postDates,
            trainingDays,
          });
          return (
            <View
              key={dateStr}
              style={[
                styles.cell,
                { backgroundColor: cellColor[kind] },
                kind === 'today' && { borderWidth: BORDER_WIDTH.w1, borderColor: cellColor.today },
              ]}
            />
          );
        })}
      </View>
    </View>
  ));

  const legend: { label: string; style: object }[] = [
    { label: 'Active', style: { backgroundColor: cellColor.posted } },
    { label: 'Missed', style: { backgroundColor: cellColor.missed } },
    { label: 'Rest day', style: { backgroundColor: cellColor.rest } },
    { label: 'Today', style: { borderWidth: BORDER_WIDTH.w1, borderColor: cellColor.today } },
  ];

  return (
    <>
      <Text style={[styles.statusText, { color: onStreak ? COLORS.accent : muted }]}>
        {onStreak ? `On a ${streakCurrent}-day streak` : 'Streak tracker'}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: text }]}>{streakCurrent}</Text>
          <Text style={[styles.statLabel, { color: muted }]}>Streak</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: muted }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: text }]}>{streakHighest}</Text>
          <Text style={[styles.statLabel, { color: muted }]}>Best</Text>
        </View>
      </View>

      <View style={styles.legendRow}>
        {legend.map(({ label, style }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, style]} />
            <Text style={[styles.legendText, { color: muted }]}>{label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={muted} style={styles.loader} />
      ) : (
        <View style={[styles.gridFrame, fill && styles.fill, { borderColor: border }]}>
          <View style={styles.weekdayHeader}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={[styles.weekdayText, { color: muted }]}>
                {label}
              </Text>
            ))}
          </View>

          {fill ? (
            // Starts at the bottom, so this month (today) is in view.
            <ScrollView
              ref={scrollRef}
              style={styles.fill}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              {monthRows}
            </ScrollView>
          ) : (
            <View>{monthRows}</View>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  statusText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f13,
    textAlign: 'center',
    paddingVertical: SPACE.s20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.s32,
    marginBottom: SPACE.s24,
  },
  stat: {
    alignItems: 'center',
    gap: SPACE.s4,
  },
  statValue: {
    fontSize: FONT_SIZE.f28,
    fontFamily: FONTS.bold,
    lineHeight: LINE_HEIGHT.l28,
  },
  statLabel: {
    fontSize: FONT_SIZE.f13,
    fontFamily: FONTS.semiBold,
  },
  statDivider: {
    width: SIZE.z1,
    height: SIZE.z40,
    opacity: 0.3,
  },
  loader: {
    marginTop: SPACE.s60,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.s20,
    marginBottom: SPACE.s16,
    paddingHorizontal: SPACE.s16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.s6,
  },
  legendDot: {
    width: SIZE.z10,
    height: SIZE.z10,
    borderRadius: RADIUS.r2,
  },
  legendText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f10,
    letterSpacing: TRACKING.t1,
  },
  gridFrame: {
    marginHorizontal: SPACE.s16,
    marginBottom: SPACE.s24,
    borderWidth: BORDER_WIDTH.w1,
    borderRadius: RADIUS.r16,
    padding: SPACE.s12,
  },
  weekdayHeader: {
    flexDirection: 'row',
    gap: CELL_GAP,
    marginLeft: MONTH_LABEL_W,
    marginBottom: SPACE.s8,
  },
  weekdayText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f10,
    letterSpacing: TRACKING.t1,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: CELL_GAP * 2,
  },
  monthLabel: {
    width: MONTH_LABEL_W,
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f12,
    lineHeight: CELL_SIZE,
  },
  daysBlock: {
    width: DAYS_BLOCK_W,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: RADIUS.r4,
  },
});
