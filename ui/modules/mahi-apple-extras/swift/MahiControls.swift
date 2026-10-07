import AppIntents
import SwiftUI
import WidgetKit

/// "Post a workout" in Control Centre, on the lock screen or on the Action button (iOS 18+,
/// switch `control-post-workout`). A tap opens Mahi on the camera. Switch off: the button reads
/// "Open Mahi" and just opens Mahi.
///
/// Lives in the Mahi widget extension (ExpoWidgetsTarget) beside the MahiTag widget: added to it,
/// and to its WidgetBundle, by ui/modules/mahi-apple-extras/app.plugin.js.
@available(iOS 18.0, *)
struct PostWorkoutControl: ControlWidget {
  static let kind = "com.mahi.app.controls.post-workout"

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind) {
      ControlWidgetButton(action: PostWorkoutControlIntent()) {
        Label(
          MahiLinks.isOn("switch.control-post-workout") ? "Post a workout" : "Open Mahi",
          systemImage: "camera"
        )
      }
    }
    .displayName("Post a workout")
    .description("Opens the camera in Mahi.")
  }
}
