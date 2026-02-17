import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';

const LIGHT_BG = '#F5F5F0';
const DARK_BG = '#0F0F0D';
const TEXT_COLOR = '#FFFFFF';

export default function WelcomeScreen(): React.JSX.Element {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'dark' ? DARK_BG : LIGHT_BG;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.hero}>
        <Text style={styles.title}>MAHI</Text>
        <Text style={styles.subtitle}>The fitness accountability app</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={() => console.log('navigate: sign-up')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonTextDark}>Create an account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={() => console.log('navigate: login')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonTextLight}>Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: TEXT_COLOR,
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: 10,
    marginBottom: 12,
  },
  subtitle: {
    color: TEXT_COLOR,
    fontSize: 16,
    fontWeight: '400',
    opacity: 0.7,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  buttonPrimary: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonTextDark: {
    color: '#0F0F0D',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextLight: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
