package com.islam.ikariamtouch

import android.app.AlertDialog
import android.content.Context
import android.view.View
import android.widget.Toast

const val MATCH = -1
const val WRAP = -2

/** Ikariam-ish palette: dark wood and gold. */
const val GOLD = 0xFFF2D48A.toInt()
const val BAR_BG = 0xFF2B1D12.toInt()
const val BAR_BG_SEE_THROUGH = 0xB02B1D12.toInt()

/** One of the app's own words, in the language of the server being played. */
fun Context.word(key: String): String = Lang.word(this, Prefs(this).language, key)

/**
 * Arabic and Hebrew dialogs read right to left, the others left to right, whatever the phone's own
 * language is. Must run before show(): a window without a direction of its own gets the phone's
 * once it is on screen.
 */
fun AlertDialog.useGameDirection() {
    create()      // builds the content without showing it
    window?.decorView?.layoutDirection =
        if (Lang.rightToLeft(Prefs(context).language)) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
}

fun AlertDialog.Builder.showLocalized(): AlertDialog = create().also {
    it.useGameDirection()
    it.show()
}

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

fun Context.toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
