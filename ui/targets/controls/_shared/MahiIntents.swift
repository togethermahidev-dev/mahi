import AppIntents
import Foundation

// Compiled into both the app and the MahiControls extension (apple-targets' _shared folder): an
// intent that opens the app must be in the app too. Names match ui/src/lib/appActions.ts (its
// test checks them).

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
