package com.islam.ikariamtouch

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Updates from the project's GitHub releases: once each time the app starts it asks GitHub for the
 * latest release, and if it is newer than this app it offers it. Yes downloads the APK and hands it
 * to Android's own installer (Android always shows its confirmation; the first time it also asks to
 * allow this app to install updates).
 *
 * The app's version is 1.<the game version it was made for>, e.g. 1.17.6.1 for Ikariam 17.6.1.
 */
object Updater {
    private const val LATEST = "https://api.github.com/repos/sliver301/Ikariam-Mobile-APP/releases/latest"

    /** This app's version, e.g. "1.17.6.1". */
    fun appVersion(ctx: Context): String = try {
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
    } catch (e: Exception) {
        ""
    }

    /** The Ikariam version this app was made for: its own version without the leading "1." */
    fun gameTarget(ctx: Context): String = appVersion(ctx).substringAfter('.', "")

    /** Is version `a` newer than `b` (dotted numbers)? */
    fun newer(a: String, b: String): Boolean {
        val x = a.split('.').map { it.toIntOrNull() ?: 0 }
        val y = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val p = x.getOrElse(i) { 0 }
            val q = y.getOrElse(i) { 0 }
            if (p != q) return p > q
        }
        return false
    }

    class Release(val version: String, val apkUrl: String)

    /** Asks GitHub (in the background); `found` runs on the UI thread with a newer release only. */
    fun check(a: Activity, found: (Release) -> Unit) {
        val mine = appVersion(a)
        Thread {
            try {
                val c = URL(LATEST).openConnection() as HttpURLConnection
                c.connectTimeout = 10_000
                c.readTimeout = 15_000
                c.setRequestProperty("Accept", "application/vnd.github+json")
                c.setRequestProperty("User-Agent", "IkariamMobile/$mine")
                if (c.responseCode != 200) return@Thread
                val j = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
                val tag = j.optString("tag_name").removePrefix("v").trim()
                val assets = j.optJSONArray("assets") ?: return@Thread
                var url: String? = null
                for (i in 0 until assets.length()) {
                    val o = assets.getJSONObject(i)
                    if (o.optString("name").endsWith(".apk")) url = o.optString("browser_download_url")
                }
                val apk = url ?: return@Thread
                if (tag.isNotEmpty() && newer(tag, mine) && apk.startsWith("https://github.com/")) {
                    a.runOnUiThread { found(Release(tag, apk)) }
                }
            } catch (e: Exception) {
                // no network or GitHub not answering: try again next start
            }
        }.start()
    }

    /** Android lets this app install updates (the player allows it once in Android's settings). */
    fun mayInstall(ctx: Context): Boolean = ctx.packageManager.canRequestPackageInstalls()

    fun askToAllow(a: Activity) {
        try {
            a.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}")))
        } catch (e: Exception) {
            // no such screen: Android will ask during the install instead
        }
    }

    /** Downloads the release and hands it to Android's installer; `failed` runs on the UI thread. */
    fun install(a: Activity, r: Release, failed: () -> Unit) {
        Thread {
            try {
                val file = File(a.cacheDir, "update.apk")
                var c = URL(r.apkUrl).openConnection() as HttpURLConnection
                c.instanceFollowRedirects = true
                c.connectTimeout = 15_000
                c.readTimeout = 60_000
                c.setRequestProperty("User-Agent", "IkariamMobile/${appVersion(a)}")
                // GitHub sends the file from another host: follow by hand if needed
                var hops = 0
                while (c.responseCode in 300..399 && hops++ < 5) {
                    val next = c.getHeaderField("Location") ?: break
                    c = URL(next).openConnection() as HttpURLConnection
                    c.connectTimeout = 15_000
                    c.readTimeout = 60_000
                }
                if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
                c.inputStream.use { i -> file.outputStream().use { i.copyTo(it) } }

                val installer = a.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                params.setAppPackageName(a.packageName)
                val id = installer.createSession(params)
                installer.openSession(id).use { s ->
                    s.openWrite("IkariamMobile.apk", 0, file.length()).use { out ->
                        file.inputStream().use { it.copyTo(out) }
                        s.fsync(out)
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                        (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                    val pi = PendingIntent.getBroadcast(a, 7, Intent(a, UpdateReceiver::class.java), flags)
                    s.commit(pi.intentSender)
                }
            } catch (e: Exception) {
                a.runOnUiThread { failed() }
            }
        }.start()
    }
}

/** Android's installer reports back: show its confirmation, or say it did not work. */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> {}
            else -> ctx.toast(ctx.word("updateFailed"))
        }
    }
}
