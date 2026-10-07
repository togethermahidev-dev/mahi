import SwiftUI
import UIKit

// The App Clip's design values, copied from the app's tokens (ui/src/constants/tokens.ts and
// src/lib/themeColors.ts). The clip is native SwiftUI with no React Native, so it can't import
// them: when a token below changes in tokens.ts, change it here too. Names match the token names.
enum MahiTokens {
  // COLORS
  static let white = UIColor(hex: 0xFFFFFF)       // COLORS.white
  static let bgDark = UIColor(hex: 0x1C1C19)      // COLORS.bgDark
  static let offBlack = UIColor(hex: 0x1A1A17)    // COLORS.offBlack
  static let offWhite = UIColor(hex: 0xE8E8E3)    // COLORS.offWhite
  static let surfaceLight = UIColor(hex: 0xF5F5F0) // COLORS.surfaceLight
  static let surfaceDark = UIColor(hex: 0x2A2A27) // COLORS.surfaceDark

  // ALPHA
  static let a65: CGFloat = 0.65 // ALPHA.a65 (muted text, as themeColors)

  // FONT_SIZE / LINE_HEIGHT
  static let f28: CGFloat = 28 // FONT_SIZE.f28 (headline, as the invite web page)
  static let l38: CGFloat = 38 // LINE_HEIGHT.l38
  static let f17: CGFloat = 17 // FONT_SIZE.f17 (button)
  static let f16: CGFloat = 16 // FONT_SIZE.f16 (body)
  static let l24: CGFloat = 24 // LINE_HEIGHT.l24
  static let f14: CGFloat = 14 // FONT_SIZE.f14 (hint)

  // SPACE
  static let s8: CGFloat = 8   // SPACE.s8
  static let s12: CGFloat = 12 // SPACE.s12
  static let s18: CGFloat = 18 // SPACE.s18
  static let s24: CGFloat = 24 // SPACE.s24
  static let s48: CGFloat = 48 // SPACE.s48

  // SIZE
  static let z56: CGFloat = 56 // SIZE.z56 (the inviter's photo)

  // DURATION
  static let d200: Double = 0.2 // DURATION.d200 (ms in tokens.ts, seconds here)

  // Inter, the app's one typeface (FONTS in src/constants/fonts.ts). The .ttf files sit next to
  // this file and are listed under UIAppFonts in Info.plist.
  static let regular = "Inter-Regular"   // FONTS.regular
  static let semiBold = "Inter-SemiBold" // FONTS.semiBold
  static let bold = "Inter-Bold"         // FONTS.bold
}

/// The light or dark colours, as themeColors(dark) in the app.
enum MahiTheme {
  static let bg = Color(UIColor { $0.userInterfaceStyle == .dark ? MahiTokens.bgDark : MahiTokens.white })
  static let text = Color(UIColor { $0.userInterfaceStyle == .dark ? MahiTokens.offWhite : MahiTokens.offBlack })
  static let muted = text.opacity(MahiTokens.a65)
  static let placeholder = Color(UIColor {
    $0.userInterfaceStyle == .dark ? MahiTokens.surfaceDark : MahiTokens.surfaceLight
  })
  /// The button: filled with the text colour, its words in the page colour.
  static let buttonFill = text
  static let buttonLabel = bg
}

extension UIColor {
  convenience init(hex: UInt32) {
    self.init(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
}

extension Font {
  static func inter(_ name: String, _ size: CGFloat) -> Font {
    .custom(name, size: size)
  }
}
