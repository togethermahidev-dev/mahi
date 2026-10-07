import AppIntents
import Foundation

// Compiled into both the app and the Mahi widget extension (ExpoWidgetsTarget, as
// MahiControlIntents.swift) by ui/modules/mahi-apple-extras/app.plugin.js: an intent that opens
// the app must be in the app too. Names match ui/src/lib/appActions.ts (its test checks them).

/// The App Group hand-over to the app: an intent can't open a screen itself, so it leaves a link
/// for the app to take, tells it, and Mahi opens (`openAppWhenRun`). With the switch off nothing
/// is left, so Mahi just opens as it is.
@available(iOS 16.0, *)
enum MahiLinks {
  static let appGroup = "group.com.mahi.app"
  static let pendingLinkKey = "mahi.pendingLink"
  static let pendingLinkNotification = "com.mahi.app.pendingLink"

  /// A switch the app wrote (`switch.<flag>`); on until the app has said otherwise.
  static func isOn(_ switchKey: String) -> Bool {
    UserDefaults(suiteName: appGroup)?.object(forKey: switchKey) as? Bool ?? true
  }

  static func leave(_ link: String, switchKey: String) {
    guard isOn(switchKey), let defaults = UserDefaults(suiteName: appGroup) else { return }
    defaults.set(link, forKey: pendingLinkKey)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(pendingLinkNotification as CFString),
      nil,
      nil,
      true
    )
  }
}

// Siri, Shortcuts and Spotlight (switch `siri-shortcuts`): the App Shortcuts that offer these are
// in the app only (MahiAppShortcuts.swift).

/// "Post a workout in Mahi": opens Mahi on the camera.
@available(iOS 16.0, *)
struct PostWorkoutIntent: AppIntent {
  static let title: LocalizedStringResource = "Post a workout"
  static let description = IntentDescription("Opens the camera in Mahi.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    MahiLinks.leave("mahi://camera?from=siri", switchKey: "switch.siri-shortcuts")
    return .result()
  }
}

/// "Open my invites in Mahi": the links you sent and who joined.
@available(iOS 16.0, *)
struct OpenInvitesIntent: AppIntent {
  static let title: LocalizedStringResource = "Open my invites"
  static let description = IntentDescription("Shows the links you sent and who joined.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    MahiLinks.leave("mahi://invites?from=siri", switchKey: "switch.siri-shortcuts")
    return .result()
  }
}

/// "Find friends on Mahi": who from your contacts is on Mahi.
@available(iOS 16.0, *)
struct FindMatesIntent: AppIntent {
  static let title: LocalizedStringResource = "Find friends in your contacts"
  static let description = IntentDescription("Shows who from your contacts is on Mahi.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    MahiLinks.leave("mahi://find-mates?from=siri", switchKey: "switch.siri-shortcuts")
    return .result()
  }
}

/// The Control Centre / lock screen button: opens Mahi on the camera.
@available(iOS 16.0, *)
struct PostWorkoutControlIntent: AppIntent {
  static let title: LocalizedStringResource = "Post a workout"
  static let description = IntentDescription("Opens the camera in Mahi.")
  static let openAppWhenRun: Bool = true
  // The control's own action; Shortcuts lists "Post a workout in Mahi" instead.
  static let isDiscoverable: Bool = false

  @MainActor
  func perform() async throws -> some IntentResult {
    MahiLinks.leave("mahi://camera?from=control", switchKey: "switch.control-post-workout")
    return .result()
  }
}
