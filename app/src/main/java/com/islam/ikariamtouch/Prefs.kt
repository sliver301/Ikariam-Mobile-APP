package com.islam.ikariamtouch

import android.content.Context

/** All user settings, stored on the phone. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("ikariam_touch", Context.MODE_PRIVATE)

    /** Game server opened at start-up. */
    var serverUrl: String
        get() = sp.getString("serverUrl", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(v) { sp.edit().putString("serverUrl", v).apply() }

    /** Width in CSS pixels the game is laid out at. Smaller = everything bigger on screen. */
    var uiWidth: Int
        get() = sp.getInt("uiWidth", 1100)
        set(v) { sp.edit().putInt("uiWidth", v).apply() }

    /** "landscape", "auto" or "portrait". */
    var orientation: String
        get() = sp.getString("orientation", "portrait") ?: "portrait"
        set(v) { sp.edit().putString("orientation", v).apply() }

    var fullscreen: Boolean
        get() = sp.getBoolean("fullscreen", true)
        set(v) { sp.edit().putBoolean("fullscreen", v).apply() }

    var keepScreenOn: Boolean
        get() = sp.getBoolean("keepScreenOn", true)
        set(v) { sp.edit().putBoolean("keepScreenOn", v).apply() }

    /** Turns finger drags into mouse drags and long-press into hover. */
    var touchFix: Boolean
        get() = sp.getBoolean("touchFix", true)
        set(v) { sp.edit().putBoolean("touchFix", v).apply() }

    /** Opens a big native editor when a game text box is tapped. */
    var composer: Boolean
        get() = sp.getBoolean("composer", true)
        set(v) { sp.edit().putBoolean("composer", v).apply() }

    /** Identify as desktop Chrome so the full game is served. */
    var desktopMode: Boolean
        get() = sp.getBoolean("desktopMode", true)
        set(v) { sp.edit().putBoolean("desktopMode", v).apply() }

    var barHidden: Boolean
        get() = sp.getBoolean("barHidden", false)
        set(v) { sp.edit().putBoolean("barHidden", v).apply() }

    companion object {
        const val DEFAULT_SERVER = "https://s66-ae.ikariam.gameforge.com/"
        const val LOBBY = "https://lobby.ikariam.gameforge.com/"
    }
}
