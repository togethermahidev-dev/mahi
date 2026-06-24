import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import LoginSheet from '@/components/LoginSheet';
import CreateAccountSheet from '@/components/CreateAccountSheet';

const { height, width } = Dimensions.get('window');
const SHEET_HEIGHT = (height - 55) / 2;

interface Props {
  onAuthComplete: () => void;
}

export default function WelcomeScreen({ onAuthComplete }: Props): React.JSX.Element {
  const { dark } = useAppTheme();
  const sheetBg = dark ? '#1C1C19' : '#FFFFFF';
  const sheetText = dark ? '#FFFFFF' : '#0F0F0D';

  const topY = useRef(new Animated.Value(0)).current;
  const botY = useRef(new Animated.Value(0)).current;

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const handleAuthComplete = () => {
    setShowLogin(false);
    setShowSignup(false);
    Animated.parallel([
      Animated.timing(topY, { toValue: -height, duration: 400, useNativeDriver: true }),
      Animated.timing(botY, { toValue: height, duration: 400, useNativeDriver: true }),
    ]).start(() => onAuthComplete());
  };

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.topSheet, { backgroundColor: sheetBg, transform: [{ translateY: topY }] }]}
      >
        <View style={styles.titles}>
          <View style={styles.titleWrapper}>
            <Text style={[styles.title, styles.titleEcho]}>MAHI</Text>
            <Text style={[styles.title, { color: sheetText }]}>MAHI</Text>
          </View>
          <Text style={[styles.subtitle, { color: sheetText }]}>
            The fitness accountability app
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: sheetText }]}
          activeOpacity={0.8}
          onPress={() => setShowSignup(true)}
        >
          <Text style={[styles.buttonText, { color: sheetBg }]}>Create an account</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.gap} />

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg, transform: [{ translateY: botY }] },
        ]}
      >
        <Image
          source={require('../../assets/mahibw.png')}
          style={styles.topSheetBg}
          resizeMode="contain"
        />
        <TouchableOpacity
          style={[styles.button, styles.buttonOutline, { borderColor: sheetText }]}
          activeOpacity={0.8}
          onPress={() => setShowLogin(true)}
        >
          <Text style={[styles.buttonText, { color: sheetText }]}>Login</Text>
        </TouchableOpacity>
      </Animated.View>

      <LoginSheet
        visible={showLogin}
        onDismiss={() => setShowLogin(false)}
        onAuthComplete={handleAuthComplete}
      />
      <CreateAccountSheet
        visible={showSignup}
        onDismiss={() => setShowSignup(false)}
        onAuthComplete={handleAuthComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  topSheetBg: {
    position: 'absolute',
    top: -(SHEET_HEIGHT * 0.2),
    left: -(width * 0.2),
    width: width * 1.4,
    height: SHEET_HEIGHT * 1.4,
    opacity: 0.25,
  },
  topSheet: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  titles: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrapper: { position: 'relative', marginBottom: 12 },
  title: { fontSize: 56, fontFamily: 'JosefinSans_700Bold', letterSpacing: 10 },
  titleEcho: { position: 'absolute', color: '#59c2d7', top: 4, left: 4 },
  subtitle: { fontSize: 16, fontFamily: 'JosefinSans_400Regular_Italic', opacity: 0.7 },
  gap: { height: 55 },
  bottomSheet: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 60,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  button: {
    width: '72%',
    alignSelf: 'center',
    paddingVertical: 20,
    borderRadius: 50,
    alignItems: 'center',
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  buttonText: { fontSize: 18, fontFamily: 'JosefinSans_600SemiBold' },
});
