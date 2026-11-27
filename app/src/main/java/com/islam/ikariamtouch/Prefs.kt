package com.islam.ikariamtouch

import android.content.Context
import java.util.UUID

/** All user settings, stored on the phone. */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("ikariam_touch", Context.MODE_PRIVATE)

    /**
     * The server last played ("https://s72-en.ikariam.gameforge.com/"), remembered by itself; empty
     * until then. The app opens here next time and the news alerts check this one.
     */
    var serverUrl: String
        get() = sp.getString("serverUrl", "") ?: ""
        set(v) { sp.edit().putString("serverUrl", v).apply() }

    /** What to open: the last server (the game sends it on to the lobby when logged out), or the lobby. */
    val startUrl: String
        get() = serverUrl.ifEmpty { LOBBY }

    val serverHost: String
        get() = serverUrl.substringAfter("://").substringBefore("/")

    /** A server's language: what its page last said (players can change it in Options), else the server's own. */
    fun languageOf(host: String): String =
        sp.getString("lang:$host", null) ?: Lang.fromHost(host) ?: Lang.fromPhone()

    fun setLanguage(host: String, lang: String) { sp.edit().putString("lang:$host", lang).apply() }

    fun serverName(host: String): String = sp.getString("name:$host", "") ?: ""

    fun setServerName(host: String, name: String) { sp.edit().putString("name:$host", name).apply() }

    /** Every server played on this phone (for Switch server and the news alerts). */
    val knownServers: List<String>
        get() = sp.all.keys.filter { it.startsWith("lang:") || it.startsWith("name:") }
            .map { it.substringAfter(":") }
            .plus(serverHost)
            .filter { MainActivity.GAME_HOST.matches(it) }
            .distinct()
            .sorted()

    /** "Okeanos", or "s72-en" until its name is known. */
    fun serverTitle(host: String): String = serverName(host).ifEmpty { host.substringBefore(".") }

    /** Proves that "open this server" really comes from the app's own notification. */
    val intentKey: String
        get() = sp.getString("intentKey", null)
            ?: UUID.randomUUID().toString().also { sp.edit().putString("intentKey", it).apply() }

    /** The app's language: that of the server being played. */
    val language: String
        get() = languageOf(serverHost)

    /** The city menu retracts by itself once something is picked or the player touches elsewhere. */
    var cityMenuAuto: Boolean
        get() = sp.getBoolean("cityMenuAuto", true)
        set(v) { sp.edit().putBoolean("cityMenuAuto", v).apply() }

    /** The two side menus of the thumb layout, as the player left them. */
    var cityMenuOpen: Boolean
        get() = sp.getBoolean("cityMenuOpen", false)
        set(v) { sp.edit().putBoolean("cityMenuOpen", v).apply() }

    var friendsOpen: Boolean
        get() = sp.getBoolean("friendsOpen", false)
        set(v) { sp.edit().putBoolean("friendsOpen", v).apply() }

    /** Width in CSS pixels the game is laid out at. Smaller = everything bigger on screen. */
    var uiWidth: Int
        get() = sp.getInt("uiWidth", 1100)
        set(v) { sp.edit().putInt("uiWidth", v).apply() }

    /** "landscape", "auto" or "portrait". */
    var orientation: String
        get() = sp.getString("orientation", "portrait") ?: "portrait"
        set(v) { sp.edit().putString("orientation", v).apply() }

    /** Portrait layout: "thumb" (default: controls at the bottom) or "classic" (game panel on top). */
    var layout: String
        get() = sp.getString("layout", LAYOUT_THUMB) ?: LAYOUT_THUMB
        set(v) { sp.edit().putString("layout", v).apply() }

    /**
     * Hide the phone's status bar. Off by default: the camera hole covered the resources.
     * (New key: the old "fullscreen" = on was saved on every phone that ever pressed Save.)
     */
    var fullscreen: Boolean
        get() = sp.getBoolean("hideStatusBar", false)
        set(v) { sp.edit().putBoolean("hideStatusBar", v).apply() }

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

    /** Check for advisor news every minute, shown as notifications. */
    var newsAlerts: Boolean
        get() = sp.getBoolean("newsAlerts", true)
        set(v) { sp.edit().putBoolean("newsAlerts", v).apply() }

    /** The notification permission was already asked for once (Android 13+). */
    var askedNotifyPermission: Boolean
        get() = sp.getBoolean("askedNotifyPermission", false)
        set(v) { sp.edit().putBoolean("askedNotifyPermission", v).apply() }

    /** Android's "let it run unrestricted" question (checks while the phone sleeps) was shown once. */
    var askedBattery: Boolean
        get() = sp.getBoolean("askedBattery", false)
        set(v) { sp.edit().putBoolean("askedBattery", v).apply() }

    /** The live game version the player was last told about (told once per version). */
    var warnedGameVersion: String
        get() = sp.getString("warnedGameVersion", "") ?: ""
        set(v) { sp.edit().putString("warnedGameVersion", v).apply() }

    /** The town wheel's notches can be felt (small ones between towns, a firmer one on each town). */
    var wheelBuzz: Boolean
        get() = sp.getBoolean("wheelBuzz", true)
        set(v) { sp.edit().putBoolean("wheelBuzz", v).apply() }

    /** The touch-controls tutorial was offered once (after install or the update that brought it). */
    var tutorialOffered: Boolean
        get() = sp.getBoolean("tutorialOffered", false)
        set(v) { sp.edit().putBoolean("tutorialOffered", v).apply() }

    var barHidden: Boolean
        get() = sp.getBoolean("barHidden", false)
        set(v) { sp.edit().putBoolean("barHidden", v).apply() }

    companion object {
        const val LAYOUT_THUMB = "thumb"
        const val LAYOUT_CLASSIC = "classic"
        const val LOBBY = "https://lobby.ikariam.gameforge.com/"
    }
}
