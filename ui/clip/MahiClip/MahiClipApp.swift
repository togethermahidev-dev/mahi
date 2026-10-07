import StoreKit
import SwiftUI

// Mahi's App Clip (build 13+). Someone without Mahi taps an invite link
// (togethermahi.com/i/<token>) on an iPhone, taps Open on the App Clip card, and lands here:
// who invited them, the same words as the invite web page, and one button, "Get Mahi", that
// opens the App Store sheet. No sign-up in the clip. The only thing saved is the invite link,
// for the full app to pick up (InviteHandover). Native SwiftUI, no React Native, to stay small.

@main
struct MahiClipApp: App {
  var body: some Scene {
    WindowGroup {
      InviteScreen()
    }
  }
}

@MainActor
final class InviteModel: ObservableObject {
  enum Phase: Equatable {
    case waiting
    case noInvite
    case loaded(InvitePreview?)
  }

  @Published private(set) var phase: Phase = .waiting
  @Published private(set) var invite: String?

  /// The link the clip was opened with (also the default appclip.apple.com link: no invite).
  func open(_ url: URL?) {
    guard let invite = InviteLink.invite(from: url) else {
      self.invite = nil
      phase = .noInvite
      return
    }
    self.invite = invite
    phase = .waiting
    Task {
      let preview = await InvitePreviewClient.fetch(invite)
      if self.invite == invite { phase = .loaded(preview) }
    }
  }

  /// Opened with no link at all (from the App Library): say so instead of waiting for ever.
  func noLinkCame() {
    if invite == nil, phase == .waiting { phase = .noInvite }
  }

  /// Hand the invite over unless the server said it's used or ran out.
  func handOver() {
    guard let invite else { return }
    if case .loaded(let preview?) = phase, !preview.open { return }
    InviteHandover.save(invite)
  }
}

struct InviteScreen: View {
  @StateObject private var model = InviteModel()
  @State private var showStore = false

  var body: some View {
    ZStack {
      MahiTheme.bg.ignoresSafeArea()
      VStack(alignment: .leading, spacing: MahiTokens.s24) {
        Spacer(minLength: MahiTokens.s48)
        content
        Spacer()
        if model.phase != .waiting {
          Button {
            model.handOver()
            showStore = true
          } label: {
            Text("Get Mahi")
              .font(.inter(MahiTokens.semiBold, MahiTokens.f17))
              .foregroundStyle(MahiTheme.buttonLabel)
              .frame(maxWidth: .infinity)
              .padding(.vertical, MahiTokens.s18)
              .background(Capsule().fill(MahiTheme.buttonFill))
          }
          .accessibilityHint("Opens the App Store")
        }
      }
      .padding(.horizontal, MahiTokens.s24)
      .padding(.bottom, MahiTokens.s24)
      .animation(.easeOut(duration: MahiTokens.d200), value: model.phase)
    }
    .appStoreOverlay(isPresented: $showStore) {
      SKOverlay.AppClipConfiguration(position: .bottom)
    }
    .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
      model.open(activity.webpageURL)
    }
    .task {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      model.noLinkCame()
    }
  }

  @ViewBuilder private var content: some View {
    switch model.phase {
    case .waiting:
      // A quiet placeholder while the invite loads, never a guess.
      VStack(alignment: .leading, spacing: MahiTokens.s12) {
        Circle().fill(MahiTheme.placeholder).frame(width: MahiTokens.z56, height: MahiTokens.z56)
        Capsule().fill(MahiTheme.placeholder).frame(height: MahiTokens.l38)
        Capsule().fill(MahiTheme.placeholder).frame(height: MahiTokens.l24)
      }
      .accessibilityLabel("Loading your invite")
    case .noInvite:
      words(InvitePreview.unknownHeadline, InvitePreview.unknownLine)
    case .loaded(nil):
      words(InvitePreview.unknownHeadline, InvitePreview.unknownLine)
    case .loaded(let preview?):
      VStack(alignment: .leading, spacing: MahiTokens.s24) {
        inviter(preview)
        words(preview.headline, preview.line)
      }
    }
  }

  private func inviter(_ preview: InvitePreview) -> some View {
    HStack(spacing: MahiTokens.s12) {
      AsyncImage(url: preview.avatarURL) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        MahiTheme.placeholder
      }
      .frame(width: MahiTokens.z56, height: MahiTokens.z56)
      .clipShape(Circle())
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        if let name = preview.displayName, !name.isEmpty {
          Text(name)
            .font(.inter(MahiTokens.bold, MahiTokens.f17))
            .foregroundStyle(MahiTheme.text)
        }
        Text("@\(preview.username)")
          .font(.inter(MahiTokens.regular, MahiTokens.f14))
          .foregroundStyle(MahiTheme.muted)
      }
    }
  }

  private func words(_ headline: String, _ line: String) -> some View {
    VStack(alignment: .leading, spacing: MahiTokens.s8) {
      Text(headline)
        .font(.inter(MahiTokens.bold, MahiTokens.f28))
        .foregroundStyle(MahiTheme.text)
        .accessibilityAddTraits(.isHeader)
      Text(line)
        .font(.inter(MahiTokens.semiBold, MahiTokens.f16))
        .foregroundStyle(MahiTheme.text)
        .lineSpacing(MahiTokens.l24 - MahiTokens.f16)
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}
