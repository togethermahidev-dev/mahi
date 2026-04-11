import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Animated,
  Alert,
  Dimensions,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, useDerivedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Svg, { Path } from 'react-native-svg';
import { decode } from 'base64-arraybuffer';
import { useAuthStore, useUserStore, useFeedStore, useProfilePostsStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { supabase } from '@/lib/supabase';
import { createPost, recordUpload, searchProfiles, type TaggedUser, type FeedPost, type ProfileSearchResult } from '@/api';
import TaggedBubbleStack from '@/components/TaggedBubbleStack';
import { Sentry } from '@/lib/sentry';

// Must match PEEK_HEIGHT in VerticalNavigator.tsx
const PEEK_HEIGHT = 110;

// ─── Midnight Countdown ───────────────────────────────────────────────────────

function getMsUntilMidnight(): number {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function MidnightCountdown({ onUnlock }: { onUnlock: () => void }) {
  const [remaining, setRemaining] = useState(getMsUntilMidnight);

  useEffect(() => {
    const id = setInterval(() => {
      const ms = getMsUntilMidnight();
      setRemaining(ms);
      if (ms <= 0) {
        clearInterval(id);
        onUnlock();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <BlurView intensity={60} tint="dark" style={styles.postedOverlay}>
      <Text style={styles.postedTitle}>STREAK SECURED</Text>
      <Text style={styles.countdownTimer}>{formatCountdown(remaining)}</Text>
      <Text style={styles.postedSub}>until your next post unlocks</Text>
    </BlurView>
  );
}

// ─── Streak Badge ─────────────────────────────────────────────────────────────

function StreakBadge({ count }: { count: number }) {
  const scaleAnim   = useRef(new Animated.Value(4)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 16,
        stiffness: 110,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.streakBadge,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      <Text style={styles.streakNumber}>{count}</Text>
      <Text style={styles.streakLabel}>DAY{'\n'}STREAK</Text>
    </Animated.View>
  );
}

// ─── Flip Icon ────────────────────────────────────────────────────────────────

function FlipIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1 4v6h6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M23 20v-6h-6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CapturedPhoto {
  uri: string;
  base64: string;
}

// ─── Dual Photo Preview ───────────────────────────────────────────────────────
// Full-screen primary + small draggable pip.
// Rear (POV) is primary by default; front selfie is the pip.
// Tap pip → swap. Hold + drag pip → reposition.

const PIP_W = 130;
const PIP_H = 170;
const PIP_MARGIN = 16;

function tagPillLabel(tagged: TaggedUser[]): string {
  if (tagged.length === 0) return '＋ Tag people';
  if (tagged.length === 1) return `@${tagged[0].username}`;
  return `@${tagged[0].username} +${tagged.length - 1}`;
}

interface DualPhotoPreviewProps {
  frontPhoto: CapturedPhoto | null;
  rearPhoto:  CapturedPhoto | null;
  onDiscard:  () => void;
  onPost:     (front: CapturedPhoto, rear: CapturedPhoto) => void;
  isUploading: boolean;
  caption: string;
  onCaptionChange: (v: string) => void;
  taggedUsers: TaggedUser[];
  onTaggedUsersChange: (users: TaggedUser[]) => void;
}

function DualPhotoPreview({
  frontPhoto,
  rearPhoto,
  onDiscard,
  onPost,
  isUploading,
  caption,
  onCaptionChange,
  taggedUsers,
  onTaggedUsersChange,
}: DualPhotoPreviewProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [modalOpen, setModalOpen] = useState(false);

  // Which photo is the full-screen background: 'rear' or 'front'
  const [primaryFacing, setPrimaryFacing] = useState<'rear' | 'front'>('rear');

  // Pip position — bottom-left by default
  const defaultPipX = PIP_MARGIN;
  const defaultPipY = SCREEN_HEIGHT - PIP_H - PIP_MARGIN - PEEK_HEIGHT - 80;
  const pipTransX = useSharedValue(defaultPipX);
  const pipTransY = useSharedValue(defaultPipY);
  const pipStartX = useSharedValue(defaultPipX);
  const pipStartY = useSharedValue(defaultPipY);
  const pipScaleVal = useSharedValue(1);

  // Frozen refs so image stays visible during slide-out animation
  const frozenFront = useRef<CapturedPhoto | null>(null);
  const frozenRear  = useRef<CapturedPhoto | null>(null);
  if (frontPhoto !== null) frozenFront.current = frontPhoto;
  if (rearPhoto  !== null) frozenRear.current  = rearPhoto;

  const hasPhotos = frontPhoto !== null && rearPhoto !== null;
  type ActiveSheet = 'none' | 'caption' | 'tag';
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  // When non-null, the tag sheet was opened by typing `@` at this index in
  // the caption. On commit we splice `username ` right after that `@`, then
  // reopen the caption sheet. When null, the tag sheet was opened via the
  // tag pill and commits/cancels go straight back to 'none'.
  const [captionAtIndex, setCaptionAtIndex] = useState<number | null>(null);

  // Union rect covering both stacked pills (tag above, caption below).
  // Used by the PIP-dodge check; both pills lift together when the PIP overlaps.
  const pillW = 280;
  const pillH = 36;
  const pillGap = 12;
  const pillL = (SCREEN_WIDTH - pillW) / 2;
  const pillR = pillL + pillW;
  const pillsB = SCREEN_HEIGHT - PEEK_HEIGHT - 32 - 64 /* post btn */ - 12;
  const pillsT = pillsB - pillH - pillGap - pillH;

  const pillDodgeY = useDerivedValue(() => {
    'worklet';
    const overlaps =
      pipTransX.value + PIP_W > pillL &&
      pipTransX.value < pillR &&
      pipTransY.value + PIP_H > pillsT &&
      pipTransY.value < pillsB;
    return withSpring(overlaps ? -(PIP_H + 16) : 0, { damping: 18, stiffness: 180 });
  });

  const pillDodgeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pillDodgeY.value }],
  }));

  useEffect(() => {
    if (hasPhotos) {
      setModalOpen(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(slideAnim, {
        toValue: SCREEN_WIDTH,
        damping: 22,
        stiffness: 160,
        mass: 0.9,
        useNativeDriver: true,
      }).start(() => {
        frozenFront.current = null;
        frozenRear.current  = null;
        setModalOpen(false);
        setActiveSheet('none');
        // Reset pip position for next time
        pipTransX.value = defaultPipX;
        pipTransY.value = defaultPipY;
        pipStartX.value = defaultPipX;
        pipStartY.value = defaultPipY;
        pipScaleVal.value = 1;
        setPrimaryFacing('rear');
      });
    }
  }, [hasPhotos]);

  const pipPanGesture = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      'worklet';
      pipStartX.value = pipTransX.value;
      pipStartY.value = pipTransY.value;
      pipScaleVal.value = withSpring(1.1, { damping: 12, stiffness: 200 });
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
    })
    .onUpdate((e) => {
      'worklet';
      const rawX = pipStartX.value + e.translationX;
      const rawY = pipStartY.value + e.translationY;
      pipTransX.value = Math.max(PIP_MARGIN, Math.min(rawX, SCREEN_WIDTH - PIP_W - PIP_MARGIN));
      pipTransY.value = Math.max(PIP_MARGIN, Math.min(rawY, SCREEN_HEIGHT - PIP_H - PIP_MARGIN));
    })
    .onEnd(() => {
      'worklet';
      // Snap to nearest corner
      const midX = (SCREEN_WIDTH - PIP_W) / 2;
      const midY = (SCREEN_HEIGHT - PIP_H) / 2;
      const snapX = pipTransX.value < midX ? PIP_MARGIN : SCREEN_WIDTH - PIP_W - PIP_MARGIN;
      const snapY = pipTransY.value < midY ? PIP_MARGIN : SCREEN_HEIGHT - PIP_H - PIP_MARGIN;
      pipTransX.value = withSpring(snapX, { damping: 16, stiffness: 140, overshootClamping: true });
      pipTransY.value = withSpring(snapY, { damping: 16, stiffness: 140, overshootClamping: true });
      pipScaleVal.value = withSpring(1, { damping: 12, stiffness: 200 });
    });

  const pipTapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      setPrimaryFacing(f => (f === 'rear' ? 'front' : 'rear'));
    });

  const pipGesture = Gesture.Race(pipPanGesture, pipTapGesture);

  const pipAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: pipTransX.value },
      { translateY: pipTransY.value },
      { scale: pipScaleVal.value },
    ],
  }));

  const handleDiscard = () => {
    Alert.alert('Discard photos?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);
  };

  const primaryUri = primaryFacing === 'rear'
    ? frozenRear.current?.uri
    : frozenFront.current?.uri;

  const pipUri = primaryFacing === 'rear'
    ? frozenFront.current?.uri
    : frozenRear.current?.uri;

  return (
    <Modal
      visible={modalOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDiscard}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View
        style={[styles.previewPanel, { transform: [{ translateX: slideAnim }] }]}
      >
        {/* Primary full-screen photo */}
        {primaryUri && (
          <Image
            source={{ uri: primaryUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        )}

        {/* Tagged bubbles — read-only preview, anchored above the pill column.
            Rendered BEFORE the PIP so the draggable PIP paints on top. */}
        <TaggedBubbleStack users={taggedUsers} style={{ left: 16, bottom: 310 }} />

        {/* Pip — draggable, tap to swap */}
        {pipUri && (
          <GestureDetector gesture={pipGesture}>
            <Reanimated.View style={[styles.pip, pipAnimStyle]}>
              <Image
                source={{ uri: pipUri }}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
                resizeMode="cover"
              />
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* Discard — top right */}
        <TouchableOpacity
          style={styles.discardButton}
          activeOpacity={0.8}
          onPress={handleDiscard}
          disabled={isUploading}
        >
          <Text style={styles.discardX}>✕</Text>
        </TouchableOpacity>

        {/* Post — bottom center */}
        <View style={styles.postButtonFloat}>
          {/* Tag + Caption pills — lift together if the PIP overlaps */}
          <Reanimated.View style={[pillDodgeAnimStyle, { alignItems: 'center' }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isUploading}
              onPress={() => setActiveSheet('tag')}
              style={{ marginBottom: pillGap }}
            >
              <BlurView intensity={40} tint="dark" style={styles.captionPill}>
                <Text
                  style={[styles.captionPillText, taggedUsers.length > 0 && { color: '#FFFFFF' }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {tagPillLabel(taggedUsers)}
                </Text>
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isUploading}
              onPress={() => setActiveSheet('caption')}
              style={{ marginBottom: pillGap }}
            >
              <BlurView intensity={40} tint="dark" style={styles.captionPill}>
                <Text
                  style={[styles.captionPillText, caption.trim() && { color: '#FFFFFF' }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {caption.trim() || '＋ Add a caption'}
                </Text>
              </BlurView>
            </TouchableOpacity>
          </Reanimated.View>

          <TouchableOpacity
            style={[styles.postButton, isUploading && { opacity: 0.5 }]}
            activeOpacity={0.82}
            disabled={isUploading}
            onPress={() => {
              if (frozenFront.current && frozenRear.current) {
                onPost(frozenFront.current, frozenRear.current);
              }
            }}
          >
            <Text style={styles.postButtonText}>POST</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <CaptionSheet
        visible={activeSheet === 'caption'}
        initialValue={caption}
        onClose={(committed) => {
          onCaptionChange(committed);
          setActiveSheet('none');
        }}
        onOpenTagAt={(atIndex, currentText) => {
          // User typed `@` mid-caption. Commit the current text (with the
          // `@` still in place) and hand off to TagSheet in single-shot mode.
          onCaptionChange(currentText);
          setCaptionAtIndex(atIndex);
          setActiveSheet('tag');
        }}
      />

      <TagSheet
        visible={activeSheet === 'tag'}
        initialSelected={taggedUsers}
        singleShot={captionAtIndex !== null}
        onCancel={() => {
          // If we came from the caption `@` bridge, return to the caption
          // sheet (the `@` stays in the text). Otherwise, close entirely.
          if (captionAtIndex !== null) {
            setCaptionAtIndex(null);
            setActiveSheet('caption');
          } else {
            setActiveSheet('none');
          }
        }}
        onCommit={(users) => {
          if (captionAtIndex !== null && users.length > 0) {
            // `@` bridge commit: splice `username ` right after the `@`
            // at captionAtIndex, add the user to the taggedUsers list
            // (deduped + capped), and reopen the caption sheet.
            const picked = users[0];
            const insertion = `${picked.username} `;
            const spliced =
              caption.slice(0, captionAtIndex + 1) +
              insertion +
              caption.slice(captionAtIndex + 1);
            onCaptionChange(spliced);

            const already = taggedUsers.some((u) => u.user_id === picked.user_id);
            if (!already) {
              if (taggedUsers.length >= MAX_TAGS) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } else {
                onTaggedUsersChange([...taggedUsers, picked]);
              }
            }

            setCaptionAtIndex(null);
            setActiveSheet('caption');
          } else {
            onTaggedUsersChange(users);
            setActiveSheet('none');
          }
        }}
      />
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Caption Sheet ────────────────────────────────────────────────────────────

interface CaptionSheetProps {
  visible:      boolean;
  initialValue: string;
  onClose:      (committed: string) => void;
  /** Fires when the user types `@` — parent closes this sheet and opens TagSheet. */
  onOpenTagAt?: (atIndex: number, currentText: string) => void;
}

function CaptionSheet({ visible, initialValue, onClose, onOpenTagAt }: CaptionSheetProps) {
  const [draft, setDraft] = useState(initialValue);
  const cursorRef = useRef(0);

  // Reseed when the sheet re-opens (ignore initialValue changes while open).
  useEffect(() => {
    if (visible) setDraft(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const commit = () => onClose(draft.trim());

  const handleChangeText = (next: string) => {
    // Detect a freshly typed `@` at the current cursor. If so, hand off to
    // the parent which will commit the current draft and open the TagSheet.
    if (onOpenTagAt && next.length > draft.length) {
      const pos = cursorRef.current;
      if (pos > 0 && next[pos - 1] === '@') {
        onOpenTagAt(pos - 1, next);
        return;
      }
    }
    setDraft(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={commit}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetFlex}
      >
        <Pressable style={styles.sheetScrim} onPress={commit} />
        <View style={styles.sheetPanel}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetLabelRow}>
            <Text style={styles.sheetLabel}>CAPTION</Text>
            <Text style={styles.sheetCounter}>{draft.length}/200</Text>
          </View>
          <TextInput
            style={styles.sheetInput}
            value={draft}
            onChangeText={handleChangeText}
            onSelectionChange={(e) => { cursorRef.current = e.nativeEvent.selection.end; }}
            placeholder="What's the story?"
            placeholderTextColor="rgba(232,232,227,0.45)"
            multiline
            maxLength={200}
            autoFocus
            textAlignVertical="top"
          />
          <TouchableOpacity style={styles.sheetDone} activeOpacity={0.85} onPress={commit}>
            <Text style={styles.sheetDoneText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Tag Sheet ────────────────────────────────────────────────────────────────

const MAX_TAGS = 10;

function TagUserRow({
  item,
  selected,
  onPress,
}: {
  item: ProfileSearchResult;
  selected: boolean;
  onPress: () => void;
}) {
  const display = item.display_name ?? item.first_name ?? item.username ?? '—';
  const initial = display[0]?.toUpperCase() ?? '?';
  return (
    <TouchableOpacity
      style={[styles.tagRow, selected && styles.tagRowSelected]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.tagAvatar} />
      ) : (
        <View style={[styles.tagAvatar, styles.tagAvatarFallback]}>
          <Text style={styles.tagAvatarInitial}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.tagRowName}>{display}</Text>
        <Text style={styles.tagRowHandle}>@{item.username}</Text>
      </View>
      {selected ? <Text style={styles.tagRowCheck}>✓</Text> : null}
    </TouchableOpacity>
  );
}

interface TagSheetProps {
  visible:         boolean;
  initialSelected: TaggedUser[];
  onCancel:        () => void;
  onCommit:        (users: TaggedUser[]) => void;
  /**
   * When true, tapping a user immediately commits just that one user and
   * closes the sheet — used by the caption `@` bridge where picking is a
   * single-shot autocomplete, not multi-select.
   */
  singleShot?:     boolean;
}

function TagSheet({ visible, initialSelected, onCancel, onCommit, singleShot }: TagSheetProps) {
  const [selected, setSelected] = useState<TaggedUser[]>(initialSelected);
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<ProfileSearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reseed when the sheet re-opens; ignore changes to initialSelected while open.
  useEffect(() => {
    if (visible) {
      setSelected(initialSelected);
      setQuery('');
      setResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced search — mirrors GlobalSearchOverlay's 350ms pattern.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data } = await searchProfiles(q, 20);
      setResults(data ?? []);
      setLoading(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const toggle = (u: ProfileSearchResult) => {
    const asTagged: TaggedUser = {
      user_id:      u.id,
      username:     u.username,
      display_name: u.display_name,
      avatar_url:   u.avatar_url,
    };

    // Single-shot mode: tap to immediately commit just this one user.
    if (singleShot) {
      onCommit([asTagged]);
      return;
    }

    const already = selected.some((s) => s.user_id === u.id);
    if (already) {
      setSelected((prev) => prev.filter((s) => s.user_id !== u.id));
      return;
    }
    if (selected.length >= MAX_TAGS) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setSelected((prev) => [...prev, asTagged]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetFlex}
      >
        <Pressable style={styles.sheetScrim} onPress={onCancel} />
        <View style={styles.sheetPanel}>
          <TouchableOpacity style={styles.sheetCloseX} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.sheetCloseXText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.sheetHandle} />

          <View style={styles.sheetLabelRow}>
            <Text style={styles.sheetLabel}>TAG PEOPLE</Text>
            {singleShot
              ? null
              : <Text style={styles.sheetCounter}>{selected.length}/{MAX_TAGS}</Text>}
          </View>

          <TextInput
            style={styles.tagSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search for someone to tag"
            placeholderTextColor="rgba(232,232,227,0.45)"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.tagResultsList}
            ListEmptyComponent={
              query.trim() && !loading
                ? <Text style={styles.tagEmptyText}>No users found.</Text>
                : null
            }
            renderItem={({ item }) => (
              <TagUserRow
                item={item}
                selected={selected.some((s) => s.user_id === item.id)}
                onPress={() => toggle(item)}
              />
            )}
          />

          {singleShot ? null : (
            <TouchableOpacity style={styles.sheetDone} activeOpacity={0.85} onPress={() => onCommit(selected)}>
              <Text style={styles.sheetDoneText}>DONE</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

type CaptureState = 'idle' | 'front' | 'switching' | 'awaiting-rear' | 'rear';

export default function CameraScreen(): React.JSX.Element {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission,    requestMicPermission]    = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const { dark } = useAppTheme();

  const [facing,       setFacing]       = useState<'back' | 'front'>('front');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [isUploading,  setIsUploading]  = useState(false);
  const [frontPhoto,   setFrontPhoto]   = useState<CapturedPhoto | null>(null);
  const [rearPhoto,    setRearPhoto]    = useState<CapturedPhoto | null>(null);
  const [caption,      setCaption]      = useState<string>('');
  const [taggedUsers,  setTaggedUsers]  = useState<TaggedUser[]>([]);

  const userId     = useAuthStore((s) => s.user?.id);
  const profile    = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);

  const streakCount = profile?.streak_current ?? 0;

  const today = new Date().toLocaleDateString('en-CA');
  const hasPostedToday = profile?.streak_last_upload_date === today;

  const isRestDay = (() => {
    const routine = profile?.fitness_routine;
    if (!routine) return false;
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return !routine.split(',').includes(dayName);
  })();

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
  }, [cameraPermission?.status]);

  useEffect(() => {
    if (micPermission && !micPermission.granted && micPermission.canAskAgain) {
      requestMicPermission();
    }
  }, [micPermission?.status]);

  // Helper: take a photo from whatever camera is currently active
  const takePhoto = async (): Promise<CapturedPhoto | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    if (!photo?.uri) return null;
    // Re-encode to bake EXIF orientation into pixel data
    const { uri: normalizedUri } = await manipulateAsync(photo.uri, [], {
      compress: 0.8,
      format: SaveFormat.JPEG,
    });
    const base64 = await FileSystem.readAsStringAsync(normalizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri: normalizedUri, base64 };
  };

  // Two-stage capture: tap 1 takes the selfie and flips to rear; tap 2 takes
  // the POV shot. Splitting this gives the user time to frame the second shot
  // — the old auto-capture fired before people were ready and came out blurry.
  const pendingFrontRef = useRef<CapturedPhoto | null>(null);

  const startCaptureFront = async () => {
    if (captureState !== 'idle') return;

    // Step 1: ensure we're on front camera and take the selfie
    setCaptureState('front');
    setFacing('front');
    // Brief pause for camera to settle after potential facing change
    await new Promise(r => setTimeout(r, 300));
    const front = await takePhoto();
    if (!front) {
      setCaptureState('idle');
      return;
    }
    pendingFrontRef.current = front;

    // Step 2: flip to rear and wait for it to initialise, then hand control
    // back to the user — they must tap again when ready for the POV shot.
    setCaptureState('switching');
    setFacing('back');
    await new Promise(r => setTimeout(r, 800));
    setCaptureState('awaiting-rear');
  };

  const captureRear = async () => {
    if (captureState !== 'awaiting-rear') return;
    const front = pendingFrontRef.current;
    if (!front) {
      setCaptureState('idle');
      return;
    }

    setCaptureState('rear');
    const rear = await takePhoto();
    setCaptureState('idle');
    pendingFrontRef.current = null;
    if (!rear) return;

    setFrontPhoto(front);
    setRearPhoto(rear);
  };

  const handleShutterPress = () => {
    if (captureState === 'idle') {
      startCaptureFront();
    } else if (captureState === 'awaiting-rear') {
      captureRear();
    }
  };

  // Upload both photos, create post
  const uploadPhotos = async (front: CapturedPhoto, rear: CapturedPhoto) => {
    if (!userId || !profile) return;
    setIsUploading(true);

    const tempId              = `pending_${Date.now()}`;
    const optimisticStreakDay = profile.streak_current + 1;
    const captionValue = caption || null;
    const taggedUsersSnapshot = taggedUsers;

    setProfile({ ...profile, streak_current: optimisticStreakDay });

    // Optimistic feed entry — use rear as primary display image
    useFeedStore.getState().addPending({
      id:            tempId,
      isPending:     true,
      user_id:       userId,
      image_url:     rear.uri,
      pov_image_url: front.uri,
      caption:       captionValue,
      streak_day:    optimisticStreakDay,
      created_at:    new Date().toISOString(),
      like_count:    0,
      comment_count: 0,
      liked_by_me:   false,
      tagged_users:  taggedUsersSnapshot,
      profiles: {
        id:           userId,
        username:     profile.username,
        display_name: profile.display_name,
        avatar_url:   profile.avatar_url,
      },
    });

    // Dismiss preview immediately so camera returns while upload runs
    setFrontPhoto(null);
    setRearPhoto(null);
    setCaption('');
    setTaggedUsers([]);
    setIsUploading(false);

    let rearStoragePath:  string | null = null;
    let frontStoragePath: string | null = null;

    try {
      const rearBuffer  = decode(rear.base64);
      const frontBuffer = decode(front.base64);
      const timestamp   = Date.now();
      rearStoragePath   = `${userId}/${timestamp}_${Math.random().toString(36).slice(2)}.jpg`;
      frontStoragePath  = `${userId}/${timestamp}_${Math.random().toString(36).slice(2)}_pov.jpg`;

      // Upload both in parallel
      const [rearUpload, frontUpload] = await Promise.all([
        supabase.storage.from('posts').upload(rearStoragePath,  rearBuffer,  { contentType: 'image/jpeg', upsert: false }),
        supabase.storage.from('posts').upload(frontStoragePath, frontBuffer, { contentType: 'image/jpeg', upsert: false }),
      ]);
      if (rearUpload.error)  throw new Error(rearUpload.error.message);
      if (frontUpload.error) throw new Error(frontUpload.error.message);

      const rearUrl  = supabase.storage.from('posts').getPublicUrl(rearUpload.data.path).data.publicUrl;
      const frontUrl = supabase.storage.from('posts').getPublicUrl(frontUpload.data.path).data.publicUrl;

      const { data: streakResult, error: streakErr } = await recordUpload(userId, today);
      if (streakErr) throw streakErr;

      const confirmedStreakDay = streakResult?.streak_current ?? optimisticStreakDay;

      const { data: postData, error: postErr } = await createPost({
        userId,
        imageUrl:    rearUrl,
        povImageUrl: frontUrl,
        streakDay:   confirmedStreakDay,
        caption:     captionValue ?? undefined,
        taggedUserIds: taggedUsersSnapshot.map((u) => u.user_id),
      });
      // createPost returns (data, error) where a non-null error with non-null
      // data means "post created but tag insert failed". In that case we still
      // want to confirm the post in the feed; just log the tag-insert failure.
      if (postErr && !postData) throw postErr;
      if (postErr && postData) {
        Sentry.captureException(postErr, {
          tags: { flow: 'camera', action: 'post_tags_insert' },
          extra: { userId, postId: postData.id },
        });
      }

      if (postData) {
        useFeedStore.getState().confirmPending(tempId, {
          ...postData,
          profiles: {
            id:           userId,
            username:     profile.username,
            display_name: profile.display_name,
            avatar_url:   profile.avatar_url,
          },
          tagged_users: taggedUsersSnapshot,
        } as FeedPost);

        useProfilePostsStore.getState().addPost(postData);
      }

      if (streakResult) {
        const current = useUserStore.getState().profile;
        if (current) {
          setProfile({
            ...current,
            streak_current:          streakResult.streak_current,
            streak_highest:          streakResult.streak_highest,
            streak_lowest:           streakResult.streak_lowest,
            streak_last_upload_date: today,
          });
        }
      }
    } catch (err) {
      console.error('[uploadPhotos] upload failed', err);
      Sentry.captureException(err, {
        tags: { flow: 'camera', action: 'upload' },
        extra: { userId },
      });
      useFeedStore.getState().removePending(tempId);
      const current = useUserStore.getState().profile;
      if (current) setProfile({ ...current, streak_current: profile.streak_current });
      // Clean up any orphaned storage objects
      const toRemove = [rearStoragePath, frontStoragePath].filter(Boolean) as string[];
      if (toRemove.length) supabase.storage.from('posts').remove(toRemove).catch(() => {});
    }
  };

  const handleDiscard = () => {
    setFrontPhoto(null);
    setRearPhoto(null);
    setCaption('');
    setTaggedUsers([]);
  };

  if (!cameraPermission || !micPermission) {
    return <View style={styles.root} />;
  }

  const cameraGranted = cameraPermission.granted;
  const micGranted    = micPermission.granted;
  const shutterRing   = dark ? '#FFFFFF' : '#1A1A17';
  const shutterFill   = dark ? '#FFFFFF' : '#1A1A17';
  const flipColor     = '#FFFFFF';

  const isCapturing = captureState !== 'idle';
  // The shutter is tappable in 'idle' (start) and 'awaiting-rear' (take POV).
  // Everything else is mid-capture and should be locked out.
  const shutterDisabled =
    hasPostedToday ||
    (captureState !== 'idle' && captureState !== 'awaiting-rear');

  if (!cameraGranted || !micGranted) {
    let message: string;
    if (!cameraGranted && !micGranted) {
      message = 'Mahi needs access to your camera and microphone to power your fitness experience.';
    } else if (!cameraGranted) {
      message = 'Mahi needs camera access to power your fitness experience.';
    } else {
      message = 'Mahi needs microphone access to record your workout sessions.';
    }

    const canAskCamera = !cameraGranted && cameraPermission.canAskAgain;
    const canAskMic    = !micGranted    && micPermission.canAskAgain;
    const canAskAny    = canAskCamera || canAskMic;

    return (
      <View style={styles.root}>
        <View style={styles.permissionCenter}>
          <Text style={styles.deniedMessage}>{message}</Text>
          {!canAskAny && (
            <TouchableOpacity
              style={styles.permissionButton}
              activeOpacity={0.8}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.permissionButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Capture state label shown while sequencing
  const captureLabel =
    captureState === 'front'         ? 'SELFIE...' :
    captureState === 'switching'     ? 'SWITCHING...' :
    captureState === 'awaiting-rear' ? 'TAP FOR POV' :
    captureState === 'rear'          ? 'POV...' : null;

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <StreakBadge count={streakCount} />

      {isRestDay && !hasPostedToday && (
        <Text style={styles.restDayLabel}>REST DAY</Text>
      )}

      {/* Capture progress overlay */}
      {captureLabel && (
        <View style={styles.captureLabelWrap}>
          <Text style={styles.captureLabel}>{captureLabel}</Text>
        </View>
      )}

      {hasPostedToday && (
        <MidnightCountdown onUnlock={() => {
          setProfile({ ...useUserStore.getState().profile! });
        }} />
      )}

      <View style={styles.controlsRow}>
        <View style={styles.flipButton} />

        <TouchableOpacity
          style={[
            styles.shutterOuter,
            {
              borderColor: shutterRing,
              shadowColor: dark ? '#000000' : '#1A1A17',
              opacity: shutterDisabled ? 0.3 : 1,
            },
          ]}
          activeOpacity={0.82}
          disabled={shutterDisabled}
          onPress={handleShutterPress}
        >
          <View style={[styles.shutterInner, { backgroundColor: shutterFill }]} />
        </TouchableOpacity>

        {/* Spacer */}
        <View style={styles.flipButton} />
      </View>

      <DualPhotoPreview
        frontPhoto={frontPhoto}
        rearPhoto={rearPhoto}
        onDiscard={handleDiscard}
        onPost={uploadPhotos}
        isUploading={isUploading}
        caption={caption}
        onCaptionChange={setCaption}
        taggedUsers={taggedUsers}
        onTaggedUsersChange={setTaggedUsers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  streakBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 80,
    right: 24,
    alignItems: 'center',
  },
  streakNumber: {
    color: '#FFFFFF',
    fontSize: 38,
    fontFamily: 'JosefinSans_700Bold',
    lineHeight: 38,
  },
  streakLabel: {
    color: '#E8E8E3',
    fontSize: 8,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2.5,
    textAlign: 'center',
    opacity: 0.65,
    marginTop: 3,
    lineHeight: 11,
  },
  restDayLabel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 170 : 142,
    right: 24,
    color: '#E8E8E3',
    fontSize: 10,
    fontFamily: 'JosefinSans_400Regular_Italic',
    letterSpacing: 2,
    opacity: 0.5,
    textAlign: 'center',
  },
  captureLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  captureLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 4,
    opacity: 0.9,
  },
  postedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  postedTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  countdownTimer: {
    color: '#FFFFFF',
    fontSize: 48,
    fontFamily: 'JosefinSans_700Bold',
    letterSpacing: 6,
    textAlign: 'center',
  },
  postedSub: {
    color: '#E8E8E3',
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    opacity: 0.55,
    letterSpacing: 1,
  },
  controlsRow: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
  },
  flipButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  // ── Preview panel ─────────────────────────────────────────────────────────
  previewPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#111111',
  },
  pip: {
    position: 'absolute',
    width: PIP_W,
    height: PIP_H,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  discardButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 108 : 80,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardX: {
    color: '#111111',
    fontSize: 14,
    fontFamily: 'JosefinSans_600SemiBold',
    lineHeight: 16,
  },
  postButtonFloat: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  postButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 20,
    paddingHorizontal: 56,
  },
  postButtonText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  captionPill: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    maxWidth: 280,
  },
  captionPillText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  // ── Caption bottom sheet
  sheetFlex: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetPanel: {
    backgroundColor: '#1C1C19',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetLabel: {
    color: '#E8E8E3',
    fontSize: 11,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  sheetCounter: {
    color: 'rgba(232,232,227,0.45)',
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
  },
  sheetInput: {
    minHeight: 96,
    maxHeight: 160,
    color: '#E8E8E3',
    fontSize: 15,
    fontFamily: 'JosefinSans_400Regular_Italic',
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  sheetDone: {
    backgroundColor: '#59c2d7',
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  sheetDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'JosefinSans_600SemiBold',
    letterSpacing: 2,
  },
  // ── Tag sheet (search + user rows)
  sheetCloseX: {
    position: 'absolute',
    top: 10,
    right: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  sheetCloseXText: {
    color: 'rgba(232,232,227,0.6)',
    fontSize: 18,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  tagSearchInput: {
    height: 44,
    color: '#E8E8E3',
    fontSize: 15,
    fontFamily: 'JosefinSans_400Regular_Italic',
    paddingHorizontal: 14,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tagResultsList: {
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  tagEmptyText: {
    color: 'rgba(232,232,227,0.45)',
    fontSize: 13,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    gap: 12,
  },
  tagRowSelected: {
    backgroundColor: 'rgba(89,194,215,0.08)',
    borderRadius: 8,
  },
  tagAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  tagAvatarFallback: {
    backgroundColor: '#2A2A27',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAvatarInitial: {
    color: '#E8E8E3',
    fontSize: 15,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  tagRowName: {
    color: '#E8E8E3',
    fontSize: 14,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  tagRowHandle: {
    color: 'rgba(232,232,227,0.45)',
    fontSize: 12,
    fontFamily: 'JosefinSans_400Regular_Italic',
    marginTop: 1,
  },
  tagRowCheck: {
    color: '#59c2d7',
    fontSize: 18,
    fontFamily: 'JosefinSans_600SemiBold',
  },
  // ── Permissions ───────────────────────────────────────────────────────────
  permissionCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  deniedMessage: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'JosefinSans_400Regular_Italic',
    textAlign: 'center',
    opacity: 0.8,
    paddingHorizontal: 32,
  },
  permissionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingVertical: 20,
    paddingHorizontal: 40,
  },
  permissionButtonText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'JosefinSans_600SemiBold',
  },
});
