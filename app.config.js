// app.config.js
/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'mahi-fitness',
  slug: 'mahi-fitness',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  extra: {
    buildNumber: '1',
  },
  plugins: [
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission: 'Mahi uses the camera to power your fitness accountability features.',
        microphonePermission: false,
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: 'mahi-org',
        project: 'react-native',
        url: 'https://sentry.io/',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#F5F5F0',
        dark: {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: '#0F0F0D',
        },
      },
    ],
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mahifitness.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F5F5F0',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
};

module.exports = config;
