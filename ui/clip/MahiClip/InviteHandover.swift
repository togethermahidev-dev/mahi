import Foundation

// The invite in the link that opened the clip, who sent it, and the hand-over to the full app.
// The words and the reading follow web/app/_lib/links.ts (inviteFromPath, inviteHeadline,
// inviteLine, invitePreviewRequest) so the clip says exactly what the invite page says.

enum InviteLink {
  private static let token = try! NSRegularExpression(pattern: "^[0-9a-f]{32}$", options: [.caseInsensitive])
  /// The code alphabet has no 0, O, 1 or I.
  private static let code = try! NSRegularExpression(pattern: "^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$")

  /// The token (or 6-character code) in togethermahi.com/i/<invite>, or nil when it isn't one.
  static func invite(from url: URL?) -> String? {
    guard let url, let host = url.host?.lowercased(),
          host == "togethermahi.com" || host == "www.togethermahi.com" else { return nil }
    let parts = url.path.split(separator: "/").map(String.init)
    guard parts.count == 2, parts[0] == "i" else { return nil }
    let raw = parts[1].removingPercentEncoding ?? parts[1]
    if matches(token, raw) { return raw.lowercased() }
    let cleaned = raw.trimmingCharacters(in: .whitespaces).uppercased()
      .replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "-", with: "")
    return matches(code, cleaned) ? cleaned : nil
  }

  static func webLink(_ invite: String) -> String {
    "https://togethermahi.com/i/\(invite.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? invite)"
  }

  private static func matches(_ re: NSRegularExpression, _ s: String) -> Bool {
    re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil
  }
}

/// What get_invite_preview returns for a link it knows.
struct InvitePreview: Equatable {
  let username: String
  let displayName: String?
  let avatarURL: URL?
  let open: Bool
  let tag: Bool

  private var isTagLink: Bool { open && tag }

  var headline: String {
    isTagLink ? "@\(username) tagged you on Mahi" : "@\(username) invited you to Mahi"
  }

  var line: String {
    if !open {
      return "This invite has already been used or has run out, but you can still get Mahi. Ask @\(username) for a new one."
    }
    return isTagLink
      ? "Join and you’ll have 48 hours to post any workout back. You’ll follow each other and keep each other going."
      : "When you join, you’ll automatically follow each other."
  }

  /// No preview (a link the server doesn't know, or no connection): the page's words for that.
  static let unknownHeadline = "A friend invited you to Mahi"
  static let unknownLine = "When you join, you’ll automatically follow each other."
}

enum InvitePreviewClient {
  /// The project's public address and publishable key, the same public values as links.ts and the
  /// app. They only allow what a signed-out person may do.
  private static let supabaseURL = "https://pzepodsppqtvptzmwxzs.supabase.co"
  private static let publishableKey = "sb_publishable_2sNfUHdGuL1NQ_E5lC76XQ__pduUTG3"

  /// Who sent the invite, read fresh each time and never kept. nil when it can't be read.
  static func fetch(_ invite: String) async -> InvitePreview? {
    guard let url = URL(string: "\(supabaseURL)/rest/v1/rpc/get_invite_preview") else { return nil }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(publishableKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["p_token": invite])
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          (response as? HTTPURLResponse)?.statusCode == 200,
          let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]),
          let value = object as? [String: Any],
          let username = value["username"] as? String else { return nil }
    return InvitePreview(
      username: username,
      displayName: value["display_name"] as? String,
      avatarURL: (value["avatar_url"] as? String).flatMap(URL.init(string:)),
      open: value["open"] as? Bool ?? false,
      tag: value["tag"] as? Bool ?? false
    )
  }
}

/// The hand-over: on "Get Mahi" the invite link, and when it was saved, go into the App Group
/// the full app shares. iOS keeps that group when Mahi is installed; Mahi reads it once and
/// deletes it (ui/src/lib/clipHandover.ts — same group, key and shape). Nothing else is saved.
enum InviteHandover {
  static let appGroup = "group.com.mahi.app"
  static let key = "mahi.clipInvite"

  static func save(_ invite: String) {
    let value: [String: Any] = ["link": InviteLink.webLink(invite), "savedAt": Date().timeIntervalSince1970]
    guard let data = try? JSONSerialization.data(withJSONObject: value),
          let json = String(data: data, encoding: .utf8) else { return }
    // A string, not data: the app's reader (ExtensionStorage.get) hands a string back unchanged.
    UserDefaults(suiteName: appGroup)?.set(json, forKey: key)
  }
}
