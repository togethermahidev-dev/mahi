import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore, useUserStore } from '@/store';
import { FONTS } from '@/constants/fonts';
import {
  COLORS,
  withAlpha,
  FONT_SIZE,
  SPACE,
  RADIUS,
  LINE_HEIGHT,
  OFFSET,
  SIZE,
  TRACKING,
} from '@/constants/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileMediaMapModal({
  visible,
  onClose,
}: Props): React.JSX.Element | null {
  const { dark } = useAppTheme();
  const bg = dark ? COLORS.bgDark : COLORS.white;
  const text = dark ? COLORS.offWhite : COLORS.offBlack;
  const btnBg = dark ? withAlpha(COLORS.offWhite, 0.12) : withAlpha(COLORS.offBlack, 0.08);

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
              hitSlop={{ top: OFFSET.o8, bottom: OFFSET.o8, left: OFFSET.o8, right: OFFSET.o8 }}
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
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s16,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
    letterSpacing: TRACKING.t4,
  },
  closeCircle: {
    width: SIZE.z36,
    height: SIZE.z36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
    lineHeight: LINE_HEIGHT.l18,
  },
  canvas: {
    flex: 1,
    marginHorizontal: SPACE.s16,
    marginBottom: SPACE.s16,
    borderRadius: RADIUS.r20,
    overflow: 'hidden',
  },
});
