package com.islam.ikariamtouch

import android.app.AlertDialog
import android.os.LocaleList
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.util.Locale

/**
 * Big native text editor that replaces the game's tiny text boxes on a phone.
 * Supports Arabic (right-to-left) and the normal Android keyboard.
 */
object Composer {

    fun show(act: MainActivity, req: JSONObject) {
        val id = req.optString("id")
        val multiline = req.optBoolean("multiline")
        val numeric = req.optBoolean("numeric")
        val max = req.optInt("max", 0)
        val hint = req.optString("hint").trim()

        val edit = EditText(act).apply {
            setText(req.optString("value"))
            setSelection(text.length)
            textDirection = View.TEXT_DIRECTION_FIRST_STRONG   // Arabic shows right-to-left automatically
            textSize = 18f
            when {
                numeric -> {
                    inputType = InputType.TYPE_CLASS_NUMBER
                    imeOptions = imeOptions or EditorInfo.IME_FLAG_FORCE_ASCII
                    imeHintLocales = LocaleList(Locale.US)
                }
                multiline -> {
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                        InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                    minLines = 4
                    maxLines = 10
                    gravity = Gravity.TOP or Gravity.START
                }
                else -> {
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                    isSingleLine = true
                }
            }
            if (max > 0) filters = arrayOf(InputFilter.LengthFilter(max))
        }

        val box = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(act.dp(20), act.dp(8), act.dp(20), 0)
            addView(edit, LinearLayout.LayoutParams(MATCH, WRAP))
        }

        // Character counter when the game sets a limit (e.g. messages).
        if (max > 0) {
            val counter = TextView(act).apply { textSize = 12f; gravity = Gravity.END }
            fun update() { counter.text = "${edit.text.length} / $max" }
            update()
            edit.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) = update()
            })
            box.addView(counter, LinearLayout.LayoutParams(MATCH, WRAP))
        }

        val title = if (hint.isNotEmpty()) hint.take(60) else act.word("write")

        val b = AlertDialog.Builder(act).setTitle(title).setView(box)
        if (multiline || numeric) {
            b.setPositiveButton(act.word("insert")) { _, _ -> act.fillField(id, edit.text.toString(), send = false) }
            b.setNeutralButton(act.word("keyboard")) { _, _ -> act.focusFieldRaw(id) }
        } else {
            b.setPositiveButton(act.word("send")) { _, _ -> act.fillField(id, edit.text.toString(), send = true) }
            b.setNeutralButton(act.word("insert")) { _, _ -> act.fillField(id, edit.text.toString(), send = false) }
        }
        b.setNegativeButton(act.word("cancel"), null)

        val dialog = b.create()
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        dialog.useGameDirection()
        dialog.show()
        edit.requestFocus()
    }
}
