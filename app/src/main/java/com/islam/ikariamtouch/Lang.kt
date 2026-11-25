package com.islam.ikariamtouch

import android.content.Context
import org.json.JSONObject
import java.util.Locale

/**
 * The app speaks the language of the game server being played. Its words are in assets/i18n.txt.
 *
 * Ikariam's own codes are communities, not ISO languages: "ae" is Arabic, "ar" is Argentina
 * (Spanish), "dk" Danish, "gr" Greek and so on.
 */
object Lang {
    const val ENGLISH = "en"

    /** Every code in the game's language list (Options > language) -> a language of i18n.txt. */
    private val GAME_CODES = mapOf(
        "ae" to "ar", "ar" to "es", "bg" to "bg", "br" to "pt", "cz" to "cs", "de" to "de", "dk" to "da",
        "en" to "en", "es" to "es", "fi" to "fi", "fr" to "fr", "gr" to "el", "hu" to "hu", "il" to "he",
        "it" to "it", "lt" to "lt", "lv" to "lv", "mx" to "es", "nl" to "nl", "no" to "no", "pl" to "pl",
        "pt" to "pt", "ro" to "ro", "rs" to "sr", "ru" to "ru", "se" to "sv", "si" to "sl", "sk" to "sk",
        "tr" to "tr", "tw" to "zh", "us" to "en", "yu" to "sr",
    )

    /** Words the page script needs. */
    private val PAGE_WORDS = listOf(
        "more", "appSettings", "avatar", "shop", "editOrder", "saveOrder", "defaultOrder", "saving", "orderSaved", "orderFailed",
        "friends", "cityMenu", "cancel", "close", "switchServer", "social",
    )

    private val SERVER_CODE = Regex("^s\\d+-([a-z]+)\\.", RegexOption.IGNORE_CASE)

    @Volatile private var table: Map<String, Map<String, String>>? = null

    fun fromGameCode(code: String): String? = GAME_CODES[code.lowercase()]

    /** s72-en.ikariam.gameforge.com -> "en" */
    fun fromHost(host: String): String? =
        SERVER_CODE.find(host)?.let { fromGameCode(it.groupValues[1]) }

    /** Before any server was played: the phone's language, if the app has it. */
    fun fromPhone(): String = when (val code = Locale.getDefault().language) {
        "iw" -> "he"
        "nb", "nn" -> "no"
        "hr", "bs" -> "sr"
        else -> if (GAME_CODES.containsValue(code)) code else ENGLISH
    }

    fun rightToLeft(lang: String) = lang == "ar" || lang == "he"

    fun word(ctx: Context, lang: String, key: String): String {
        val t = load(ctx)
        return t[lang]?.get(key) ?: t[ENGLISH]?.get(key) ?: key
    }

    fun pageWords(ctx: Context, lang: String): JSONObject =
        JSONObject().apply { PAGE_WORDS.forEach { put(it, word(ctx, lang, it)) } }

    private fun load(ctx: Context): Map<String, Map<String, String>> {
        table?.let { return it }
        val out = HashMap<String, HashMap<String, String>>()
        var keys = emptyList<String>()
        ctx.applicationContext.assets.open("i18n.txt").bufferedReader().useLines { lines ->
            for (line in lines) {
                if (line.isBlank() || line.startsWith("#")) continue
                val cells = line.split('|')
                if (cells[0] == "@") {
                    keys = cells.drop(1)
                    continue
                }
                val words = out.getOrPut(cells[0]) { HashMap() }
                keys.zip(cells.drop(1)).forEach { (k, v) -> if (v.isNotBlank()) words[k] = v }
            }
        }
        table = out
        return out
    }
}
