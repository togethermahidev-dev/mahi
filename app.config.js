// app.config.js
/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Mahi',
  slug: 'mahi',
  owner: 'togethermahis-organization',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'mahi',
  extra: {
    eas: {
      projectId: 'e05bad51-f352-464e-b344-78d7d60b5ce4',
    },
  },
  plugins: [
    'expo-dev-client',
    'expo-updates',
    'expo-font',
    '@react-native-community/datetimepicker',
    [
      'expo-image-picker',
      {
        photosPermission: 'Mahi uses your photo library to let you share workout photos.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Mahi uses the camera to power your fitness accountability features.',
        microphonePermission: 'Mahi uses the microphone to record your workout sessions.',
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
        backgroundColor: '#59c2d7',
        dark: {
          backgroundColor: '#59c2d7',
        },
      },
    ],
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mahi.app',
    buildNumber: '9',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'Mahi uses the camera to power your fitness accountability features.',
      NSMicrophoneUsageDescription: 'Mahi uses the microphone to record your workout sessions.',
      NSPhotoLibraryUsageDescription: 'Mahi uses your photo library to let you share workout photos.',
      NSUserTrackingUsageDescription: 'Mahi uses analytics to improve your fitness experience.',
    },
  },
  updates: {
    url: 'https://u.expo.dev/e05bad51-f352-464e-b344-78d7d60b5ce4',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 30000,
    enableBsdiffPatchSupport: true,
  },
  runtimeVersion: '0.1.0',
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#59c2d7',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
};

module.exports = config;
