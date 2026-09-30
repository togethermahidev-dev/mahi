import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ProfileMediaMap from '@/components/ProfileMediaMap';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore, useUserStore } from '@/store';
import { FONTS } from '@/constants/fonts';
import { COLORS, withAlpha, FONT_SIZE, SPACE, RADIUS } from '@/constants/tokens';

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
    paddingHorizontal: SPACE.s24,
    paddingVertical: SPACE.s16,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
    letterSpacing: 4,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.r18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontFamily: FONTS.semiBold,
    fontSize: FONT_SIZE.f16,
    lineHeight: 18,
  },
  canvas: {
    flex: 1,
    marginHorizontal: SPACE.s16,
    marginBottom: SPACE.s16,
    borderRadius: RADIUS.r20,
    overflow: 'hidden',
  },
});
