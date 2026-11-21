package com.islam.ikariamtouch

import android.content.Context
import android.widget.Toast

const val MATCH = -1
const val WRAP = -2

/** Ikariam-ish palette: dark wood and gold. */
const val GOLD = 0xFFF2D48A.toInt()
const val BAR_BG = 0xFF2B1D12.toInt()
const val BAR_BG_SEE_THROUGH = 0xB02B1D12.toInt()

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

fun Context.toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
