import React, { useState } from 'react';
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

interface AvatarPickerProps {
  avatarUrl: string | null;
  initials: string;
  isSelf: boolean;
  userId: string;
  colors: { bg: string; text: string; muted: string };
  onUpdate: (newUrl: string) => void;
}

export default function AvatarPicker({
  avatarUrl,
  initials,
  isSelf,
  userId,
  colors,
  onUpdate,
}: AvatarPickerProps): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  const [cameraPermission, requestCameraPermission] =
    ImagePicker.useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] =
    ImagePicker.useMediaLibraryPermissions();

  const displayUri = localUri ?? avatarUrl;

  function showPermissionAlert(type: 'Camera' | 'Media Library') {
    Alert.alert(
      `${type} Access Required`,
      `Mahi needs ${type.toLowerCase()} access to update your profile photo. Please enable it in Settings.`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }

  async function processAndUpload(uri: string) {
    setLocalUri(uri);
    setUploading(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = decode(base64);
      const storagePath = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage
        .from('avatars')
        .getPublicUrl(storagePath).data.publicUrl;

      const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: dbError } = await updateAvatarUrl(userId, cacheBustedUrl);
      if (dbError) throw dbError;

      onUpdate(cacheBustedUrl);
    } catch {
      setLocalUri(null);
      Alert.alert('Upload Failed', 'Could not update your profile photo. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleCamera() {
    let perm = cameraPermission;
    if (!perm?.granted) {
      if (perm?.canAskAgain) {
        perm = await requestCameraPermission();
      }
      if (!perm?.granted) {
        showPermissionAlert('Camera');
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      processAndUpload(result.assets[0].uri);
    }
  }

  async function handleLibrary() {
    let perm = libraryPermission;
    if (!perm?.granted) {
      if (perm?.canAskAgain) {
        perm = await requestLibraryPermission();
      }
      if (!perm?.granted) {
        showPermissionAlert('Media Library');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (!result.canceled && result.assets[0]) {
      processAndUpload(result.assets[0].uri);
    }
  }

  function handleEditPress() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleCamera();
          else if (buttonIndex === 2) handleLibrary();
        },
      );
    } else {
      Alert.alert('Update Photo', '', [
        { text: 'Take Photo', onPress: handleCamera },
        { text: 'Choose from Library', onPress: handleLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  return (
    <View style={styles.container}>
      {displayUri ? (
        <Image source={{ uri: displayUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.fallback, { backgroundColor: colors.muted }]}>
          <Text style={[styles.initial, { color: colors.text }]}>{initials}</Text>
        </View>
      )}

      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

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
    ...StyleSheet.absoluteFillObject,
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
