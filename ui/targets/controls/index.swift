import AppIntents
import SwiftUI
import WidgetKit

/// Mahi's controls (iOS 18+): add "Post a workout" in Control Centre, on the lock screen or to the
/// Action button. A tap opens Mahi on the camera. Switch `control-post-workout` off: the button
/// reads "Open Mahi" and just opens Mahi.
@main
struct MahiControlsBundle: WidgetBundle {
  var body: some Widget {
    PostWorkoutControl()
  }
}

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
