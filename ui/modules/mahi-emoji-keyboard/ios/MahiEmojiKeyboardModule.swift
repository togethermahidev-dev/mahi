import ExpoModulesCore
import ObjectiveC
import UIKit

/// Switches React Native's focused text field to the iPhone's own emoji keyboard (with Apple's
/// "Search Emoji" bar) and back to letters.
///
/// UIKit asks the focused field's `textInputMode` which keyboard to show, when it gets the cursor
/// and on `reloadInputViews()`. React Native's fields (RCTUITextField, RCTUITextView) don't
/// override it, so on first use we add an override to those two classes: it returns `forced`
/// when set, otherwise exactly what UIKit would. Nothing changes until the emoji button is used.
/// Needs the Emoji keyboard turned on in Settings (it is by default); without it, nothing happens.
public class MahiEmojiKeyboardModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("MahiEmojiKeyboard")

    Events("onEmojiModeChange")

    // on: switch the focused field, or the next one to get the cursor, to emoji. Off: letters.
    // Resolves true when emoji is (or will be) up.
    AsyncFunction("setEmojiMode") { (on: Bool) -> Bool in
      MahiKeyboardMode.install()
      self.observePhone()
      let field = MahiKeyboardMode.focusedField()
      if on {
        guard let emoji = MahiKeyboardMode.emojiMode() else { return false }
        if let showing = field.flatMap({ MahiKeyboardMode.unforcedMode(of: $0) }),
           showing.primaryLanguage != MahiKeyboardMode.emoji {
          MahiKeyboardMode.lettersBefore = showing
        }
        MahiKeyboardMode.forced = emoji
      } else {
        // Back to the letters keyboard that was up before, else the phone's first one.
        MahiKeyboardMode.forced = MahiKeyboardMode.lettersBefore ?? MahiKeyboardMode.lettersMode()
      }
      field?.reloadInputViews()
      return on
    }
    .runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        MahiKeyboardMode.reset()
      }
      for observer in self.observers {
        NotificationCenter.default.removeObserver(observer)
      }
      self.observers = []
    }
  }

  /// Follows the phone: the person may switch keyboards with the globe / ABC key, and a field
  /// that loses the cursor starts again on the phone's normal keyboard.
  private func observePhone() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: UITextInputMode.currentInputModeDidChangeNotification, object: nil, queue: .main
      ) { [weak self] _ in
        // Let UIKit finish switching before reading which keyboard is up.
        DispatchQueue.main.async { self?.keyboardChanged() }
      })
    for name in [UITextField.textDidEndEditingNotification, UITextView.textDidEndEditingNotification] {
      observers.append(
        center.addObserver(forName: name, object: nil, queue: .main) { note in
          guard let field = note.object as? UIResponder, MahiKeyboardMode.isReactField(field) else {
            return
          }
          MahiKeyboardMode.reset()
        })
    }
  }

  private func keyboardChanged() {
    guard let field = MahiKeyboardMode.focusedField(),
          let showing = MahiKeyboardMode.unforcedMode(of: field) else { return }
    let isEmoji = showing.primaryLanguage == MahiKeyboardMode.emoji
    // The person switched away from what we asked for: stop asking.
    if let forced = MahiKeyboardMode.forced,
       (forced.primaryLanguage == MahiKeyboardMode.emoji) != isEmoji {
      MahiKeyboardMode.forced = nil
    }
    sendEvent("onEmojiModeChange", ["emoji": isEmoji])
  }
}

/// The last responder that answered `mahiEmoji_reportFirstResponder(_:)`.
private weak var mahiReportedResponder: UIResponder?

extension UIResponder {
  @objc fileprivate func mahiEmoji_reportFirstResponder(_ sender: Any?) {
    mahiReportedResponder = self
  }
}

/// Main thread only.
enum MahiKeyboardMode {
  static let emoji = "emoji"
  private static let fieldClassNames = ["RCTUITextField", "RCTUITextView"]
  private static let getter = #selector(getter: UIResponder.textInputMode)
  private static var installed = false

  /// The keyboard React Native's fields ask for; nil = the phone's normal choice.
  static var forced: UITextInputMode?
  /// The letters keyboard that was up before emoji, to go back to.
  static var lettersBefore: UITextInputMode?

  static func reset() {
    forced = nil
    lettersBefore = nil
  }

  static func install() {
    guard !installed else { return }
    installed = true
    typealias Getter = @convention(c) (AnyObject, Selector) -> UITextInputMode?
    for name in fieldClassNames {
      guard let cls = NSClassFromString(name),
            let method = class_getInstanceMethod(cls, getter) else { continue }
      // UIKit's own answer (inherited from UITextField / UITextView).
      let original = unsafeBitCast(method_getImplementation(method), to: Getter.self)
      let selector = getter
      let replacement: @convention(block) (AnyObject) -> UITextInputMode? = { field in
        if let forced = MahiKeyboardMode.forced { return forced }
        return original(field, selector)
      }
      _ = class_replaceMethod(
        cls, getter, imp_implementationWithBlock(replacement), method_getTypeEncoding(method))
    }
  }

  static func isReactField(_ responder: UIResponder) -> Bool {
    fieldClassNames.contains { name in
      guard let cls = NSClassFromString(name) else { return false }
      return responder.isKind(of: cls)
    }
  }

  /// React Native's text field that has the cursor, if any.
  static func focusedField() -> UIResponder? {
    mahiReportedResponder = nil
    UIApplication.shared.sendAction(
      #selector(UIResponder.mahiEmoji_reportFirstResponder(_:)), to: nil, from: nil, for: nil)
    guard let responder = mahiReportedResponder, isReactField(responder) else { return nil }
    return responder
  }

  /// The keyboard actually up for a field, ignoring what we ask for.
  static func unforcedMode(of field: UIResponder) -> UITextInputMode? {
    let saved = forced
    forced = nil
    defer { forced = saved }
    return field.textInputMode
  }

  static func emojiMode() -> UITextInputMode? {
    UITextInputMode.activeInputModes.first { $0.primaryLanguage == emoji }
  }

  static func lettersMode() -> UITextInputMode? {
    UITextInputMode.activeInputModes.first {
      guard let language = $0.primaryLanguage else { return false }
      return language != emoji && language != "dictation"
    }
  }
}
