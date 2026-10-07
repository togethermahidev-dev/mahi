// Mahi's Control Centre / lock screen button "Post a workout" (iOS 18+, build 13+; switch
// `control-post-workout`). A second widget extension beside expo-widgets' one (MahiTag), built by
// @bacons/apple-targets. Files in _shared/ are compiled into the app too: a control's intent that
// opens the app must be in both. Same App Group as the app, so it can read the switch.

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'MahiControls',
  displayName: 'Mahi',
  bundleIdentifier: '.controls',
  // Controls are iOS 18. On older iPhones the extension is simply not offered.
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.mahi.app'],
  },
};
