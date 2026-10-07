import ExpoModulesCore
import Foundation
import WidgetKit

/// What Mahi's iPhone extras share with the app through the App Group `group.com.mahi.app`
/// (build 13+). The names match ui/src/lib/appActions.ts (its test checks them).
///
/// - Switches: the app writes each kill switch as `switch.<flag>` = true / false, so the
///   Control Centre button can say "Open Mahi" and do nothing when its switch is off.
/// - Pending link: an intent (Control Centre, Siri, Shortcuts) can't open a screen itself. It
///   leaves a link such as `mahi://camera?from=control` under `mahi.pendingLink`, posts the Darwin
///   notification `com.mahi.app.pendingLink`, and opens Mahi; the app takes the link here.
public class MahiAppleExtrasModule: Module {
  static let appGroup = "group.com.mahi.app"
  static let pendingLinkKey = "mahi.pendingLink"
  static let switchPrefix = "switch."
  static let pendingLinkNotification = "com.mahi.app.pendingLink" as CFString

  private var observing = false

  public func definition() -> ModuleDefinition {
    Name("MahiAppleExtras")

    Events("onPendingLink")

    // values: { "switch.<flag>": true / false }. Controls are reloaded so their label follows.
    Function("setSwitches") { (values: [String: Bool]) in
      guard let defaults = UserDefaults(suiteName: Self.appGroup) else { return }
      for (key, on) in values where key.hasPrefix(Self.switchPrefix) {
        defaults.set(on, forKey: key)
      }
      if #available(iOS 18.0, *) {
        ControlCenter.shared.reloadAllControls()
      }
    }

    // The link an intent left, once (it is cleared as it is read), or nil.
    Function("takePendingLink") { () -> String? in
      guard let defaults = UserDefaults(suiteName: Self.appGroup),
        let link = defaults.string(forKey: Self.pendingLinkKey)
      else { return nil }
      defaults.removeObject(forKey: Self.pendingLinkKey)
      return link
    }

    OnStartObserving("onPendingLink") {
      self.startObserving()
    }

    OnStopObserving("onPendingLink") {
      self.stopObserving()
    }

    OnDestroy {
      self.stopObserving()
    }
  }

  private func startObserving() {
    guard !observing else { return }
    observing = true
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let module = Unmanaged<MahiAppleExtrasModule>.fromOpaque(observer).takeUnretainedValue()
        module.sendEvent("onPendingLink", [:])
      },
      Self.pendingLinkNotification,
      nil,
      .deliverImmediately
    )
  }

  private func stopObserving() {
    guard observing else { return }
    observing = false
    CFNotificationCenterRemoveObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      CFNotificationName(Self.pendingLinkNotification),
      nil
    )
  }
}
