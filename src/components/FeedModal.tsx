import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import FeedScreen from '@/screens/FeedScreen';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FeedModal({ visible, onClose }: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const bg    = dark ? '#1C1C19' : '#FFFFFF';
  const text  = dark ? '#E8E8E3' : '#1A1A17';
  const btnBg = dark ? 'rgba(232,232,227,0.12)' : 'rgba(26,26,23,0.08)';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: text }]}>SOCIAL FEED</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeCircle, { backgroundColor: btnBg }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.closeX, { color: text }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <FeedScreen />
        </View>
      </SafeAreaView>
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
  content: {
    flex: 1,
  },
});
