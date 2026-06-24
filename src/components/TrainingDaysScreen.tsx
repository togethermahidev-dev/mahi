import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore, useUserStore } from '@/store';
import { updateFitnessRoutine } from '@/api';
import { Sentry } from '@/lib/sentry';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DAYS = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' },
];

interface TrainingDaysScreenProps {
  visible: boolean;
  onClose: () => void;
  dark: boolean;
}

export default function TrainingDaysScreen({
  visible,
  onClose,
  dark,
}: TrainingDaysScreenProps): React.JSX.Element | null {
  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const muted = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';

  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const userId = useAuthStore((s) => s.user?.id);

  const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [mounted, setMounted] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Sync local state when overlay opens
  useEffect(() => {
    if (visible) {
      Sentry.addBreadcrumb({
        category: 'training_days',
        message: 'Training days screen opened',
        level: 'info',
      });
      const routine = profile?.fitness_routine;
      setSelectedDays(routine ? routine.split(',').filter(Boolean) : []);
      setMounted(true);
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

  const toggleDay = (full: string) => {
    setSelectedDays((prev) =>
      prev.includes(full) ? prev.filter((d) => d !== full) : [...prev, full]
    );
  };

  const handleSave = async () => {
    if (!userId || !profile) return;
    setSaving(true);
    const routine = selectedDays.length > 0 ? selectedDays.join(',') : null;
    const { error } = await updateFitnessRoutine(userId, routine);
    if (error) {
      console.error('[TrainingDaysScreen] save failed', error);
      Sentry.captureException(error, {
        tags: { flow: 'training_days', action: 'save' },
        extra: { routine, userId },
      });
      Alert.alert('Save failed', 'Could not update your training days. Please try again.');
      setSaving(false);
      return;
    }
    Sentry.addBreadcrumb({
      category: 'training_days',
      message: `Training days updated: ${routine ?? 'cleared'}`,
      level: 'info',
    });
    setProfile({ ...profile, fitness_routine: routine });
    onClose();
  };

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
        {/* Top bar */}
        <View style={[styles.topBar, { borderBottomColor: muted }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.backBtn, { borderColor: muted }]}
          >
            <Text style={[styles.backText, { color: text }]}>‹</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: text }]}>TRAINING DAYS</Text>

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

        {/* Content */}
        <View style={styles.content}>
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
      </Animated.View>
    </View>
  );
}

const PILL_SIZE = (SCREEN_WIDTH - 48 - 6 * 8) / 7; // 24px padding each side, 8px gap

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 20,
    lineHeight: 22,
  },
  title: {
    fontFamily: 'JosefinSans_700Bold',
    fontSize: 13,
    letterSpacing: 5,
    textAlign: 'center',
  },
  saveBtn: {
    width: 70,
    alignItems: 'flex-end',
  },
  saveText: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: 'JosefinSans_400Regular_Italic',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
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
});
