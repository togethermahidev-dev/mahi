package expo.modules.mahiemojikeyboard

import android.content.Context
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import androidx.emoji2.emojipicker.EmojiPickerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Google's emoji picker (categories, recents, skin tones; no search) in the keyboard's place.
 *
 * While it shows, the keyboard is hidden but the field keeps its cursor. A picked emoji goes in
 * at the cursor, through the field's text, so React Native's onChangeText fires as for typing
 * (and the field's maxLength still applies). [showLetters] brings the keyboard back.
 */
class MahiEmojiPanelView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {

  // The picker is a RecyclerView: let Android lay it out inside the size React Native gives.
  override val shouldUseAndroidLayout: Boolean = true

  private val picker = EmojiPickerView(context)

  init {
    // Taps on the picker never take the cursor from the field.
    descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
    picker.setOnEmojiPickedListener { item -> insert(item.emoji) }
    addView(
      picker,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      )
    )
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    // Hide the letters; the field keeps the cursor.
    post {
      val field = focusedField() ?: return@post
      inputMethods()?.hideSoftInputFromWindow(field.windowToken, 0)
    }
  }

  fun showLetters(): Boolean {
    val field = focusedField() ?: return false
    return inputMethods()?.showSoftInput(field, 0) ?: false
  }

  /** The text field with the cursor in this window (a sheet is its own window). */
  private fun focusedField(): EditText? = rootView?.findFocus() as? EditText

  private fun inputMethods(): InputMethodManager? =
    context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager

  private fun insert(emoji: String) {
    val field = focusedField() ?: return
    val text = field.text ?: return
    val a = field.selectionStart
    val b = field.selectionEnd
    val start = if (a < 0 || b < 0) text.length else minOf(a, b)
    val end = if (a < 0 || b < 0) text.length else maxOf(a, b)
    text.replace(start, end, emoji)
    field.setSelection(minOf(start + emoji.length, text.length))
  }
}
