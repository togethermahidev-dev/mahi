/**
 * AvatarPicker
 *
 * Displays the user's profile avatar and — when `isSelf` is true — a "+" button
 * that lets the owner replace it with a new photo.
 *
 * ## Hooks used
 * - `useState`                               react
 * - `useCallback`                            react
 * - `ImagePicker.useCameraPermissions`       expo-image-picker
 * - `ImagePicker.useMediaLibraryPermissions` expo-image-picker
 *
 * ## Upload flow
 * 1. User taps "+" → `handleEditPress` shows an ActionSheet (iOS) or Alert (Android).
 * 2. Selection routes to `handleCamera` or `handleLibrary`.
 * 3. Both run the shared permission guard before launching the native picker.
 * 4. On image selection, `processAndUpload` is called (awaited to prevent parallel uploads):
 *    a. Sets `localUri` for an optimistic preview.
 *    b. Reads the file as Base64 via `FileSystem.readAsStringAsync`.
 *    c. Decodes to an ArrayBuffer and uploads to the Supabase `avatars` bucket
 *       at path `{userId}/avatar.jpg` with `upsert: true`.
 *    d. Calls `updateAvatarUrl` to persist the stable public URL to `profiles.avatar_url`.
 *    e. Calls `onUpdate` with a cache-busted URL so React Native Image re-renders
 *       immediately (the base URL is stable; `?t=` is in-memory only).
 *
 * ## Permissions
 * - If permission is denied and `canAskAgain` is true, requests it before opening the picker.
 * - If permanently denied, shows an Alert with an "Open Settings" deep-link.
 *
 * ## Related files
 * - `@/api/profile`   — `updateAvatarUrl(userId, url)` writes to `profiles` table
 * - `@/lib/supabase`  — Supabase client (anon key, RLS enforced server-side)
 * - Supabase Storage  — `avatars` bucket, public, RLS: foldername[1] = auth.uid()
 */

import React, { useState, useCallback } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { updateAvatarUrl } from '@/api/profile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvatarPickerProps {
  /** Current avatar URL from `profiles.avatar_url`, or null if not set. */
  avatarUrl: string | null;
  /** Pre-computed first-character initials shown when there is no avatar. */
  initials: string;
  /** When true renders the "+" edit button. Pass `userId === profile.id`. */
  isSelf: boolean;
  /** Authenticated user's UUID — used as the storage folder prefix. */
  userId: string;
  /** Theme colors forwarded from the parent screen. */
  colors: { bg: string; text: string; muted: string };
  /**
   * Called after a successful upload with the new cache-busted URL.
   * The caller should spread this into the Zustand profile: `setProfile({ ...profile, avatar_url: newUrl })`.
   */
  onUpdate: (newUrl: string) => void;
}

// ─── Hook: useAvatarUpload ────────────────────────────────────────────────────

/**
 * Encapsulates all upload logic so `AvatarPicker` stays a thin presentation layer.
 *
 * @returns `{ uploading, localUri, handleEditPress }`
 */
function useAvatarUpload(userId: string, onUpdate: (url: string) => void) {
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  // expo-image-picker permission hooks — separate from expo-camera's hooks.
  // These are scoped to ImagePicker usage and do not interfere with CameraScreen.
  const [cameraPermission, requestCameraPermission] =
    ImagePicker.useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] =
    ImagePicker.useMediaLibraryPermissions();

  /** Shows a non-blocking alert directing the user to open Settings. */
  const showPermissionAlert = useCallback((type: 'Camera' | 'Media Library') => {
    Alert.alert(
      `${type} Access Required`,
      `Mahi needs ${type.toLowerCase()} access to update your profile photo. Please enable it in Settings.`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }, []);

  /**
   * Core upload pipeline. Must be awaited by callers to prevent parallel uploads.
   *
   * Steps: read file → base64 → ArrayBuffer → Supabase Storage → DB update → notify parent.
   */
  const processAndUpload = useCallback(async (uri: string) => {
    setLocalUri(uri); // optimistic preview
    setUploading(true);
    try {
      // Read as Base64 (matches the pattern used in CameraScreen.tsx)
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = decode(base64);

      // Deterministic path — upsert overwrites the previous avatar in-place.
      const storagePath = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      // Stable public URL written to DB. Cache-buster applied in-memory only
      // so RN Image always re-renders after re-upload without polluting the DB
      // with ephemeral timestamps.
      const publicUrl = supabase.storage
        .from('avatars')
        .getPublicUrl(storagePath).data.publicUrl;

      const { error: dbError } = await updateAvatarUrl(userId, publicUrl);
      if (dbError) throw dbError;

      onUpdate(`${publicUrl}?t=${Date.now()}`);
    } catch {
      setLocalUri(null);
      Alert.alert('Upload Failed', 'Could not update your profile photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [userId, onUpdate]);

  /**
   * Shared permission guard.
   * Returns `true` if the permission is (or becomes) granted, `false` otherwise.
   */
  const ensurePermission = useCallback(async (
    permission: ImagePicker.PermissionResponse | null,
    request: () => Promise<ImagePicker.PermissionResponse>,
    type: 'Camera' | 'Media Library',
  ): Promise<boolean> => {
    let perm = permission;
    if (!perm?.granted) {
      if (perm?.canAskAgain) {
        perm = await request();
      }
      if (!perm?.granted) {
        showPermissionAlert(type);
        return false;
      }
    }
    return true;
  }, [showPermissionAlert]);

  /** Opens the native camera. Awaits upload to prevent parallel requests. */
  const handleCamera = useCallback(async () => {
    const ok = await ensurePermission(cameraPermission, requestCameraPermission, 'Camera');
    if (!ok) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await processAndUpload(result.assets[0].uri);
    }
  }, [cameraPermission, requestCameraPermission, ensurePermission, processAndUpload]);

  /** Opens the native media library with a 1:1 crop. Awaits upload to prevent parallel requests. */
  const handleLibrary = useCallback(async () => {
    const ok = await ensurePermission(libraryPermission, requestLibraryPermission, 'Media Library');
    if (!ok) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      await processAndUpload(result.assets[0].uri);
    }
  }, [libraryPermission, requestLibraryPermission, ensurePermission, processAndUpload]);

  /**
   * Entry point for the "+" button.
   * Uses `ActionSheetIOS` on iOS for native feel; falls back to `Alert` on Android.
   */
  const handleEditPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) handleCamera(); else if (i === 2) handleLibrary(); },
      );
    } else {
      Alert.alert('Update Photo', '', [
        { text: 'Take Photo', onPress: handleCamera },
        { text: 'Choose from Library', onPress: handleLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [handleCamera, handleLibrary]);

  return { uploading, localUri, handleEditPress };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvatarPicker({
  avatarUrl,
  initials,
  isSelf,
  userId,
  colors,
  onUpdate,
}: AvatarPickerProps): React.JSX.Element {
  const { uploading, localUri, handleEditPress } = useAvatarUpload(userId, onUpdate);

  // Show local optimistic preview while uploading, otherwise the persisted URL.
  const displayUri = localUri ?? avatarUrl;

  return (
    <View style={styles.container}>
      {/* Avatar — image or initials fallback */}
      {displayUri ? (
        <Image source={{ uri: displayUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.fallback, { backgroundColor: colors.muted }]}>
          <Text style={[styles.initial, { color: colors.text }]}>{initials}</Text>
        </View>
      )}

      {/* Upload spinner overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

      {/* Edit button — visible only to the profile owner, hidden while uploading */}
      {isSelf && !uploading && (
        <TouchableOpacity
          style={styles.editButton}
          activeOpacity={0.8}
          onPress={handleEditPress}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.editPlus}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 20,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 36,
    fontFamily: 'JosefinSans_700Bold',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  editPlus: {
    fontSize: 16,
    lineHeight: 18,
    color: '#1A1A17',
    fontFamily: 'JosefinSans_600SemiBold',
  },
});
