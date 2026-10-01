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
    'expo-status-bar',
    [
      'expo-build-properties',
      {
        // Apps built with the iOS 27 SDK must use the UIKit scene life cycle or
        // they fail to launch on iOS 27. Opt-in on SDK 57, default from SDK 58.
        ios: { enableSceneSupport: true },
      },
    ],
    '@react-native-community/datetimepicker',
    ['expo-notifications', { color: '#59c2d7', defaultChannel: 'default' }],
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
      'expo-location',
      {
        locationWhenInUsePermission:
          'Mahi uses your location to optionally tag where a post was taken.',
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
    // One build number for every lane (eas.json appVersionSource "local"). Moved only by
    // `pnpm release:prepare`, never by hand or by EAS.
    buildNumber: '10',
    // Invite links: https://togethermahi.com/i/<token> opens the app when it's installed.
    // Needs apple-app-site-association served from that domain.
    associatedDomains: ['applinks:togethermahi.com', 'applinks:www.togethermahi.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Mahi uses the camera to power your fitness accountability features.',
      NSMicrophoneUsageDescription: 'Mahi uses the microphone to record your workout sessions.',
      NSPhotoLibraryUsageDescription:
        'Mahi uses your photo library to let you share workout photos.',
      NSLocationWhenInUseUsageDescription:
        'Mahi uses your location to optionally tag where a post was taken.',
      NSUserTrackingUsageDescription: 'Mahi uses analytics to improve your fitness experience.',
    },
  },
  updates: {
    url: 'https://u.expo.dev/e05bad51-f352-464e-b344-78d7d60b5ce4',
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 30000,
    enableBsdiffPatchSupport: true,
  },
  // Follows `version`, so an OTA reaches exactly the builds of that version. Never set by hand.
  runtimeVersion: { policy: 'appVersion' },
  android: {
    // Same number as ios.buildNumber, every lane. Moved only by `pnpm release:prepare`.
    versionCode: 10,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#59c2d7',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    // The Android half of the same invite links. Needs assetlinks.json on the domain.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'togethermahi.com', pathPrefix: '/i' },
          { scheme: 'https', host: 'www.togethermahi.com', pathPrefix: '/i' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
};

module.exports = config;
