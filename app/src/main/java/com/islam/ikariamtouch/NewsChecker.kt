package com.islam.ikariamtouch

import android.Manifest
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
import android.webkit.CookieManager
import android.webkit.WebSettings
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.random.Random

/**
 * Background news alerts.
 *
 * Every 15-30 minutes (varying; Android may also delay it while the phone is idle) the app makes
 * the same small, read-only request the game page itself makes every minute while open
 * ("updateGlobalData", ~7 KB). It says which of the four advisors (cities, military, research,
 * diplomacy) has news. When one of them turns on, a notification is shown; tapping it opens the
 * app at that advisor. Nothing in the game is changed or clicked.
 */
class NewsChecker(private val ctx: Context) {

    companion object {
        const val JOB_ID = 4711
        const val CHANNEL = "game_news"
        const val CHANNEL_URGENT = "game_news_military"
        const val EXTRA_ADVISOR = "advisor"
        private const val STATE = "ikariam_news"

        /** Advisor key in the game's data -> notification title and text. */
        val ADVISORS = linkedMapOf(
            "military" to Pair("Military", "Something happened with your army: an attack, a battle or a troop movement. Tap to open the military advisor."),
            "cities" to Pair("Your towns", "News from your towns: a building finished, goods arrived or something changed. Tap to open."),
            "research" to Pair("Research", "Research news is waiting. Tap to open the research advisor."),
            "diplomacy" to Pair("Diplomacy", "New message or diplomacy news. Tap to open."),
        )

        /** True while the app is on screen: the game shows its own news then, so no notifications. */
        @Volatile var appVisible = false

        /** Next check in 15-30 minutes (random), only with a network connection. Survives reboots. */
        fun scheduleNext(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java) ?: return
            if (!Prefs(ctx).newsAlerts) {
                js.cancel(JOB_ID)
                return
            }
            val delay = Random.nextLong(15 * 60_000L, 30 * 60_000L)
            val info = JobInfo.Builder(JOB_ID, ComponentName(ctx, NewsJobService::class.java))
                .setMinimumLatency(delay)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
            try {
                js.schedule(info)
            } catch (e: Exception) {
                // never let a scheduling problem take the game down
            }
        }

        fun ensureChannels(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Game news", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Towns, research and diplomacy news from Ikariam"
                }
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_URGENT, "Military alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Attacks, battles and troop movements"
                }
            )
        }
    }

    private val state = ctx.getSharedPreferences(STATE, Context.MODE_PRIVATE)

    fun check() {
        val prefs = Prefs(ctx)
        if (!prefs.newsAlerts) return
        if (appVisible) return          // the open game page already polls and shows its news
        var base = prefs.serverUrl
        if (!base.endsWith("/")) base += "/"
        val cookie = CookieManager.getInstance().getCookie(base)
        if (cookie.isNullOrEmpty()) { loginNeeded(); return }

        val conn = (URL(base + "index.php?view=updateGlobalData&ajax=1").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 20_000
            readTimeout = 20_000
            setRequestProperty("Cookie", cookie)
            setRequestProperty("User-Agent", desktopUserAgent())
            setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
            setRequestProperty("X-Requested-With", "XMLHttpRequest")
        }
        try {
            val code = conn.responseCode
            if (code in 300..399 || code == 401 || code == 403) { loginNeeded(); return }
            if (code != 200) return                       // server trouble: just try again later
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val advisors = findAdvisors(body)
            if (advisors == null) { loginNeeded(); return }   // HTML instead of data: logged out
            state.edit().putBoolean("loginWarned", false).apply()

            val firstRun = !state.getBoolean("initialized", false)
            val edit = state.edit()
            for ((key, text) in ADVISORS) {
                val active = advisors.optJSONObject(key)?.optString("cssclass")?.contains("active") == true
                val was = state.getBoolean("active_$key", false)
                // Notify only when news appears (off -> on), never for news that was already there.
                if (active && !was && !firstRun && !appVisible) notify(key, text.first, text.second)
                edit.putBoolean("active_$key", active)
            }
            edit.putBoolean("initialized", true).apply()
        } finally {
            conn.disconnect()
        }
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

    private fun canNotify(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun notify(key: String, title: String, text: String) {
        if (!canNotify()) return
        ensureChannels(ctx)
        val open = Intent(ctx, MainActivity::class.java)
            .putExtra(EXTRA_ADVISOR, key)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(
            ctx, key.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(ctx, if (key == "military") CHANNEL_URGENT else CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(if (key == "military") Notification.CATEGORY_ALARM else Notification.CATEGORY_EVENT)
            .build()
        ctx.getSystemService(NotificationManager::class.java)?.notify(key.hashCode(), n)
    }

    /** Logged out (or the session expired): say so once, until a check works again. */
    private fun loginNeeded() {
        if (state.getBoolean("loginWarned", false)) return
        state.edit().putBoolean("loginWarned", true).apply()
        notify(
            "login", "Ikariam: log in again",
            "The game logged you out, so news alerts are paused. Open the app and log in to get them again."
        )
    }
}
