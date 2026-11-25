package com.islam.ikariamtouch

import android.content.Context
import android.os.LocaleList
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.webkit.WebView
import java.util.Locale

/** The game's WebView: a number box asks the keyboard for English digits (the game reads no others). */
class GameWebView(context: Context) : WebView(context) {

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs)
        outAttrs.askEnglishDigits()
        return connection
    }
}

/** For number and phone fields only; every other field keeps the player's own keyboard. */
fun EditorInfo.askEnglishDigits() {
    when (inputType and InputType.TYPE_MASK_CLASS) {
        InputType.TYPE_CLASS_NUMBER, InputType.TYPE_CLASS_PHONE -> {
            imeOptions = imeOptions or EditorInfo.IME_FLAG_FORCE_ASCII
            hintLocales = LocaleList(Locale.US)
        }
    }
}
