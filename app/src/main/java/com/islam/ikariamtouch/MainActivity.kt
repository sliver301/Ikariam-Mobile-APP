package com.islam.ikariamtouch

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID
import kotlin.concurrent.thread

/**
 * A dedicated browser for Ikariam. It shows the real game site unchanged and makes it
 * phone-friendly. Nothing here acts on its own: every game action comes from the player's
 * own tap.
 *
 * Back button: closes the game window / pop-up on top. With nothing open, it shows the
 * app menu (settings, reload, lobby, exit) instead of leaving the game.
 */
class MainActivity : Activity() {

    lateinit var prefs: Prefs
    private lateinit var root: FrameLayout
    private lateinit var webHolder: FrameLayout
    private lateinit var tutorial: Tutorial
    lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorView: LinearLayout
    private lateinit var errorText: TextView
    private lateinit var retryButton: Button

    private var enhanceJs = ""
    private var onGameServer = false
    private val main = Handler(Looper.getMainLooper())

    // ------------------------------------------------------------------ lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        enhanceJs = assets.open("enhance.js").bufferedReader().use { it.readText() }
        // Debug builds can be inspected from a PC with chrome://inspect.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        buildUi()
        tutorial = Tutorial(this, webHolder)
        // the old video tutorial's copies (it is a saved page now)
        cacheDir.listFiles()?.filter { it.name.startsWith("tutorial_") && it.name.endsWith(".mp4") }?.forEach { it.delete() }
        applyWindowPrefs()
        web.loadUrl(prefs.startUrl)

        NewsChecker.ensureChannels(this)
        NewsChecker.start(this)
        if (prefs.newsAlerts) askNotifyPermission(false)
        // (reopened from recent apps the old notification's intent comes along again: not a new tap)
        val fromRecents = (intent?.flags ?: 0) and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        if (savedInstanceState == null && !fromRecents) handleNotificationIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleNotificationIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        NewsChecker.appVisible = true
        NewsChecker.start(this)               // exact from now on, if the player has just allowed it
        main.removeCallbacks(watchdog)
        main.postDelayed(watchdog, WATCH_MS)
    }

    override fun onPause() {
        tutorial.close()
        CookieManager.getInstance().flush()   // keep the login across restarts
        web.onPause()
        main.removeCallbacks(watchdog)
        NewsChecker.appVisible = false
        NewsChecker.keepGoing(this)           // a check within the minute (if enabled)
        super.onPause()
    }

    override fun onDestroy() {
        main.removeCallbacks(openAdvisorTry)
        main.removeCallbacksAndMessages(null)
        opener?.destroy()
        web.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applySystemBars()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            handleBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // ------------------------------------------------------------------ layout

    private fun buildUi() {
        root = FrameLayout(this).apply {
            setBackgroundColor(PARCHMENT)
            // Status bar shown: the game sits between the phone's bars (the keyboard still just covers it).
            setOnApplyWindowInsetsListener { v, insets ->
                if (prefs.fullscreen) {
                    v.setPadding(0, 0, 0, 0)
                    insets
                } else {
                    val bars = insets.getInsets(
                        WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars() or WindowInsets.Type.displayCutout()
                    )
                    v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                    insets.inset(bars.left, bars.top, bars.right, bars.bottom)
                }
            }
        }
        webHolder = FrameLayout(this)

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.GONE
            progressTintList = ColorStateList.valueOf(GOLD)
        }

        errorText = TextView(this).apply {
            setTextColor(GOLD); textSize = 16f; gravity = Gravity.CENTER
            setPadding(dp(24), 0, dp(24), dp(16))
        }
        retryButton = Button(this).apply {
            text = word("retry")
            setOnClickListener {
                errorView.visibility = View.GONE
                if (web.url.isNullOrEmpty()) web.loadUrl(prefs.startUrl) else web.reload()
            }
        }
        errorView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BAR_BG)
            visibility = View.GONE
            isClickable = true
            addView(errorText)
            addView(retryButton, LinearLayout.LayoutParams(WRAP, WRAP))
        }

        web = createWebView()
        webHolder.addView(web, FrameLayout.LayoutParams(MATCH, MATCH))
        webHolder.addView(progress, FrameLayout.LayoutParams(MATCH, dp(3), Gravity.TOP))
        webHolder.addView(errorView, FrameLayout.LayoutParams(MATCH, MATCH))
        root.addView(webHolder, FrameLayout.LayoutParams(MATCH, MATCH))

        setContentView(root)
        webHolder.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> updateAspect() }
    }

    private fun applyWindowPrefs() {
        requestedOrientation = when (prefs.orientation) {
            "portrait" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            "auto" -> ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            else -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
        if (prefs.keepScreenOn) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)        // The keyboard covers the screen instead of squeezing the game.
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
        applySystemBars()
    }

    /**
     * The phone's bars are see-through over the parchment background. Normally the status bar shows
     * and the game starts under it (clear of the camera hole). "Hide status bar": the game uses the
     * whole screen. The navigation (gesture) area always stays live, so the first back swipe works.
     */
    @Suppress("DEPRECATION")
    private fun applySystemBars() {
        window.attributes = window.attributes.apply {
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        }
        window.setDecorFitsSystemWindows(false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.isNavigationBarContrastEnforced = false
        val c = window.insetsController ?: return
        val darkIcons = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        c.show(WindowInsets.Type.navigationBars())
        if (prefs.fullscreen) {
            c.hide(WindowInsets.Type.statusBars())
            c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.setSystemBarsAppearance(0, darkIcons)
        } else {
            c.show(WindowInsets.Type.statusBars())
            c.setSystemBarsAppearance(darkIcons, darkIcons)     // dark icons on parchment
        }
        root.requestApplyInsets()
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val w = GameWebView(this)
        val s = w.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.useWideViewPort = true          // honour the game-width viewport we inject
        s.loadWithOverviewMode = true     // fit the game to the screen
        s.setSupportZoom(false)           // the page never zooms; two fingers zoom the map only
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.setSupportMultipleWindows(true) // so we can catch the lobby's "Play" pop-up
        s.javaScriptCanOpenWindowsAutomatically = true
        s.textZoom = 100
        applyUserAgent(s)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true)

        w.setBackgroundColor(Color.BLACK)
        w.setOnLongClickListener { true }  // no text-selection popups; holding = mouse hover instead
        w.isHapticFeedbackEnabled = true
        w.addJavascriptInterface(Bridge(), "IkmAndroid")
        w.webViewClient = GameClient()
        w.webChromeClient = GameChrome()
        return w
    }

    private fun applyUserAgent(s: WebSettings) {
        if (!prefs.desktopMode) {
            s.userAgentString = null
            return
        }
        val def = WebSettings.getDefaultUserAgent(this)
        val chrome = Regex("Chrome/[\\d.]+").find(def)?.value ?: "Chrome/131.0.0.0"
        s.userAgentString =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) $chrome Safari/537.36"
    }

    private fun recreateWebView() {
        opener?.let { webHolder.removeView(it); it.destroy() }
        opener = null
        webHolder.removeView(web)
        web.destroy()
        web = createWebView()
        webHolder.addView(web, 0, FrameLayout.LayoutParams(MATCH, MATCH))
        web.loadUrl(prefs.startUrl)
        toast(word("crashed"))
    }

    /** Gameforge / Ikariam pages stay in the app; anything else opens in the phone's browser. */
    private fun isGameforgeHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == "gameforge.com" || h.endsWith(".gameforge.com") || h.endsWith("ikariam.com")
    }

    /** Returns true when the URL was handed to another app. */
    private fun openOutside(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        if ((scheme == "http" || scheme == "https") && isGameforgeHost(uri.host)) return false
        if (scheme == "about" || scheme == "javascript" || scheme == "data" || scheme == "blob") return false
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            toast(word("noApp"))
        }
        return true
    }

    /** The game server in front right now (never taken from the page). */
    private var currentHost = ""

    private fun updateHost(url: String?) {
        val host = url?.let { Uri.parse(it).host } ?: return
        onGameServer = GAME_HOST.matches(host)
        if (onGameServer) currentHost = host.lowercase()
    }

    /**
     * The game page says it is running, logged in: this is now the server the app opens and checks
     * for news, and its language (which the player may have changed in the game's Options) is the app's.
     */
    private fun pageIsPlaying(gameCode: String, serverName: String) {
        if (!onGameServer || currentHost.isEmpty()) return
        val url = "https://$currentHost/"
        val serverChanged = url != prefs.serverUrl
        val before = prefs.languageOf(currentHost)
        val lang = Lang.fromGameCode(gameCode) ?: before
        prefs.serverUrl = url
        prefs.setLanguage(currentHost, lang)
        if (serverName.isNotBlank()) prefs.setServerName(currentHost, serverName.take(40))
        if (lang != before) pushConfig()
        if (serverChanged || lang != before) NewsChecker.ensureChannels(this)      // their names are translated
        if (currentHost == switchHost) endSwitch()
        if (prefs.newsAlerts && switchHost == null) askUnrestricted(false)
        offerTutorialOnce()
    }

    /** Width / height of the game area (without the keyboard), so the game can always fit. */
    private var gameAspect = 0.0

    private fun updateAspect() {
        val w = webHolder.width
        val h = webHolder.height
        if (w <= 0 || h <= 0) return
        if (webHolder.rootWindowInsets?.isVisible(WindowInsets.Type.ime()) == true) return
        val a = w.toDouble() / h
        if (kotlin.math.abs(a - gameAspect) > 0.01) {
            gameAspect = a
            pushConfig()
        }
    }

    /** assets/art/manifest.json (optional): which generated pictures exist and which city art they fit. */
    private val artManifest: JSONObject? by lazy {
        try {
            JSONObject(assets.open("art/manifest.json").bufferedReader().use { it.readText() })
        } catch (e: Exception) {
            null
        }
    }

    private fun configJson(): String = JSONObject().apply {
        artManifest?.let { put("art", it) }
        put("aspect", gameAspect)
        put("width", prefs.uiWidth)
        put("touchFix", prefs.touchFix)
        put("composer", prefs.composer)
        put("layout", prefs.layout)
        val lang = if (currentHost.isEmpty()) prefs.language else prefs.languageOf(currentHost)
        put("lang", lang)
        put("words", Lang.pageWords(this@MainActivity, lang))
        put("cityMenu", prefs.cityMenuOpen)
        put("friends", prefs.friendsOpen)
        put("cityAuto", prefs.cityMenuAuto)
        put("wheelBuzz", prefs.wheelBuzz)
    }.toString()

    /** The app's own pictures (e.g. the extended city ground) at /__ikm/<file> on a game site. */
    fun artResponse(u: Uri): WebResourceResponse? {
        val path = u.path ?: return null
        if (!path.startsWith("/__ikm/") || !GAME_HOST.matches(u.host ?: "")) return null
        val name = path.removePrefix("/__ikm/")
        if (!ART_NAME.matches(name)) return null
        val mime = when (name.substringAfterLast('.').lowercase()) {
            "png" -> "image/png"
            "webp" -> "image/webp"
            else -> "image/jpeg"
        }
        return try {
            WebResourceResponse(mime, null, assets.open("art/$name"))
        } catch (e: java.io.IOException) {
            null
        }
    }

    /** What the tutorial page needs to look like the game: the same settings, marked as the demo. */
    fun tutorialConfig(): JSONObject = JSONObject(configJson()).apply {
        put("demo", true)
        put("layout", Prefs.LAYOUT_THUMB)
        put("cityMenu", false)
        put("friends", false)
        put("demoSettings", appSettingsData("demo").apply { remove("server"); remove("sleep") })
    }

    private fun inject(view: WebView) {
        view.evaluateJavascript("window.__ikmCfg=${configJson()};\n$enhanceJs", null)
    }

    /**
     * Install the page script as early as possible. Some game pages (the world map) take a
     * long time to finish loading; waiting for "finished" would show the raw desktop page
     * until then. The script is safe to run repeatedly (a second run only refreshes settings).
     */
    private var earlyInjectUntil = 0L
    private val earlyInject = object : Runnable {
        override fun run() {
            if (SystemClock.uptimeMillis() > earlyInjectUntil) return
            inject(web)
            main.postDelayed(this, 150)
        }
    }

    private fun startEarlyInject() {
        earlyInjectUntil = SystemClock.uptimeMillis() + 20_000
        main.removeCallbacks(earlyInject)
        main.post(earlyInject)
    }

    private fun stopEarlyInject() {
        earlyInjectUntil = 0
        main.removeCallbacks(earlyInject)
    }

    /** While on screen: a page without the script (whatever the reason) gets it within a moment. */
    private val watchdog = object : Runnable {
        override fun run() {
            val view = web
            view.evaluateJavascript("!!window.__ikm") { r -> if (r != "true" && view === web) inject(view) }
            main.postDelayed(this, WATCH_MS)
        }
    }

    private fun pushConfig() {
        web.evaluateJavascript(
            "window.__ikmCfg=${configJson()}; if (window.__ikm) window.__ikm.configure(window.__ikmCfg);", null
        )
    }

    private fun showError(desc: String) {
        endSwitch()
        errorText.text = "${word("noConnection")}\n\n$desc"
        retryButton.text = word("retry")
        errorView.visibility = View.VISIBLE
    }

    private inner class GameClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            openOutside(request.url)

        /** The app's own pictures (e.g. the extended city ground) at /__ikm/<file> on the game site. */
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            artResponse(request.url)

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            if (view !== web) return
            errorView.visibility = View.GONE
            updateHost(url)
            if (onGameServer) releaseOpener()
            startEarlyInject()
        }

        override fun onPageCommitVisible(view: WebView, url: String?) = inject(view)

        override fun onPageFinished(view: WebView, url: String?) {
            if (view === web) {
                updateHost(url)
                if (onGameServer) releaseOpener()
                stopEarlyInject()
                switchStep(url)
            }
            inject(view)
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(error.description?.toString() ?: "")
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreateWebView()
            return true
        }
    }

    private inner class GameChrome : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
            progress.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
        }

        /**
         * The Gameforge lobby opens the game in a new tab ("/loading") that talks back to the
         * lobby tab before it can enter the server. So the new tab becomes a real WebView shown
         * on top, while the lobby stays alive underneath until the game server is reached.
         */
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            closePopup()   // only one extra tab at a time
            val popup = createWebView()
            webHolder.addView(popup, 1, FrameLayout.LayoutParams(MATCH, MATCH))   // above the lobby, below progress/error
            opener = web
            web = popup
            (resultMsg.obj as WebView.WebViewTransport).webView = popup
            resultMsg.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView) {
            if (window === web && opener != null) closePopup()
        }
    }

    /** The lobby tab that opened the current one (kept alive until the game loads). */
    private var opener: WebView? = null

    /** The new tab has reached the game server: the lobby tab is no longer needed. */
    private fun releaseOpener() {
        val o = opener ?: return
        opener = null
        webHolder.removeView(o)
        o.destroy()
    }

    /** Close the extra tab and go back to the lobby tab. */
    private fun closePopup() {
        val o = opener ?: return
        val popup = web
        opener = null
        web = o
        webHolder.removeView(popup)
        popup.destroy()
        updateHost(web.url)
    }

    // ------------------------------------------------------------------ switch server

    /** The server being switched to, until its game is on screen. */
    private var switchHost: String? = null
    private var switchStage = SWITCH_DIRECT
    private var switchLooks = 0
    private var switchCover: View? = null

    /** host -> players online there, from the lobby's public list. */
    private val playersOnline = HashMap<String, Int>()

    /** Only the list this app showed may pick a server (the bridge is visible to every frame). */
    private val menuPass = UUID.randomUUID().toString()

    private fun flagOf(host: String): String {
        val code = host.substringBefore(".").substringAfter("-").uppercase()
        val country = NOT_COUNTRY_CODES[code] ?: code
        if (country.length != 2 || country.any { it !in 'A'..'Z' }) return ""
        return country.map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("")
    }

    private fun onlineText(host: String): String {
        val n = playersOnline[host] ?: return ""
        return "${NumberFormat.getIntegerInstance(Locale.US).format(n)} ${word("online")}"
    }

    /** More / App menu > Switch server: in the game's own list, or a dialog where there is none (lobby, classic). */
    private fun showServers() {
        if (!onGameServer || switchHost != null) {
            showServerDialog()
            return
        }
        web.evaluateJavascript(serversJs(update = false)) { r ->
            if (r != "true") {
                showServerDialog()
            } else {
                loadOnline { web.evaluateJavascript(serversJs(update = true), null) }
            }
        }
    }

    private fun serversJs(update: Boolean): String {
        val rows = JSONArray()
        for (host in prefs.knownServers) {
            rows.put(JSONObject().apply {
                put("host", host)
                put("flag", flagOf(host))
                put("name", prefs.serverTitle(host))
                put("id", host.substringBefore("."))
                put("online", onlineText(host))
                put("current", host == currentHost)
            })
        }
        val list = JSONObject().apply {
            put("pass", menuPass)
            put("title", word("switchServer"))
            put("lobby", word("lobby"))
            put("rows", rows)
            put("update", update)
        }
        return "!!(window.__ikm && window.__ikm.servers && window.__ikm.servers($list))"
    }

    private fun showServerDialog() {
        val hosts = prefs.knownServers
        fun labels() = hosts.map { host ->
            listOf("${flagOf(host)}  ${prefs.serverTitle(host)}", onlineText(host)).filter { it.isNotEmpty() }.joinToString("  ·  ")
        }
        val adapter = ArrayAdapter(this, android.R.layout.simple_list_item_single_choice, labels().toMutableList())
        val now = if (onGameServer) hosts.indexOf(currentHost) else -1
        AlertDialog.Builder(this)
            .setTitle(word("switchServer"))
            .setSingleChoiceItems(adapter, now) { dialog, i ->
                dialog.dismiss()
                switchTo(hosts[i])
            }
            .setNeutralButton(word("lobby")) { _, _ -> web.loadUrl(Prefs.LOBBY) }
            .setNegativeButton(word("cancel"), null)
            .showLocalized()
        loadOnline {
            adapter.clear()
            adapter.addAll(labels())
        }
    }

    /** The lobby's public server list: no login is sent. */
    private fun loadOnline(then: () -> Unit) {
        val hosts = prefs.knownServers
        thread {
            val found = HashMap<String, Int>()
            try {
                val conn = URL(SERVER_LIST).openConnection() as HttpURLConnection
                conn.connectTimeout = 8_000
                conn.readTimeout = 8_000
                val list = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
                for (i in 0 until list.length()) {
                    val s = list.optJSONObject(i) ?: continue
                    val id = "s${s.optInt("number")}-${s.optString("language")}."
                    val host = hosts.firstOrNull { it.startsWith(id) } ?: continue
                    if (s.has("playersOnline")) found[host] = s.optInt("playersOnline")
                }
            } catch (e: Exception) {
                // no count then: the list works without
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                playersOnline.putAll(found)
                then()
            }
        }
    }

    /**
     * The player picked a server: straight there if its login still lives (each server has its own,
     * so nothing is logged out); otherwise through the lobby, pressing Play on that existing account.
     */
    private fun switchTo(host: String, evenIfShown: Boolean = false) {
        if (host !in prefs.knownServers) return
        if (!evenIfShown && switchHost == null && onGameServer && host == currentHost) return
        endSwitch()
        closePopup()
        switchHost = host
        switchStage = SWITCH_DIRECT
        val cover = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(PARCHMENT)
            isClickable = true
            addView(ProgressBar(this@MainActivity).apply { indeterminateTintList = ColorStateList.valueOf(BAR_BG) })
            addView(TextView(this@MainActivity).apply {
                text = prefs.serverTitle(host)
                setTextColor(BAR_BG); textSize = 24f
                gravity = Gravity.CENTER
                setPadding(0, dp(16), 0, 0)
            })
        }
        switchCover = cover
        webHolder.addView(cover, FrameLayout.LayoutParams(MATCH, MATCH))
        main.postDelayed(switchTimeout, SWITCH_LIMIT_MS)
        web.loadUrl("https://$host/")
    }

    private fun switchStep(url: String?) {
        val host = switchHost ?: return
        if (switchStage != SWITCH_DIRECT) return
        val u = url?.let { Uri.parse(it) } ?: return
        if (u.host != LOBBY_HOST) return                 // the game itself: its page reports when it runs
        // sent to the lobby: that server's login has ended
        switchStage = SWITCH_ACCOUNTS
        switchLooks = 0
        val locale = u.pathSegments.firstOrNull()?.takeIf { LOBBY_LOCALE.matches(it) } ?: "en_GB"
        web.loadUrl("https://$LOBBY_HOST/$locale/accounts")
        main.removeCallbacks(switchLook)
        main.postDelayed(switchLook, 700)
        main.removeCallbacks(switchTimeout)
        main.postDelayed(switchTimeout, SWITCH_LIMIT_MS)
    }

    /** Waits for the account list, then presses Play on the one row that is this server. */
    private val switchLook = object : Runnable {
        override fun run() {
            val host = switchHost ?: return
            if (switchStage != SWITCH_ACCOUNTS) return
            val name = JSONObject.quote(prefs.serverName(host))
            val flag = JSONObject.quote("flag-" + host.substringBefore(".").substringAfter("-"))
            val js = """
                (function () {
                  if (location.hostname !== '$LOBBY_HOST') return 'wait';
                  if (document.readyState !== 'complete') return 'wait';
                  if (!/\/accounts\/?$/.test(location.pathname)) return 'away';
                  var name = $name, flag = $flag;
                  var rows = [].filter.call(document.querySelectorAll('#accountlist .rt-tr-group'), function (row) {
                    var n = row.querySelector('.server-name-cell'), f = row.getElementsByClassName(flag);
                    return n && f.length && (!name || n.textContent.trim() === name);
                  });
                  if (!rows.length) return 'wait';
                  if (rows.length > 1) return 'many';
                  var play = rows[0].querySelector('.action-cell button');
                  if (!play || play.disabled) return 'wait';
                  play.click();
                  return 'clicked';
                })()
            """.trimIndent()
            val again = this
            web.evaluateJavascript(js) { r ->
                if (switchHost != host || switchStage != SWITCH_ACCOUNTS) return@evaluateJavascript
                switchLooks++
                when {
                    r == "\"clicked\"" -> switchStage = SWITCH_PLAY
                    // not the account list: logged out of Gameforge, the player logs in there
                    r == "\"many\"" || (r == "\"away\"" && switchLooks > 8) -> failSwitch()
                    else -> main.postDelayed(again, 500)
                }
            }
        }
    }

    private val switchTimeout = Runnable { failSwitch() }

    private fun failSwitch() {
        if (switchHost == null) return
        endSwitch()
        pendingAdvisor = null
        toast(word("switchFailed"))
    }

    /** Arrived, gave up or cancelled: show whatever the page is. */
    private fun endSwitch() {
        switchHost = null
        main.removeCallbacks(switchLook)
        main.removeCallbacks(switchTimeout)
        switchCover?.let { webHolder.removeView(it) }
        switchCover = null
    }

    /** Called from enhance.js. Runs on a background thread, so hop to the UI thread. */
    inner class Bridge {
        @JavascriptInterface
        fun compose(json: String) {
            runOnUiThread { if (onGameServer) Composer.show(this@MainActivity, JSONObject(json)) }
        }

        /** More > App settings of the thumb layout: the app fills in the page's window. */
        @JavascriptInterface
        fun openAppSettings() {
            runOnUiThread { if (onGameServer) showAppSettings() }
        }

        /** A button of that window (reload, lobby, exit...), with the pass the app gave it. */
        @JavascriptInterface
        fun appAction(pass: String, key: String) {
            runOnUiThread { if (pass == menuPass && onGameServer) doAppAction(key) }
        }

        /** Save in that window: the choices as JSON. */
        @JavascriptInterface
        fun saveSettings(pass: String, json: String) {
            runOnUiThread {
                if (pass != menuPass || !onGameServer) return@runOnUiThread
                val choices = try {
                    JSONObject(json)
                } catch (e: Exception) {
                    return@runOnUiThread           // a malformed answer changes nothing
                }
                applySettings(choices)
            }
        }

        /** The page script saw a logged-in game page (its language code and server name). */
        @JavascriptInterface
        fun page(gameCode: String, serverName: String) {
            runOnUiThread { pageIsPlaying(gameCode, serverName) }
        }

        /** A side menu of the thumb layout was opened or retracted. */
        @JavascriptInterface
        fun menus(cityMenu: Boolean, friends: Boolean) {
            runOnUiThread {
                prefs.cityMenuOpen = cityMenu
                prefs.friendsOpen = friends
            }
        }

        /** More > Switch server. */
        @JavascriptInterface
        fun switchServer() {
            runOnUiThread { if (onGameServer) showServers() }
        }

        /** A row of the in-game server list ("" = the lobby). */
        @JavascriptInterface
        fun pickServer(pass: String, host: String) {
            runOnUiThread {
                if (pass != menuPass || !onGameServer) return@runOnUiThread
                if (host.isEmpty()) web.loadUrl(Prefs.LOBBY) else switchTo(host)
            }
        }

        /** The game page is running on screen: no background check needed for that server. */
        @JavascriptInterface
        fun alive() {
            runOnUiThread {
                if (NewsChecker.appVisible && onGameServer && currentHost.isNotEmpty() && switchHost == null) {
                    NewsChecker.pageAlive(currentHost)
                }
            }
        }

        /** What the advisors show while the player is looking. */
        @JavascriptInterface
        fun seen(json: String) {
            runOnUiThread {
                if (!NewsChecker.appVisible || !onGameServer || currentHost.isEmpty()) return@runOnUiThread
                if (switchHost != null && switchHost != currentHost) return@runOnUiThread
                val advisors = try {
                    JSONObject(json)
                } catch (e: Exception) {
                    return@runOnUiThread
                }
                NewsChecker(this@MainActivity).seen(currentHost, advisors)
            }
        }

        /** The town wheel turned a notch: a tiny tick, or a firmer one as a town reaches the middle. */
        @JavascriptInterface
        fun notch(strong: Boolean) {
            runOnUiThread {
                if (!prefs.wheelBuzz) return@runOnUiThread
                val kind = when {
                    strong -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                    Build.VERSION.SDK_INT >= 34 -> HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
                    else -> HapticFeedbackConstants.TEXT_HANDLE_MOVE
                }
                web.performHapticFeedback(kind)
            }
        }

        /** A finger moved on to the next item of a menu: a light tick. */
        @JavascriptInterface
        fun tick() {
            runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
        }

        @JavascriptInterface
        fun haptic() {
            runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS) }
        }
    }

    /** Puts text from the native editor into the game's field (and optionally presses Enter). */
    fun fillField(id: String, value: String, send: Boolean) {
        web.evaluateJavascript(
            "window.__ikm && window.__ikm.fill(${JSONObject.quote(id)}, ${JSONObject.quote(value)}, $send)", null
        )
    }

    fun focusFieldRaw(id: String) {
        web.evaluateJavascript("window.__ikm && window.__ikm.focusRaw(${JSONObject.quote(id)})", null)
    }

    // ------------------------------------------------------------------ news notifications

    /** Android 13+: ask once whether the app may show notifications (or again from Settings). */
    private fun askNotifyPermission(fromSettings: Boolean) {
        if (Build.VERSION.SDK_INT < 33) return
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        if (prefs.askedNotifyPermission && !fromSettings) return
        prefs.askedNotifyPermission = true
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIFY && grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            toast(word("needNotify"))
        }
    }

    /**
     * Minute checks while the phone sleeps need the app "unrestricted" (battery). Only the player can
     * allow that: this shows Android's own question, once by itself and again from Settings.
     */
    @SuppressLint("BatteryLife")
    private fun askUnrestricted(fromSettings: Boolean) {
        if (NewsChecker.unrestricted(this)) return
        if (prefs.askedBattery && !fromSettings) return
        prefs.askedBattery = true
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: ActivityNotFoundException) {
            toast(word("noApp"))
        }
    }

    /** Advisor the player tapped in a notification; opened once the game page is ready. */
    private var pendingAdvisor: String? = null
    private var advisorTries = 0

    /** The server that advisor is on. */
    private var advisorHost: String? = null

    private fun handleNotificationIntent(intent: Intent?) {
        val key = intent?.getStringExtra(NewsChecker.EXTRA_ADVISOR) ?: return
        val host = intent.getStringExtra(NewsChecker.EXTRA_HOST)
            ?.takeIf { intent.getStringExtra(NewsChecker.EXTRA_KEY) == prefs.intentKey && it in prefs.knownServers }
        intent.removeExtra(NewsChecker.EXTRA_ADVISOR)
        advisorHost = host
        when {
            host == null -> {}
            // "logged out": a tap on the alert only opens the app (logging in would end a session on a PC)
            key == NewsChecker.LOGIN -> {}
            key == NewsChecker.RECONNECT -> {
                getSystemService(NotificationManager::class.java)?.cancel("$host/${NewsChecker.LOGIN}".hashCode())
                switchTo(host, evenIfShown = true)       // the page shown may be one whose login has ended
            }
            else -> switchTo(host)
        }
        pendingAdvisor = when (key) {
            "cities" -> "towns"
            "diplomacy" -> "messages"
            "military", "research" -> key
            else -> null          // e.g. the "log in again" notice: just show the app
        }
        advisorTries = 0
        main.removeCallbacks(openAdvisorTry)
        if (pendingAdvisor != null) main.postDelayed(openAdvisorTry, 500)
    }

    /** Waits (up to ~40 s) until the game's advisor buttons exist, then taps the one asked for. */
    private val openAdvisorTry = object : Runnable {
        override fun run() {
            val key = pendingAdvisor ?: return
            if (++advisorTries > 50) { pendingAdvisor = null; return }
            val otherServer = advisorHost?.let { it != currentHost } == true
            if (!onGameServer || otherServer || switchHost != null || progress.visibility == View.VISIBLE) {
                main.postDelayed(this, 800)
                return
            }
            web.evaluateJavascript(
                "(window.__ikm && document.getElementById('advisors')) ? window.__ikm.go(${JSONObject.quote(key)}) : false"
            ) { r ->
                if (r == "true") pendingAdvisor = null else main.postDelayed(this, 800)
            }
        }
    }

    // ------------------------------------------------------------------ back button + menu

    /** When Back last found nothing to close (thumb layout): a second Back soon after leaves the app. */
    private var backAt = 0L

    /**
     * Back = Close: closes the game window or pop-up on top. With nothing to close:
     * - thumb layout (it has More > App settings): Back twice leaves the app;
     * - classic layout, landscape, lobby: the app menu (settings, reload, lobby, exit).
     */
    private fun handleBack() {
        if (tutorial.back()) return        // the tutorial is on top of everything: Back twice ends it
        if (switchHost != null) {          // Back while switching = stop switching
            web.stopLoading()
            endSwitch()
            return
        }
        val js = "window.__ikm ? (window.__ikm.closeTop() ? 'closed' : " +
            "(window.__ikm.hasMore && window.__ikm.hasMore() ? 'more' : 'open')) : 'none'"
        web.evaluateJavascript(js) { r ->
            if (r == "\"closed\"") {
                backAt = 0L
                return@evaluateJavascript
            }
            if (opener != null && !web.canGoBack()) {
                closePopup()
                return@evaluateJavascript
            }
            if (!onGameServer && web.canGoBack()) {
                web.goBack()
                return@evaluateJavascript
            }
            if (onGameServer && r == "\"more\"") {
                val now = SystemClock.uptimeMillis()
                if (backAt != 0L && now - backAt < EXIT_WINDOW_MS) {
                    backAt = 0L
                    finish()
                } else {
                    backAt = now
                    toast(word("backAgain"))
                }
                return@evaluateJavascript
            }
            showMenu()
        }
    }

    /** More > App settings: the page draws the window in the game's style from this. */
    private fun showAppSettings() {
        val data = appSettingsData(menuPass)
        web.evaluateJavascript("window.__ikm && window.__ikm.appSettings ? window.__ikm.appSettings($data) : false") { r ->
            if (r != "true") showMenu()            // no page window to draw it in
        }
    }

    /** The words and current values of More > App settings (also shown, untouchable, in the tutorial). */
    private fun appSettingsData(pass: String): JSONObject {
        fun choice(value: Any, label: String) = JSONObject().put("value", value).put("label", label)
        fun group(key: String, title: String, value: Any, options: List<JSONObject>) = JSONObject()
            .put("key", key).put("title", title).put("value", value).put("options", JSONArray(options))
        fun toggle(key: String, label: String, on: Boolean) = JSONObject().put("key", key).put("label", label).put("value", on)
        fun action(key: String) = JSONObject().put("key", key).put("label", word(key))

        val sizes = listOf(950, 1100, 1250, 1400, 1600)
        val size = sizes.minByOrNull { kotlin.math.abs(it - prefs.uiWidth) }!!
        return JSONObject().apply {
            put("pass", pass)
            put("rtl", Lang.rightToLeft(prefs.language))
            put("title", word("appSettings"))
            if (prefs.serverHost.isNotEmpty()) {
                val id = prefs.serverHost.substringBefore(".")
                val name = prefs.serverName(prefs.serverHost)
                put("server", word("server") + ": " + (if (name.isEmpty()) id else "$name ($id)"))
            }
            // the menu's buttons More does not already have (Switch server is in More itself)
            put("actions", JSONArray(listOf(action("reload"), action("restore"), action("lobby"), action("exit"))))
            put("groups", JSONArray(listOf(
                group("layout", word("layout"), prefs.layout, listOf(
                    choice(Prefs.LAYOUT_THUMB, word("thumb")), choice(Prefs.LAYOUT_CLASSIC, word("classic")),
                )),
                group("rotation", word("rotation"), prefs.orientation, listOf(
                    choice("portrait", word("portrait")), choice("auto", word("autoRotate")), choice("landscape", word("landscape")),
                )),
                group("size", word("size"), size, sizes.map { choice(it, "${110000 / it}%") }),
            )))
            put("togglesTitle", word("settings"))
            put("toggles", JSONArray(listOf(
                toggle("hideBar", word("hideBar"), prefs.fullscreen),
                toggle("awake", word("awake"), prefs.keepScreenOn),
                toggle("autoRetract", word("autoRetract"), prefs.cityMenuAuto),
                toggle("wheelBuzz", word("wheelBuzz"), prefs.wheelBuzz),
                toggle("touch", word("touch"), prefs.touchFix),
                toggle("editor", word("editor"), prefs.composer),
                toggle("desktop", word("desktop"), prefs.desktopMode),
                toggle("alerts", word("alerts"), prefs.newsAlerts),
            )))
            if (!NewsChecker.unrestricted(this@MainActivity)) put("sleep", word("sleepChecks"))
            // the tutorial replaces the written help when this build has it
            if (Tutorial.assetFor(this@MainActivity, prefs.language) != null) put("tutorial", word("tutorial"))
            put("helpTitle", word("help"))
            put("help", JSONArray(listOf("hTowns", "hMenus", "hPanels", "hMap", "hBackThumb", "hQuick").map { word(it) }))
            put("logout", JSONObject().put("key", "logout").put("label", word("logout"))
                .put("text", word("logoutMsg")).put("yes", word("logout")).put("no", word("cancel")))
            put("save", word("save"))
            put("cancel", word("cancel"))
            put("close", word("close"))
        }
    }

    private fun doAppAction(key: String) {
        when (key) {
            "reload" -> web.reload()
            "restore" -> restorePanels()
            "lobby" -> web.loadUrl(Prefs.LOBBY)
            "exit" -> finish()
            "logout" -> clearData()
            "sleepChecks" -> askUnrestricted(true)
            "tutorial" -> {
                prefs.tutorialOffered = true
                tutorial.show(prefs.language)
            }
            "tutorialNo" -> prefs.tutorialOffered = true      // the offer was answered "not now"
        }
    }

    /**
     * Once (after installing, or the update that brought the videos): the first time a game page is
     * ready, ask whether to watch the touch-controls tutorial. In the thumb layout the question is a
     * window in the game's style, otherwise a dialog.
     */
    // It only counts as asked once the player answers (Watch, Not now, Back, the X, a tap outside):
    // the game reloads its page right after opening, which can take an unanswered question away.
    private var offerTries = 0
    private var offerDialog: AlertDialog? = null

    private fun offerTutorialOnce() {
        if (prefs.tutorialOffered || switchHost != null || offerDialog != null) return
        if (Tutorial.assetFor(this, prefs.language) == null) return
        offerTries = 0
        main.removeCallbacks(offerTry)
        main.postDelayed(offerTry, 2500)
    }

    private val offerTry = object : Runnable {
        override fun run() {
            if (prefs.tutorialOffered || offerDialog != null) return
            if (!onGameServer || isFinishing || switchHost != null) return     // the next game page asks again
            if (tutorial.showing || ++offerTries > 12) return
            val data = JSONObject()
                .put("pass", menuPass)
                .put("rtl", Lang.rightToLeft(prefs.language))
                .put("title", word("tutorial"))
                .put("text", word("tutorialAsk"))
                .put("yes", word("watch"))
                .put("no", word("notNow"))
            val js = "window.__ikm && window.__ikm.askTutorial && document.getElementById('container') ? " +
                "window.__ikm.askTutorial($data) : 'wait'"
            web.evaluateJavascript(js) { r ->
                when (r) {
                    "true" -> {}                                   // the page asks; its answer comes back
                    "false" -> offerAsDialog()                     // ready, but no window there (classic)
                    else -> main.postDelayed(this, 1000)           // not ready yet
                }
            }
        }
    }

    private fun offerAsDialog() {
        if (prefs.tutorialOffered || offerDialog != null) return
        offerDialog = AlertDialog.Builder(this)
            .setTitle(word("tutorial"))
            .setMessage(word("tutorialAsk"))
            .setPositiveButton(word("watch")) { _, _ -> tutorial.show(prefs.language) }
            .setNegativeButton(word("notNow"), null)
            .setOnDismissListener {
                prefs.tutorialOffered = true
                offerDialog = null
            }
            .showLocalized()
    }

    /** Save in More > App settings. Only known keys and values are taken. */
    private fun applySettings(o: JSONObject) {
        val ua = prefs.desktopMode
        o.optInt("size", 0).takeIf { it in 900..1700 }?.let { prefs.uiWidth = it }
        o.optString("rotation").takeIf { it == "portrait" || it == "auto" || it == "landscape" }?.let { prefs.orientation = it }
        o.optString("layout").takeIf { it == Prefs.LAYOUT_THUMB || it == Prefs.LAYOUT_CLASSIC }?.let { prefs.layout = it }
        fun flag(key: String, set: (Boolean) -> Unit) { if (o.has(key)) set(o.optBoolean(key)) }
        flag("hideBar") { prefs.fullscreen = it }
        flag("awake") { prefs.keepScreenOn = it }
        flag("autoRetract") { prefs.cityMenuAuto = it }
        flag("wheelBuzz") { prefs.wheelBuzz = it }
        flag("touch") { prefs.touchFix = it }
        flag("editor") { prefs.composer = it }
        flag("desktop") { prefs.desktopMode = it }
        flag("alerts") { prefs.newsAlerts = it }
        settingsSaved(ua != prefs.desktopMode)
    }

    /** After either settings screen saved: apply everything. */
    private fun settingsSaved(uaChanged: Boolean) {
        NewsChecker.start(this)             // schedules, or cancels when turned off
        if (prefs.newsAlerts) askNotifyPermission(true)   // asks only if not allowed yet
        applyWindowPrefs()
        pushConfig()
        if (uaChanged) {
            applyUserAgent(web.settings)
            web.reload()
        }
    }

    private fun showMenu() {
        val options = arrayOf(
            word("settings"),
            word("reload"),
            word("restore"),
            word("switchServer"),
            word("lobby"),
            word("help"),
            word("logout"),
            word("exit"),
        )
        AlertDialog.Builder(this)
            .setTitle("Ikariam Mobile")
            .setItems(options) { _, i ->
                when (i) {
                    0 -> showSettings()
                    1 -> web.reload()
                    2 -> restorePanels()
                    3 -> showServers()
                    4 -> web.loadUrl(Prefs.LOBBY)
                    5 -> if (!tutorial.show(prefs.language)) showHelp()     // the video, else the text
                    6 -> confirmClearData()
                    7 -> finish()
                }
            }
            .showLocalized()
    }

    /** Forgets every dragged window / panel position (the page script keeps them). */
    private fun restorePanels() {
        web.evaluateJavascript("window.__ikm ? window.__ikm.resetPanels() : false") { r ->
            toast(word(if (r == "true") "restored" else "openGame"))
        }
    }

    private fun confirmClearData() {
        AlertDialog.Builder(this)
            .setTitle(word("logout"))
            .setMessage(word("logoutMsg"))
            .setPositiveButton(word("logout")) { _, _ -> clearData() }
            .setNegativeButton(word("cancel"), null)
            .showLocalized()
    }

    private fun clearData() {
        CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush() }
        WebStorage.getInstance().deleteAllData()
        web.clearCache(true)
        web.clearHistory()
        prefs.serverUrl = ""
        NewsChecker.loginsCleared(this)
        web.loadUrl(Prefs.LOBBY)
    }

    private fun showHelp() {
        val lines = listOf("hTowns", "hMenus", "hPanels", "hMap", "hBack").joinToString("\n\n") { "• " + word(it) } +
            "\n\n• " + word("hQuick")
        AlertDialog.Builder(this)
            .setTitle(word("help"))
            .setMessage(lines)
            .setPositiveButton(word("close"), null)
            .showLocalized()
    }

    private fun showSettings() {
        val pad = dp(20)
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, dp(8), pad, 0) }
        fun header(t: String) = TextView(this).apply {
            text = t; setTextColor(GOLD); textSize = 13f; setPadding(0, dp(14), 0, dp(4))
        }

        // The server being played (found by itself; change it in the lobby)
        if (prefs.serverHost.isNotEmpty()) {
            box.addView(header(word("server")))
            box.addView(TextView(this).apply {
                val id = prefs.serverHost.substringBefore(".")
                val name = prefs.serverName(prefs.serverHost)
                text = if (name.isEmpty()) id else "$name ($id)"
                textSize = 15f
            })
        }

        // Layout (portrait)
        val layouts = listOf(
            Prefs.LAYOUT_THUMB to word("thumb"),
            Prefs.LAYOUT_CLASSIC to word("classic"),
        )
        box.addView(header(word("layout")))
        val layoutGroup = RadioGroup(this)
        val layoutButtons = layouts.map { (key, label) ->
            RadioButton(this).apply { id = View.generateViewId(); text = label; tag = key }.also {
                layoutGroup.addView(it)
                if (key == prefs.layout) it.isChecked = true
            }
        }
        box.addView(layoutGroup)

        // Game size (landscape): how big it is drawn, compared with 1100
        val sizes = listOf(950, 1100, 1250, 1400, 1600).map { it to "${110000 / it}%" }
        box.addView(header(word("size")))
        val sizeGroup = RadioGroup(this)
        val closest = sizes.minByOrNull { kotlin.math.abs(it.first - prefs.uiWidth) }!!.first
        val sizeButtons = sizes.map { (w, label) ->
            RadioButton(this).apply { id = View.generateViewId(); text = label; tag = w }.also {
                sizeGroup.addView(it)
                if (w == closest) it.isChecked = true
            }
        }
        box.addView(sizeGroup)

        // Orientation
        val orients = listOf("portrait" to word("portrait"), "auto" to word("autoRotate"), "landscape" to word("landscape"))
        box.addView(header(word("rotation")))
        val orientGroup = RadioGroup(this)
        val orientButtons = orients.map { (key, label) ->
            RadioButton(this).apply { id = View.generateViewId(); text = label; tag = key }.also {
                orientGroup.addView(it)
                if (key == prefs.orientation) it.isChecked = true
            }
        }
        box.addView(orientGroup)

        // Toggles
        box.addView(header(""))
        fun check(label: String, value: Boolean) = CheckBox(this).apply { text = label; isChecked = value }.also { box.addView(it) }
        val cFull = check(word("hideBar"), prefs.fullscreen)
        val cAwake = check(word("awake"), prefs.keepScreenOn)
        val cMenuAuto = check(word("autoRetract"), prefs.cityMenuAuto)
        val cTouch = check(word("touch"), prefs.touchFix)
        val cComposer = check(word("editor"), prefs.composer)
        val cDesktop = check(word("desktop"), prefs.desktopMode)
        val cNews = check(word("alerts"), prefs.newsAlerts)
        if (!NewsChecker.unrestricted(this)) {
            box.addView(Button(this).apply {
                text = word("sleepChecks")
                isAllCaps = false
                setOnClickListener { askUnrestricted(true) }
            })
        }

        val scroll = ScrollView(this).apply { addView(box) }

        AlertDialog.Builder(this)
            .setTitle(word("settings"))
            .setView(scroll)
            .setPositiveButton(word("save")) { _, _ ->
                prefs.uiWidth = sizeButtons.firstOrNull { it.isChecked }?.tag as? Int ?: prefs.uiWidth
                prefs.orientation = orientButtons.firstOrNull { it.isChecked }?.tag as? String ?: prefs.orientation
                prefs.layout = layoutButtons.firstOrNull { it.isChecked }?.tag as? String ?: prefs.layout
                prefs.fullscreen = cFull.isChecked
                prefs.keepScreenOn = cAwake.isChecked
                prefs.cityMenuAuto = cMenuAuto.isChecked
                prefs.touchFix = cTouch.isChecked
                prefs.composer = cComposer.isChecked
                val uaChanged = cDesktop.isChecked != prefs.desktopMode
                prefs.desktopMode = cDesktop.isChecked
                prefs.newsAlerts = cNews.isChecked
                settingsSaved(uaChanged)
            }
            .setNegativeButton(word("cancel"), null)
            .showLocalized()
    }

    companion object {
        /** Game world hosts look like s66-ae.ikariam.gameforge.com */
        val GAME_HOST = Regex("^s\\d+-[a-z]+\\.ikariam\\.gameforge\\.com$", RegexOption.IGNORE_CASE)
        val ART_NAME = Regex("^[A-Za-z0-9_.-]+$")
        private const val REQ_NOTIFY = 31
        private const val WATCH_MS = 1500L
        private const val EXIT_WINDOW_MS = 2000L
        private const val LOBBY_HOST = "lobby.ikariam.gameforge.com"
        private val LOBBY_LOCALE = Regex("^[a-z]{2}_[A-Z]{2}$")
        private const val SWITCH_DIRECT = 0
        private const val SWITCH_ACCOUNTS = 1
        private const val SWITCH_PLAY = 2
        private const val SWITCH_LIMIT_MS = 25_000L
        private const val SERVER_LIST = "https://lobby.ikariam.gameforge.com/api/servers"

        /** Ikariam's community codes that are not country codes. */
        private val NOT_COUNTRY_CODES = mapOf("EN" to "GB", "YU" to "RS")
        private val PARCHMENT = Color.rgb(0xF2, 0xE3, 0xC2)
    }
}
