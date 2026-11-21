package com.islam.ikariamtouch

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.os.SystemClock
import android.text.InputType
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
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

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
    lateinit var web: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorView: LinearLayout
    private lateinit var errorText: TextView

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
        applyWindowPrefs()
        web.loadUrl(prefs.serverUrl)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()   // keep the login across restarts
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
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
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
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
        val retry = Button(this).apply {
            text = "Try again"
            setOnClickListener {
                errorView.visibility = View.GONE
                if (web.url.isNullOrEmpty()) web.loadUrl(prefs.serverUrl) else web.reload()
            }
        }
        errorView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BAR_BG)
            visibility = View.GONE
            isClickable = true
            addView(errorText)
            addView(retry, LinearLayout.LayoutParams(WRAP, WRAP))
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
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        // The keyboard covers the screen instead of squeezing the game.
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
        applySystemBars()
    }

    /** Full screen: draw behind the status bar and around the camera punch hole. */
    private fun applySystemBars() {
        window.attributes = window.attributes.apply {
            layoutInDisplayCutoutMode = if (prefs.fullscreen)
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
        }
        window.setDecorFitsSystemWindows(!prefs.fullscreen)
        val c = window.insetsController ?: return
        if (prefs.fullscreen) {
            // Hide only the status bar. The navigation (gesture) area stays live but see-through,
            // so the very first back swipe works (a hidden nav bar eats the first swipe).
            c.hide(WindowInsets.Type.statusBars())
            c.show(WindowInsets.Type.navigationBars())
            c.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.TRANSPARENT
            window.isNavigationBarContrastEnforced = false
        } else {
            c.show(WindowInsets.Type.systemBars())
        }
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): WebView {
        val w = WebView(this)
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
        web.loadUrl(prefs.serverUrl)
        toast("The game page crashed and was reloaded")
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
            toast("No app can open this link")
        }
        return true
    }

    private fun updateHost(url: String?) {
        val host = url?.let { Uri.parse(it).host } ?: return
        onGameServer = GAME_HOST.matches(host)
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
    }.toString()

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

    private fun pushConfig() {
        web.evaluateJavascript(
            "window.__ikmCfg=${configJson()}; if (window.__ikm) window.__ikm.configure(window.__ikmCfg);", null
        )
    }

    private fun showError(desc: String) {
        errorText.text = "Couldn't reach the game.\n\n$desc\n\nCheck your internet connection."
        errorView.visibility = View.VISIBLE
    }

    private inner class GameClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            openOutside(request.url)

        /** The app's own pictures (e.g. the extended city ground) at /__ikm/<file> on the game site. */
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val u = request.url
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
            }
            inject(view)
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(error.description?.toString() ?: "Connection error")
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

    /** Called from enhance.js. Runs on a background thread, so hop to the UI thread. */
    inner class Bridge {
        @JavascriptInterface
        fun compose(json: String) {
            runOnUiThread { if (onGameServer) Composer.show(this@MainActivity, JSONObject(json)) }
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

    // ------------------------------------------------------------------ back button + menu

    /**
     * Back = Close: closes the game window or pop-up on top. With nothing to close it never
     * leaves the game; it opens the app menu (settings, reload, lobby, exit) instead.
     */
    private fun handleBack() {
        web.evaluateJavascript("window.__ikm ? window.__ikm.closeTop() : false") { r ->
            if (r == "true") return@evaluateJavascript
            if (opener != null && !web.canGoBack()) {
                closePopup()
                return@evaluateJavascript
            }
            if (!onGameServer && web.canGoBack()) {
                web.goBack()
                return@evaluateJavascript
            }
            showMenu()
        }
    }

    private fun showMenu() {
        val options = arrayOf(
            "Settings",
            "Reload game",
            "Gameforge lobby (account / other server)",
            "How to play with touch",
            "Log out and clear saved data",
            "Exit app",
        )
        AlertDialog.Builder(this)
            .setTitle("Ikariam Mobile")
            .setItems(options) { _, i ->
                when (i) {
                    0 -> showSettings()
                    1 -> web.reload()
                    2 -> web.loadUrl(Prefs.LOBBY)
                    3 -> showHelp()
                    4 -> confirmClearData()
                    5 -> finish()
                }
            }
            .show()
    }

    private fun confirmClearData() {
        AlertDialog.Builder(this)
            .setTitle("Log out?")
            .setMessage("This removes your saved login and cached game files from this app. You will need to log in again.")
            .setPositiveButton("Log out") { _, _ ->
                CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush() }
                WebStorage.getInstance().deleteAllData()
                web.clearCache(true)
                web.clearHistory()
                web.loadUrl(prefs.serverUrl)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showHelp() {
        AlertDialog.Builder(this)
            .setTitle("Touch controls")
            .setMessage(
                "• Tap: same as a mouse click.\n" +
                "• Hold your finger on something: same as hovering the mouse over it (shows the game's " +
                "info, e.g. income and costs on your gold). Hold and move to drag.\n" +
                "• One finger drag: move the map (kept inside your city / island), drag windows by " +
                "their title bar, drag sliders, scroll lists.\n" +
                "• Two fingers or a double-tap on the map: zoom the map in and out (the game bars never zoom).\n" +
                "• Back (button or swipe): closes the window on top. With nothing open, it opens this menu.\n" +
                "• Portrait: type straight into the game's boxes with the normal keyboard. " +
                "Landscape: tapping a text box opens a big editor."
            )
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showSettings() {
        val pad = dp(20)
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, dp(8), pad, 0) }
        fun header(t: String) = TextView(this).apply {
            text = t; setTextColor(GOLD); textSize = 13f; setPadding(0, dp(14), 0, dp(4))
        }

        // Server address
        val server = EditText(this).apply {
            setText(prefs.serverUrl)
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            textSize = 14f
        }
        box.addView(header("Game server address"))
        box.addView(server)

        // Game size (landscape)
        val sizes = listOf(
            950 to "Largest (easiest to tap)",
            1100 to "Large",
            1250 to "Medium",
            1400 to "Small (see more)",
            1600 to "Smallest",
        )
        box.addView(header("Game size in landscape"))
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
        val orients = listOf("portrait" to "Portrait", "auto" to "Follow phone rotation", "landscape" to "Landscape")
        box.addView(header("Screen rotation"))
        val orientGroup = RadioGroup(this)
        val orientButtons = orients.map { (key, label) ->
            RadioButton(this).apply { id = View.generateViewId(); text = label; tag = key }.also {
                orientGroup.addView(it)
                if (key == prefs.orientation) it.isChecked = true
            }
        }
        box.addView(orientGroup)

        // Toggles
        box.addView(header("Options"))
        fun check(label: String, value: Boolean) = CheckBox(this).apply { text = label; isChecked = value }.also { box.addView(it) }
        val cFull = check("Full screen (behind status bar and camera)", prefs.fullscreen)
        val cAwake = check("Keep screen on while playing", prefs.keepScreenOn)
        val cTouch = check("Touch fixes (drag map, hold = hover)", prefs.touchFix)
        val cComposer = check("Big text editor in landscape", prefs.composer)
        val cDesktop = check("Desktop mode (full game site)", prefs.desktopMode)

        val scroll = ScrollView(this).apply { addView(box) }

        AlertDialog.Builder(this)
            .setTitle("Settings")
            .setView(scroll)
            .setPositiveButton("Save") { _, _ ->
                val newServer = normalizeUrl(server.text.toString())
                val serverChanged = newServer != null && newServer != prefs.serverUrl
                if (newServer != null) prefs.serverUrl = newServer

                prefs.uiWidth = sizeButtons.firstOrNull { it.isChecked }?.tag as? Int ?: prefs.uiWidth
                prefs.orientation = orientButtons.firstOrNull { it.isChecked }?.tag as? String ?: prefs.orientation
                prefs.fullscreen = cFull.isChecked
                prefs.keepScreenOn = cAwake.isChecked
                prefs.touchFix = cTouch.isChecked
                prefs.composer = cComposer.isChecked
                val uaChanged = cDesktop.isChecked != prefs.desktopMode
                prefs.desktopMode = cDesktop.isChecked

                applyWindowPrefs()
                pushConfig()
                if (uaChanged) applyUserAgent(web.settings)
                when {
                    serverChanged -> web.loadUrl(prefs.serverUrl)
                    uaChanged -> web.reload()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun normalizeUrl(input: String): String? {
        var s = input.trim()
        if (s.isEmpty()) return null
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
        val uri = Uri.parse(s)
        if (uri.host.isNullOrEmpty()) return null
        if (uri.path.isNullOrEmpty()) s += "/"
        return s
    }

    companion object {
        /** Game world hosts look like s66-ae.ikariam.gameforge.com */
        val GAME_HOST = Regex("^s\\d+-[a-z]+\\.ikariam\\.gameforge\\.com$", RegexOption.IGNORE_CASE)
        val ART_NAME = Regex("^[A-Za-z0-9_.-]+$")
    }
}
