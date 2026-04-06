import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { getProfile, createOrGetConversation } from '@/api';
import { useAuthStore } from '@/store';
import { Sentry } from '@/lib/sentry';
import { StreakIcon } from '@/components/ScreenIcons';
import StreakGridPanel from '@/components/StreakGridPanel';
import type { ConversationPreview } from '@/api';
import type { Database } from '@/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface UserProfileOverlayProps {
  userId:      string;
  onClose:     () => void;
  onOpenConvo: (conversation: ConversationPreview) => void;
  dark:        boolean;
}

export default function UserProfileOverlay({
  userId,
  onClose,
  onOpenConvo,
  dark,
}: UserProfileOverlayProps): React.JSX.Element {
  const currentUserId = useAuthStore((s) => s.user?.id);

  const text     = dark ? '#E8E8E3' : '#1A1A17';
  const muted    = dark ? 'rgba(232,232,227,0.45)' : 'rgba(26,26,23,0.45)';
  const cardBg   = dark ? '#2A2A27' : '#F5F5F2';
  const avatarBg = dark ? '#3A3A37' : '#E8E8E3';

  const [profile,   setProfile]   = useState<ProfileRow | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [messaging, setMessaging] = useState(false);
  const [streakGridOpen, setStreakGridOpen] = useState(false);

  useEffect(() => {
    console.log('[UserProfile] open |', userId);
    Sentry.addBreadcrumb({ category: 'profile', message: `Profile overlay opened: ${userId}`, level: 'info' });
    getProfile(userId)
      .then(({ data, error }) => {
        if (error) {
          console.log('[UserProfile] fetch error |', userId, error.message);
          Sentry.captureMessage(error.message, { level: 'warning', tags: { flow: 'profile', step: 'fetch' }, extra: { userId } });
        } else {
          console.log('[UserProfile] loaded |', data?.username ?? userId);
        }
        setProfile(data ?? null);
        setLoading(false);
      })
      .catch((e) => {
        console.log('[UserProfile] fetch exception |', userId, e);
        Sentry.captureException(e, { tags: { flow: 'profile', step: 'fetch' }, extra: { userId } });
        setProfile(null);
        setLoading(false);
      });
  }, [userId]);

  const displayName = profile?.display_name ?? profile?.first_name ?? profile?.username ?? '—';
  const initials    = displayName[0]?.toUpperCase() ?? '?';

  const handleMessage = async () => {
    if (!currentUserId || !profile || messaging) return;
    console.log('[UserProfile] MESSAGE tap |', userId, '| user:', profile.username);
    Sentry.addBreadcrumb({ category: 'profile', message: `Message tapped: ${profile.username}`, level: 'info' });
    setMessaging(true);
    try {
      const { data, error } = await createOrGetConversation(currentUserId, userId);
      setMessaging(false);
      if (error) {
        console.log('[UserProfile] createOrGetConversation error |', error.message);
        Sentry.captureMessage(error.message, { level: 'warning', tags: { flow: 'profile', step: 'message' }, extra: { userId } });
        return;
      }
      if (data) {
        console.log('[UserProfile] conversation opened |', data.id);
        onOpenConvo(data);
        onClose();
      }
    } catch (e) {
      console.log('[UserProfile] createOrGetConversation exception |', e);
      Sentry.captureException(e, { tags: { flow: 'profile', step: 'message' }, extra: { userId } });
      setMessaging(false);
    }
  };

  const isSelf = currentUserId === userId;

  return (
    <View style={styles.backdrop}>
      {/* Tapping the backdrop closes */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* Card */}
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        {/* Back / close button */}
        <TouchableOpacity
          onPress={onClose}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backArrow, { color: muted }]}>‹</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color={muted} style={styles.loader} />
        ) : (
          <>
            <View style={styles.avatarWrap}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg }]}>
                  <Text style={[styles.avatarInitial, { color: cardBg }]}>{initials}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.displayName, { color: text }]}>{displayName}</Text>
            {profile?.username ? (
              <Text style={[styles.handle, { color: muted }]}>@{profile.username}</Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: text }]}>{profile?.streak_current ?? 0}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>STREAK</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: muted }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: text }]}>{profile?.streak_highest ?? 0}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>BEST</Text>
              </View>
            </View>

            {/* Streak grid pill */}
            <TouchableOpacity
              onPress={() => setStreakGridOpen(true)}
              activeOpacity={0.75}
              style={styles.streakPill}
            >
              <StreakIcon size={16} color="#59c2d7" />
            </TouchableOpacity>

            {!isSelf ? (
              <TouchableOpacity
                style={[styles.messageBtn, { borderColor: text, opacity: messaging ? 0.5 : 1 }]}
                onPress={handleMessage}
                activeOpacity={0.75}
                disabled={messaging}
              >
                <Text style={[styles.messageBtnText, { color: text }]}>
                  {messaging ? '…' : 'MESSAGE'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      {/* Streak accountability grid — slides in from left */}
      {profile ? (
        <StreakGridPanel
          visible={streakGridOpen}
          onClose={() => setStreakGridOpen(false)}
          userId={userId}
          streakCurrent={profile.streak_current ?? 0}
          streakHighest={profile.streak_highest ?? 0}
          streakLastUploadDate={profile.streak_last_upload_date ?? null}
          fitnessRoutine={profile.fitness_routine ?? null}
          dark={dark}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex:          510,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  card: {
    width:             '80%',
    borderRadius:      20,
    paddingTop:        16,
    paddingBottom:     28,
    paddingHorizontal: 24,
    alignItems:        'center',
    gap:               6,
  },
  backBtn: {
    position:  'absolute',
    top:       12,
    left:      16,
    zIndex:    1,
    padding:   4,
  },
  backArrow: {
    fontSize:   28,
    fontFamily: 'JosefinSans_400Regular_Italic',
    lineHeight: 30,
  },
  loader: {
    marginVertical: 40,
  },
  avatarWrap: {
    marginBottom: 12,
  },
  avatar: {
    width:        80,
    height:       80,
    borderRadius: 40,
  },
  avatarFallback: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize:   28,
    fontFamily: 'JosefinSans_700Bold',
  },
  displayName: {
    fontSize:      18,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
    textAlign:     'center',
    marginBottom:  2,
  },
  handle: {
    fontSize:      13,
    fontFamily:    'JosefinSans_400Regular_Italic',
    marginBottom:  16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           24,
    marginBottom:  20,
  },
  stat: {
    alignItems: 'center',
    gap:        3,
  },
  statValue: {
    fontSize:   22,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 22,
  },
  statLabel: {
    fontSize:      9,
    fontFamily:    'JosefinSans_600SemiBold',
    letterSpacing: 3,
  },
  statDivider: {
    width:   1,
    height:  32,
    opacity: 0.3,
  },
  streakPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  messageBtn: {
    borderWidth:       1,
    borderRadius:      50,
    paddingHorizontal: 28,
    paddingVertical:   9,
    marginTop:         4,
  },
  messageBtnText: {
    fontSize:      11,
    fontFamily:    'JosefinSans_700Bold',
    letterSpacing: 3,
  },
});
