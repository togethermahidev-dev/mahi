import CoreSpotlight
import ExpoModulesCore
import Foundation
import UIKit

/// A tap on one of Mahi's Spotlight items (switch `spotlight`) opens the app with a
/// CSSearchableItemActionType activity whose identifier is the item's link, e.g.
/// `mahi://invites?from=spotlight`. It is left as the pending link, as an intent leaves one, and
/// the app takes it (src/hooks/useAppActions.ts). Any other activity (universal links) is left to
/// React Native. Expo forwards the scene's activities here, cold start included.
public class MahiSpotlightAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    defer { restorationHandler(nil) }
    guard userActivity.activityType == CSSearchableItemActionType,
      let link = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
      link.hasPrefix("mahi://")
    else { return false }
    MahiAppleExtrasModule.leavePendingLink(link)
    return true
  }
}
