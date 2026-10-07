import AppIntents

/// Mahi's App Shortcuts (build 13+, switch `siri-shortcuts`): ready in Siri, the Shortcuts app and
/// Spotlight as soon as Mahi is installed, with nothing to set up. The intents are in
/// MahiIntents.swift. Added to the app target only (by ../app.plugin.js): an app has one
/// AppShortcutsProvider, and the widget extension must not carry a second.
@available(iOS 16.0, *)
struct MahiAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: PostWorkoutIntent(),
      phrases: [
        "Post a workout in \(.applicationName)",
        "Post in \(.applicationName)",
      ]
    )
    AppShortcut(
      intent: OpenInvitesIntent(),
      phrases: [
        "Open my invites in \(.applicationName)",
        "Show my \(.applicationName) invites",
      ]
    )
    AppShortcut(
      intent: FindMatesIntent(),
      phrases: [
        "Find friends on \(.applicationName)",
        "Find friends in \(.applicationName)",
      ]
    )
  }
}
