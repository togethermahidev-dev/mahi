import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import LoginSheet from '@/components/LoginSheet';
import CreateAccountSheet from '@/components/CreateAccountSheet';

const { height } = Dimensions.get('window');

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
  // Placeholders until Apple / Google sign-in is built; each pill is hidden by its own flag.
  const showApple = useFeatureFlag('auth-apple-signin');
  const showGoogle = useFeatureFlag('auth-google-signin');

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
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: sheetText }]}
            activeOpacity={0.8}
            onPress={() => setShowSignup(true)}
          >
            <Text style={[styles.buttonText, { color: sheetBg }]}>Create an account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonOutline, { borderColor: sheetText }]}
            activeOpacity={0.8}
            onPress={() => setShowLogin(true)}
          >
            <Text style={[styles.buttonText, { color: sheetText }]}>Login</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <View style={styles.gap} />

      <Animated.View
        style={[
          styles.bottomSheet,
          { backgroundColor: sheetBg, transform: [{ translateY: botY }] },
        ]}
      >
        {showApple || showGoogle ? (
          <View style={styles.buttons}>
            {showApple ? (
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline, { borderColor: sheetText }]}
                activeOpacity={0.8}
                onPress={() => {}}
              >
                <Text style={[styles.buttonText, { color: sheetText }]}>Continue with Apple</Text>
              </TouchableOpacity>
            ) : null}
            {showGoogle ? (
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline, { borderColor: sheetText }]}
                activeOpacity={0.8}
                onPress={() => {}}
              >
                <Text style={[styles.buttonText, { color: sheetText }]}>Continue with Google</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
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
  buttons: { width: '100%', gap: 12 },
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
