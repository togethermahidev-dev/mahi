// app.config.js
/** The brand colour (COLORS.accent in src/constants/tokens.ts; designTokens.test.ts checks they match). */
const ACCENT = '#59c2d7';

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
    ['expo-notifications', { color: ACCENT, defaultChannel: 'default' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Mahi uses your photos so you can pick a profile photo.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Mahi uses your camera to take your workout photos and videos.',
        microphonePermission: 'Mahi uses the microphone to record sound in your workout videos.',
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
    // Didit identity checks (flag identity-verification, dormant in build 11). NFC passport
    // reading off, automatic capture on: no NFC capability, entitlement or usage text needed.
    // The plugin's preferred keys; its legacy iosNfcEnabled/androidNfcEnabled: false would give
    // Android the smaller 'core' variant (manual capture) instead.
    [
      '@didit-protocol/sdk-react-native',
      { iosVariant: 'autodetection', androidVariant: 'autodetection' },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: ACCENT,
        dark: {
          backgroundColor: ACCENT,
        },
      },
    ],
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.mahi.app',
    // One build number for every lane (eas.json appVersionSource "local"). Moved only by
    // `pnpm release:prepare`, never by hand or by EAS.
    buildNumber: '12',
    // Invite links: https://togethermahi.com/i/<token> opens the app when it's installed.
    // Needs apple-app-site-association served from that domain.
    associatedDomains: ['applinks:togethermahi.com', 'applinks:www.togethermahi.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'Mahi uses your camera to take your workout photos and videos.',
      NSMicrophoneUsageDescription:
        'Mahi uses the microphone to record sound in your workout videos.',
      NSPhotoLibraryUsageDescription: 'Mahi uses your photos so you can pick a profile photo.',
      NSLocationWhenInUseUsageDescription:
        'Mahi uses your location to optionally tag where a post was taken.',
      // No NSUserTrackingUsageDescription: nothing in the app asks to track (no App Tracking
      // Transparency prompt, no advertising ID). Takes effect at the next native build.
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
    versionCode: 12,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: ACCENT,
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
