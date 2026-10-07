// Mahi's own Swift for the app and the Mahi widget extension (build 13+), from ./swift:
// - MahiIntents.swift: the intents (the Control Centre button; Siri and Shortcuts). In the app
//   AND the widget extension: an intent that opens the app must be in both.
// - MahiAppShortcuts.swift: "Post a workout in Mahi" and the rest, in the app only.
// - MahiControls.swift: the "Post a workout" control (iOS 18+), in the widget extension, added to
//   its WidgetBundle.
//
// The widget extension is expo-widgets' ExpoWidgetsTarget (one extension for the MahiTag widget,
// the Live Activity and the control). @bacons/apple-targets can't add a second widget extension
// beside it: it takes over the first widget target it finds. expo-widgets rebuilds its folder on
// every prebuild, so this plugin must be listed BEFORE expo-widgets in app.config.js: Expo runs a
// later plugin's iOS steps first, so these steps then run after expo-widgets' own.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const WIDGET_TARGET = 'ExpoWidgetsTarget';
/** Source file in ./swift → name in the app's folder. */
const APP_FILES = {
  'MahiIntents.swift': 'MahiIntents.swift',
  // Siri, Shortcuts and Spotlight (switch `siri-shortcuts`). App only: one provider per app.
  'MahiAppShortcuts.swift': 'MahiAppShortcuts.swift',
};
/** Source file in ./swift → name in the widget extension's folder. */
const WIDGET_FILES = {
  'MahiIntents.swift': 'MahiControlIntents.swift',
  'MahiControls.swift': 'MahiControls.swift',
};
/** The last widget expo-widgets puts in its WidgetBundle; the control goes after it. */
const BUNDLE_ANCHOR = 'WidgetLiveActivity()';
const CONTROL_ENTRY = `${BUNDLE_ANCHOR}
    if #available(iOS 18.0, *) {
      PostWorkoutControl()
    }`;

function copyAll(files, toDir) {
  for (const [from, to] of Object.entries(files)) {
    fs.copyFileSync(path.join(__dirname, 'swift', from), path.join(toDir, to));
  }
}

const withMahiSwift = (config) => {
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const iosRoot = config.modRequest.platformProjectRoot;
      const appName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      copyAll(APP_FILES, path.join(iosRoot, appName));

      const widgetDir = path.join(iosRoot, WIDGET_TARGET);
      const indexPath = path.join(widgetDir, 'index.swift');
      if (!fs.existsSync(indexPath)) {
        throw new Error(
          `[mahi-apple-extras] ${WIDGET_TARGET}/index.swift is missing: list this plugin before expo-widgets in app.config.js.`
        );
      }
      copyAll(WIDGET_FILES, widgetDir);
      const index = fs.readFileSync(indexPath, 'utf8');
      if (!index.includes('PostWorkoutControl()')) {
        if (!index.includes(BUNDLE_ANCHOR)) {
          throw new Error(
            `[mahi-apple-extras] can't find ${BUNDLE_ANCHOR} in ${WIDGET_TARGET}/index.swift to add the control.`
          );
        }
        fs.writeFileSync(indexPath, index.replace(BUNDLE_ANCHOR, CONTROL_ENTRY));
      }
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const appName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    for (const file of Object.values(APP_FILES)) {
      const filepath = `${appName}/${file}`;
      if (!project.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName: appName,
          project,
        });
      }
    }

    const targetUuid = project.findTargetKey(WIDGET_TARGET);
    const groupUuid = project.findPBXGroupKey({ name: WIDGET_TARGET });
    if (!targetUuid || !groupUuid) {
      throw new Error(
        `[mahi-apple-extras] ${WIDGET_TARGET} isn't in the Xcode project yet: list this plugin before expo-widgets in app.config.js.`
      );
    }
    for (const file of Object.values(WIDGET_FILES)) {
      project.addSourceFile(file, { target: targetUuid }, groupUuid);
    }
    return config;
  });
};

module.exports = withMahiSwift;
