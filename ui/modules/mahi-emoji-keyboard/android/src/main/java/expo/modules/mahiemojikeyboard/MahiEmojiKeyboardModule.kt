package expo.modules.mahiemojikeyboard

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android can't open the keyboard's own emoji page from an app, so the emoji button shows
 * [MahiEmojiPanelView] in the keyboard's place instead. (iPhone uses the phone's own emoji
 * keyboard: see ios/MahiEmojiKeyboardModule.swift.)
 */
class MahiEmojiKeyboardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MahiEmojiKeyboard")

    View(MahiEmojiPanelView::class) {
      // Brings the keyboard back to the field the panel types into. View functions run on the
      // main thread.
      AsyncFunction("showLetters") { view: MahiEmojiPanelView ->
        view.showLetters()
      }
    }
  }
}
