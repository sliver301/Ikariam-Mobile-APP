package com.islam.ikariamtouch

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.os.SystemClock
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import org.json.JSONObject
import java.io.ByteArrayInputStream

/**
 * The touch-controls tutorial: a saved copy of a town (the player's details replaced), drawn by the
 * app's own page script exactly like the game, while a drawn hand plays each gesture with captions.
 *
 * It is not the game: it lives in assets/tutorial/, nothing in it can reach a game server (only the
 * game's public pictures and styles load), and the player only watches: touches never reach it.
 * Back once says how to end it; Back again ends it at once.
 */
class Tutorial(private val activity: MainActivity, private val holder: FrameLayout) {

    companion object {
        private const val DIR = "tutorial"
        private const val END_WINDOW_MS = 2000L
        private val SAFE_FILE = Regex("\\.(png|jpe?g|gif|webp|svg|css|woff2?|ttf|otf)$", RegexOption.IGNORE_CASE)

        /** The saved town for this language (Arabic for Arabic servers, else English), or null without one. */
        fun assetFor(ctx: Context, lang: String): String? {
            val have = try {
                ctx.assets.list(DIR)?.toSet()
            } catch (e: Exception) {
                null
            } ?: return null
            val first = if (lang == "ar") "tut_ar.html" else "tut_en.html"
            return listOf(first, "tut_en.html", "tut_ar.html").firstOrNull { it in have }
        }
    }

    private var view: WebView? = null
    private var backAt = 0L

    val showing: Boolean get() = view != null

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    fun show(lang: String): Boolean {
        val name = assetFor(activity, lang) ?: return false
        close()
        val a = activity
        val cfg = a.tutorialConfig().put("tut", captions(lang))
        val script = try {
            "window.__ikmCfg=$cfg;\n" + a.assets.open("enhance.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            return false
        }
        val w = WebView(a)
        w.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true            // its own page in the app
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, false)     // never the player's login
        w.setBackgroundColor(Color.BLACK)
        w.isVerticalScrollBarEnabled = false
        w.isHorizontalScrollBarEnabled = false
        w.setOnTouchListener { _, _ -> true }                  // the player only watches
        w.setOnLongClickListener { true }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true   // it never goes anywhere

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url
                if (u.scheme == "file") return null
                if (request.method != "GET") return blocked()
                a.artResponse(u)?.let { return it }
                val host = u.host ?: return blocked()
                val game = host.endsWith(".gameforge.com") || host.endsWith(".gfsrv.net")
                return if (game && SAFE_FILE.containsMatchIn(u.path ?: "")) null else blocked()
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (view === this@Tutorial.view) view.evaluateJavascript(script, null)
            }
        }
        w.addJavascriptInterface(object {
            @JavascriptInterface
            fun done() {
                a.runOnUiThread { close() }
            }
        }, "IkmTutorial")
        holder.addView(w, FrameLayout.LayoutParams(MATCH, MATCH))
        view = w
        backAt = 0L
        w.loadUrl("file:///android_asset/$DIR/$name")
        return true
    }

    /** Back: the first press says how to end it, a second one soon after ends it. */
    fun back(): Boolean {
        if (view == null) return false
        val now = SystemClock.uptimeMillis()
        if (backAt != 0L && now - backAt < END_WINDOW_MS) {
            close()
        } else {
            backAt = now
            activity.toast(activity.word("tutorialEnd"))
        }
        return true
    }

    fun close(): Boolean {
        val w = view ?: return false
        view = null
        holder.removeView(w)
        w.stopLoading()
        w.destroy()
        return true
    }

    private fun blocked() = WebResourceResponse("text/plain", "utf-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    /** The captions in this language (English where there are none). */
    private fun captions(lang: String): JSONObject {
        return try {
            val all = JSONObject(activity.assets.open("$DIR/words.json").bufferedReader().use { it.readText() })
            all.optJSONObject(lang) ?: all.getJSONObject("en")
        } catch (e: Exception) {
            JSONObject()
        }
    }
}
