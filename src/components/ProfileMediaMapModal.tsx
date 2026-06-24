import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore, useUserStore } from '@/store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileMediaMapModal({
  visible,
  onClose,
}: Props): React.JSX.Element | null {
  const { dark } = useAppTheme();
  const bg = dark ? '#1C1C19' : '#FFFFFF';
  const text = dark ? '#E8E8E3' : '#1A1A17';
  const btnBg = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.08)';

  const userId = useAuthStore((s) => s.user?.id);
  const profile = useUserStore((s) => s.profile);

  if (!userId || !profile) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Modal renders in a separate native window — RNGH needs its own root here
          or pinch/pan gestures will not initialise (Worklets error) */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: text }]}>MY FEED</Text>

            {/* Circular ✕ — tapping sets visible=false, Modal plays slide-down automatically */}
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeCircle, { backgroundColor: btnBg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.closeX, { color: text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.canvas}>
            <ProfileMediaMap userId={profile.id} isSelf={userId === profile.id} />
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  title: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 16,
    letterSpacing: 4,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontFamily: 'JosefinSans_600SemiBold',
    fontSize: 16,
    lineHeight: 18,
  },
  canvas: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
