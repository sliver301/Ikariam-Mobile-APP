package com.islam.ikariamtouch

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.text.Html
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebSettings
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.io.File
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * News alerts, as close to instant as the game allows (it pushes nothing, so it has to be asked).
 *
 * Once a minute, as often as the open game page itself, the app makes that page's small read-only
 * request ("updateGlobalData", ~2 KB) for each server whose login it still has. It says which of the
 * four advisors (cities, military, research, diplomacy) has news. The server on screen is not asked:
 * its page reports by itself. An alarm wakes the phone for it, so nothing keeps running in between.
 * While the phone sleeps deeply Android only allows that once the player has let the app run
 * unrestricted (battery); until then it can be several minutes.
 *
 * It never logs in, so it cannot end a session on a PC. Nothing in the game is changed or clicked.
 *
 * When an advisor has news and the game is not on screen, the app also opens that advisor's page (as the
 * player would) to put its newest lines in the notification, with the advisor's picture. The game counts
 * them as read then, so the app keeps every line it read on the player's behalf ("unseen", per server
 * and advisor) until the player has looked at that advisor in the app: until then the page shows the
 * advisor glowing and those lines highlighted, as if the app had never looked.
 */
class NewsChecker(private val ctx: Context) {

    companion object {
        const val EXTRA_ADVISOR = "advisor"
        const val EXTRA_HOST = "host"
        const val EXTRA_KEY = "key"

        /** EXTRA_ADVISOR values that are not advisors. */
        const val LOGIN = "login"
        const val RECONNECT = "reconnect"

        private const val TAG = "IkmNews"
        private const val STATE = "ikariam_news"
        private const val JOB_ID = 4711
        private const val ALARM_ID = 4712

        // new ids: a channel's sound and vibration cannot be changed once it exists
        private const val CHANNEL = "game_news_3"
        private const val CHANNEL_URGENT = "game_attack_3"
        private val OLD_CHANNELS = listOf("game_news", "game_news_military", "game_news_2", "game_attack_2")
        private val BUZZ = longArrayOf(0, 250, 150, 250)
        private val BUZZ_URGENT = longArrayOf(0, 700, 250, 700, 250, 700, 250, 700)

        private const val EVERY_MS = 60_000L
        private const val BACKUP_MS = 15 * 60_000L          // Android's shortest repeating job
        private const val LOGGED_OUT_MS = 10 * 60_000L      // a server logged out is asked less often
        private const val BUSY_MS = 5 * 60_000L             // a server in trouble is left alone a while
        private const val LIVE_MS = 30_000L
        private const val ANSWER_MS = 4_000
        private const val ALL_ANSWERS_MS = 9_000L           // a woken receiver has about 10 s

        /** Advisor key in the game's data -> the word for it (i18n.txt). */
        val ADVISORS = linkedMapOf(
            "military" to "military",
            "cities" to "towns",
            "research" to "research",
            "diplomacy" to "diplomacy",
        )

        /** True while the app is on screen. */
        @Volatile var appVisible = false
        @Volatile private var nextAt = 0L
        private val checking = AtomicBoolean(false)

        /** host -> when its game page last said it is running on screen. */
        private val liveAt = ConcurrentHashMap<String, Long>()

        /** host -> when its game page last reported the advisors. */
        private val seenAt = ConcurrentHashMap<String, Long>()

        private fun now() = SystemClock.elapsedRealtime()

        private fun stateOf(ctx: Context, host: String) =
            ctx.getSharedPreferences(STATE + "_" + host, Context.MODE_PRIVATE)

        fun pageAlive(host: String) {
            liveAt[host] = now()
        }

        /** Saved logins were cleared by the player: no need to say "logged out" for each server. */
        fun loginsCleared(ctx: Context) {
            for (host in Prefs(ctx).knownServers) stateOf(ctx, host).edit().putBoolean("loginWarned", true).apply()
        }

        /** The game's page for each advisor, and its picture. */
        private val VIEWS = mapOf(
            "cities" to "tradeAdvisor", "military" to "militaryAdvisor",
            "research" to "researchAdvisor", "diplomacy" to "diplomacyAdvisor",
        )
        private val PICTURES = mapOf("cities" to "mayor", "military" to "general", "research" to "scientist", "diplomacy" to "diplomat")
        private const val UNSEEN_MAX = 20
        private val DATE = Regex("""^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?)?$""")
        private const val KNOWN_MAX = 60

        /** Lines read by the app that the player has not seen yet, per advisor: {"cities": [{"k":..,"t":..}], ...}. */
        fun unseen(ctx: Context, host: String): JSONObject {
            val state = stateOf(ctx, host)
            val out = JSONObject()
            for (key in ADVISORS.keys) {
                val list = try { JSONArray(state.getString("unseen_$key", "[]")) } catch (e: Exception) { JSONArray() }
                if (list.length() > 0) out.put(key, list)
            }
            return out
        }

        /** The player looked at that advisor in the app: its lines are seen, its notification goes. */
        fun clearUnseen(ctx: Context, host: String, key: String) {
            if (key !in ADVISORS) return
            stateOf(ctx, host).edit().remove("unseen_$key").apply()
            ctx.getSystemService(NotificationManager::class.java)?.cancel("$host/$key".hashCode())
        }

        /** Android lets it check each minute even while the phone sleeps. */
        fun unrestricted(ctx: Context): Boolean =
            ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) == true

        // ------------------------------------------------------------ when

        private fun alarmIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
            ctx, ALARM_ID, Intent(ctx, NewsReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        /** Alerts on: the minute alarm plus a slow job that re-arms it if it was ever lost. Off: neither. */
        fun start(ctx: Context) {
            val jobs = ctx.getSystemService(JobScheduler::class.java)
            if (!Prefs(ctx).newsAlerts) {
                jobs?.cancel(JOB_ID)
                ctx.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(ctx))
                nextAt = 0
                return
            }
            keepGoing(ctx)
            if (jobs == null || jobs.getPendingJob(JOB_ID)?.isPeriodic == true) return
            val backup = JobInfo.Builder(JOB_ID, ComponentName(ctx, NewsJobService::class.java))
                .setPeriodic(BACKUP_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
            try {
                jobs.schedule(backup)
            } catch (e: Exception) {
                Log.i(TAG, "backup job refused (${e.javaClass.simpleName})")     // never take the game down
            }
        }

        /** Arms the alarm unless one is already due within the minute (so it is never pushed back). */
        fun keepGoing(ctx: Context) {
            if (nextAt - now() in 0..EVERY_MS) return
            armAlarm(ctx)
        }

        fun armAlarm(ctx: Context) {
            if (!Prefs(ctx).newsAlerts) return
            val am = ctx.getSystemService(AlarmManager::class.java) ?: return
            val at = now() + EVERY_MS
            val pi = alarmIntent(ctx)
            try {
                // exact needs "unrestricted"; otherwise Android may add up to a minute, more in deep sleep
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
                }
                nextAt = at
            } catch (e: Exception) {
                Log.i(TAG, "alarm refused (${e.javaClass.simpleName})")
            }
        }

        // ------------------------------------------------------------ channels

        fun ensureChannels(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
            OLD_CHANNELS.forEach { nm.deleteNotificationChannel(it) }
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Ikariam", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "${ctx.word("towns")}, ${ctx.word("research")}, ${ctx.word("diplomacy")}"
                    setSound(null, null)        // vibration only
                    vibrationPattern = BUZZ
                    enableVibration(true)
                }
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_URGENT, ctx.word("military"), NotificationManager.IMPORTANCE_HIGH).apply {
                    description = ctx.word("attack")
                    setSound(null, null)        // vibration only
                    vibrationPattern = BUZZ_URGENT
                    enableVibration(true)
                }
            )
        }
    }

    private val prefs = Prefs(ctx)
    private val notifications = ctx.getSystemService(NotificationManager::class.java)

    // ---------------------------------------------------------------- asking

    /** Asks every server at once; returns within about 9 seconds. */
    fun check() {
        if (!prefs.newsAlerts) return
        if (!checking.compareAndSet(false, true)) return
        Log.i(TAG, "check")
        try {
            val workers = prefs.knownServers.map { host ->
                thread {
                    try {
                        checkServer(host)
                    } catch (e: Exception) {
                        Log.i(TAG, "$host: no answer (${e.javaClass.simpleName})")
                    }
                }
            }
            val until = now() + ALL_ANSWERS_MS
            for (w in workers) w.join((until - now()).coerceAtLeast(1))
        } finally {
            checking.set(false)
        }
    }

    private fun onScreen(host: String): Boolean {
        val last = liveAt[host] ?: return false
        return appVisible && now() - last < LIVE_MS
    }

    private fun checkServer(host: String) {
        if (onScreen(host)) {                            // its page is asking already
            Log.i(TAG, "$host: on screen")
            return
        }
        val state = stateOf(ctx, host)                   // each server has its own "what was already told"
        val clock = System.currentTimeMillis()
        if (clock < state.getLong("waitUntil", 0)) return
        if (state.getBoolean("loginWarned", false) && clock - state.getLong("askedAt", 0) < LOGGED_OUT_MS) return
        state.edit().putLong("askedAt", clock).apply()

        val asked = now()
        val base = "https://$host/"
        val cookie = CookieManager.getInstance().getCookie(base)
        if (cookie.isNullOrEmpty()) { loginNeeded(host); return }

        val conn = (URL(base + "index.php?view=updateGlobalData&ajax=1").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = ANSWER_MS
            readTimeout = ANSWER_MS
            setRequestProperty("Cookie", cookie)
            setRequestProperty("User-Agent", desktopUserAgent())
            setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
            setRequestProperty("X-Requested-With", "XMLHttpRequest")
        }
        try {
            val code = conn.responseCode
            if (code in 300..399 || code == 401) { loginNeeded(host); return }
            if (code != 200) {
                // too many requests, refused or server trouble: back off instead of insisting
                state.edit().putLong("waitUntil", clock + BUSY_MS).apply()
                Log.i(TAG, "$host: HTTP $code, waiting")
                return
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val advisors = findAdvisors(body)
            if (advisors == null) { loginNeeded(host); return }        // HTML instead of data: logged out
            // the page reported while this was on its way: that is newer
            if ((seenAt[host] ?: 0) > asked) return

            val css = ADVISORS.keys.associateWith { advisors.optJSONObject(it)?.optString("cssclass").orEmpty() }
            val tell = mutableListOf<Pair<String, Boolean>>()
            Log.i(TAG, "$host:${update(host, css, fromPage = false, tell = tell)}")
            for ((key, alert) in tell) tellNews(host, key, alert, cookie, golden = css[key].orEmpty().contains("premium"))
        } finally {
            conn.disconnect()
        }
    }

    /**
     * The game page on screen, whenever one of its advisors changes. News read in the game stops
     * counting as told, so the next news is announced; new news is announced at once.
     */
    fun seen(host: String, advisors: JSONObject) {
        seenAt[host] = now()
        liveAt[host] = now()
        update(host, ADVISORS.keys.filter { advisors.has(it) }.associateWith { advisors.optString(it) }, fromPage = true)
    }

    /** Compares with what was told, announces what is new; returns a line for the log. */
    private fun update(
        host: String, css: Map<String, String>, fromPage: Boolean,
        tell: MutableList<Pair<String, Boolean>>? = null,
    ): String = synchronized(seenAt) {
        val state = stateOf(ctx, host)
        val known = state.getBoolean("initialized", false)
        val lang = prefs.languageOf(host)
        val report = StringBuilder()
        val edit = state.edit().putBoolean("loginWarned", false).putBoolean("initialized", true)
        for ((key, value) in css) {
            // "normalactive" / "premiumactive" = news, "normalalert" / "premiumalert" = red (an attack)
            val alert = value.contains("alert")
            val active = alert || value.contains("active")
            val wasAlert = state.getBoolean("alert_$key", false)
            val changed = (active && !state.getBoolean("active_$key", false)) || (alert && !wasAlert)
            // A server never read before: what the page shows is seen, what a check finds is not.
            val fresh = changed && (known || !fromPage)
            if (fresh && prefs.newsAlerts && tell != null) {
                tell += key to alert                                     // told with its lines, below
            } else if (fresh && prefs.newsAlerts) {
                val title = "${prefs.serverTitle(host)} · ${Lang.word(ctx, lang, ADVISORS.getValue(key))}"
                notify(host, key, title, Lang.word(ctx, lang, if (alert) "attack" else "news"), urgent = alert)
            } else if (fromPage && !active && !state.contains("unseen_$key")) {
                notifications?.cancel("$host/$key".hashCode())       // read in the game
            }
            report.append(" $key=${if (alert) "red" else if (active) "news" else "-"}${if (fresh) "!" else ""}")
            edit.putBoolean("active_$key", active).putBoolean("alert_$key", alert)
        }
        edit.apply()
        if (fromPage) notifications?.cancel("$host/$LOGIN".hashCode())
        report.toString()
    }

    /** The game's reply is a list of [command, data] pairs; the advisors sit somewhere inside it. */
    private fun findAdvisors(body: String): JSONObject? {
        val root: Any = try {
            val t = body.trim()
            if (t.startsWith("[")) JSONArray(t) else JSONObject(t)
        } catch (e: Exception) {
            return null
        }
        return search(root, 0)
    }

    private fun search(node: Any?, depth: Int): JSONObject? {
        if (depth > 6) return null
        when (node) {
            is JSONObject -> {
                node.optJSONObject("advisors")?.let { if (it.has("military") || it.has("cities")) return it }
                val keys = node.keys()
                while (keys.hasNext()) search(node.opt(keys.next()), depth + 1)?.let { return it }
            }
            is JSONArray -> for (i in 0 until node.length()) search(node.opt(i), depth + 1)?.let { return it }
        }
        return null
    }

    private fun desktopUserAgent(): String {
        val def = try { WebSettings.getDefaultUserAgent(ctx) } catch (e: Exception) { "" }
        val chrome = Regex("Chrome/[\\d.]+").find(def)?.value ?: "Chrome/131.0.0.0"
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) $chrome Safari/537.36"
    }

    // ---------------------------------------------------------------- telling

    private fun canNotify(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Opens the app; `what` is an advisor, LOGIN (just open) or RECONNECT. */
    private fun opens(host: String, what: String): PendingIntent {
        val open = Intent(ctx, MainActivity::class.java)
            .putExtra(EXTRA_ADVISOR, what)
            .putExtra(EXTRA_HOST, host)
            .putExtra(EXTRA_KEY, prefs.intentKey)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            ctx, "$host/$what".hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun notify(
        host: String, key: String, title: String, text: String, urgent: Boolean,
        icon: Bitmap? = null, lines: List<String> = emptyList(),
    ) {
        if (!canNotify()) return
        ensureChannels(ctx)
        val builder = Notification.Builder(ctx, if (urgent) CHANNEL_URGENT else CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(
                if (lines.size > 1) Notification.InboxStyle().also { st -> lines.take(7).forEach { st.addLine(it) } }
                    .setSummaryText(if (lines.size > 7) "+${lines.size - 7}" else null)
                else Notification.BigTextStyle().bigText(text)
            )
            .setContentIntent(opens(host, key))
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setAutoCancel(true)
            .setCategory(if (urgent) Notification.CATEGORY_ALARM else Notification.CATEGORY_EVENT)
        if (icon != null) builder.setLargeIcon(icon)
        if (lines.size > 1) builder.setNumber(lines.size)
        if (key == LOGIN) {
            // one tap logs in here again (which ends the session on the PC, so it is the player's tap)
            val label = Lang.word(ctx, prefs.languageOf(host), "reconnect")
            builder.addAction(Notification.Action.Builder(null, label, opens(host, RECONNECT)).build())
            builder.setGroup("$host/$LOGIN")     // never folded in with the others, which hides the button
        }
        notifications?.notify("$host/$key".hashCode(), builder.build())
    }

    /**
     * Opens the advisor's page (as the player would) and tells its new lines: every line the app has
     * read since the player last looked at that advisor, newest first. Without lines (a page that has
     * none, or no answer), the short "news" alert as before.
     */
    private fun tellNews(host: String, key: String, alert: Boolean, cookie: String, golden: Boolean) {
        val lang = prefs.languageOf(host)
        val title = "${prefs.serverTitle(host)} · ${Lang.word(ctx, lang, ADVISORS.getValue(key))}"
        val short = Lang.word(ctx, lang, if (alert) "attack" else "news")
        val lines = try { readNews(host, key, cookie) } catch (e: Exception) {
            Log.i(TAG, "$host/$key: no lines (${e.javaClass.simpleName})"); emptyList()
        }
        val icon = try { advisorPicture(host, key, lang, golden) } catch (e: Exception) { null }
        if (lines.isEmpty()) {
            notify(host, key, title, short, urgent = alert, icon = icon)
            return
        }
        notify(host, key, title, lines.first(), urgent = alert, icon = icon, lines = lines)
    }

    /** The advisor page's new lines, added to what is still unseen; returns all unseen lines' text. */
    private fun readNews(host: String, key: String, cookie: String): List<String> {
        val view = VIEWS[key] ?: return emptyList()
        val conn = (URL("https://$host/index.php?view=$view&ajax=1").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = ANSWER_MS
            readTimeout = ANSWER_MS
            setRequestProperty("Cookie", cookie)
            setRequestProperty("User-Agent", desktopUserAgent())
            setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
            setRequestProperty("X-Requested-With", "XMLHttpRequest")
        }
        val body = try {
            if (conn.responseCode != 200) return emptyList()
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
        val root = try { JSONArray(body.trim()) } catch (e: Exception) { return emptyList() }
        var html = ""
        fun walk(n: Any?) {
            when (n) {
                is String -> if (n.length > html.length && n.contains("<tr")) html = n
                is JSONArray -> for (i in 0 until n.length()) walk(n.opt(i))
                is JSONObject -> n.keys().forEach { walk(n.opt(it)) }
            }
        }
        walk(root)
        val rows = rowsOf(html)
        val state = stateOf(ctx, host)
        val known = try { JSONArray(state.getString("rows_$key", "[]")) } catch (e: Exception) { JSONArray() }
        val knownSet = (0 until known.length()).map { known.optString(it) }.toSet()
        // new = what the game highlights (its unread lines); else what was not on the page last time
        // (the first time only the newest line)
        val marked = rows.filter { it.third }
        val fresh = when {
            marked.isNotEmpty() -> marked.take(UNSEEN_MAX)
            knownSet.isEmpty() -> rows.take(1)
            else -> rows.filter { it.first !in knownSet }.take(6)
        }
        val unseen = try { JSONArray(state.getString("unseen_$key", "[]")) } catch (e: Exception) { JSONArray() }
        val have = (0 until unseen.length()).map { unseen.optJSONObject(it)?.optString("k") }.toSet()
        val merged = JSONArray()
        fresh.filter { it.first !in have }.forEach { merged.put(JSONObject().put("k", it.first).put("t", it.second)) }
        for (i in 0 until unseen.length()) if (merged.length() < UNSEEN_MAX) merged.put(unseen.opt(i))
        val keys = JSONArray()
        (rows.map { it.first } + knownSet).distinct().take(KNOWN_MAX).forEach { keys.put(it) }
        state.edit().putString("rows_$key", keys.toString())
            .apply { if (merged.length() > 0) putString("unseen_$key", merged.toString()) }.apply()
        return (0 until merged.length()).mapNotNull { merged.optJSONObject(it)?.optString("t") }.filter { it.isNotEmpty() }
    }

    /**
     * The table rows of an advisor page: (key, text, highlighted = unread in the game). The page script
     * builds the same key from the same row.
     */
    private fun rowsOf(html: String): List<Triple<String, String, Boolean>> {
        val out = mutableListOf<Triple<String, String, Boolean>>()
        val dot = setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)
        Regex("<tr([^>]*)>(.*?)</tr>", dot).findAll(html).forEach { m ->
            if (m.groupValues[1].contains("account")) return@forEach
            val cells = Regex("<td[^>]*>(.*?)</td>", dot).findAll(m.groupValues[2]).map { cellText(it.groupValues[1]) }.toList()
            if (cells.size < 2) return@forEach
            // what the notification says: the town and the news itself (no date)
            val text = cells.filter { it.isNotEmpty() && !DATE.matches(it) }.joinToString(" · ")
            if (text.isNotBlank()) out += Triple(cells.joinToString("|"), text, m.groupValues[1].contains("highlight"))
        }
        return out
    }

    private fun cellText(h: String): String {
        val bare = h.replace(Regex("<(script|style)[^>]*>.*?</\\1>", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE)), "")
            .replace(Regex("<[^>]+>"), "")        // as the page's textContent: no space for a tag
        val text = if (bare.contains('&')) Html.fromHtml(bare, Html.FROM_HTML_MODE_LEGACY).toString() else bare
        return text.replace('\u00a0', ' ').replace(Regex("\\s+"), " ").trim()
    }

    /** The advisor's own picture as the player sees it (golden with a premium account), with its news glow. */
    private fun advisorPicture(host: String, key: String, lang: String, golden: Boolean): Bitmap? {
        val name = (PICTURES[key] ?: return null) + (if (golden) "_premium" else "") + "_active.png"
        val rtl = lang in setOf("ar", "he", "fa")
        val file = File(ctx.cacheDir, "advisor_" + (if (rtl) "rtl_" else "") + name)
        if (!file.exists()) {
            val paths = if (rtl) listOf("cdn/all/both/rtl/layout/advisors/") else listOf("cdn/all/both/layout/advisors/", "cdn/all/both/rtl/layout/advisors/")
            for (path in paths) {
                val conn = URL("https://$host/$path$name").openConnection() as HttpURLConnection
                conn.connectTimeout = ANSWER_MS
                conn.readTimeout = ANSWER_MS
                try {
                    if (conn.responseCode == 200 && conn.contentType.orEmpty().startsWith("image")) {
                        file.writeBytes(conn.inputStream.use { it.readBytes() })
                        break
                    }
                } finally {
                    conn.disconnect()
                }
            }
        }
        return if (file.exists()) BitmapFactory.decodeFile(file.path) else null
    }

    /** Logged out (usually: logged in on a PC). Said once per server, until it works again. */
    private fun loginNeeded(host: String) {
        val state = stateOf(ctx, host)
        Log.i(TAG, "$host: logged out")
        if (state.getBoolean("loginWarned", false)) return
        // a server never read from this phone has no alerts to pause
        val tell = host == prefs.serverHost || state.getBoolean("initialized", false)
        state.edit().putBoolean("loginWarned", true).apply()     // from now on asked only every 10 minutes
        if (!tell) return
        val lang = prefs.languageOf(host)
        notify(
            host, LOGIN,
            "${prefs.serverTitle(host)} · ${Lang.word(ctx, lang, "loginTitle")}",
            Lang.word(ctx, lang, "loginText"),
            urgent = false,
        )
    }
}
