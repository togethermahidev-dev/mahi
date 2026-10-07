// Mahi's App Clip (build 13+): opened from an invite link (togethermahi.com/i/<token>) on an
// iPhone without Mahi. Native SwiftUI only, no React Native (exportJs false), to stay well
// under Apple's 15 MB App Clip limit. Read by '@bacons/apple-targets' (app.config.js, the
// "App Clip" block). The plugin adds the parent-app entitlement (com.mahi.app) itself.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'clip',
  name: 'MahiClip',
  displayName: 'Mahi',
  bundleIdentifier: 'com.mahi.app.Clip',
  deploymentTarget: '16.4',
  icon: '../../assets/icon.png',
  exportJs: false,
  frameworks: ['SwiftUI', 'StoreKit'],
  entitlements: {
    // The invite links' domain (web/public/.well-known/apple-app-site-association "appclips").
    'com.apple.developer.associated-domains': ['appclips:togethermahi.com'],
    // Shared with the app and the widget: the hand-over of the invite (InviteHandover.swift).
    'com.apple.security.application-groups': ['group.com.mahi.app'],
  },
};
