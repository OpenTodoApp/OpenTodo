package app.opentodo

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.util.concurrent.Executors

/** First-run screen: the server address, its rules, and the health check with the reason when it fails. */
class SetupActivity : AppCompatActivity() {
    private lateinit var address: EditText
    private lateinit var connect: Button
    private lateinit var alternative: Button
    private lateinit var message: TextView
    private lateinit var progress: ProgressBar
    private lateinit var homeOnly: View
    private val io = Executors.newSingleThreadExecutor()
    private var confirmedInsecure: String? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var signInOrigin: String? = null
    private val signIn = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        // Through the wall: the check again, now with the web view's cookies.
        val origin = signInOrigin
        if (r.resultCode == RESULT_OK && origin != null) check(origin)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.setup_root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        address = findViewById(R.id.address)
        connect = findViewById(R.id.connect)
        alternative = findViewById(R.id.alternative)
        message = findViewById(R.id.message)
        progress = findViewById(R.id.progress)
        homeOnly = findViewById(R.id.home_only)
        findViewById<View>(R.id.home_only_link).setOnClickListener { openOutsideHomeGuide() }
        address.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) { showHomeOnly() }
        })
        connect.setOnClickListener { submit() }
        address.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_GO) { submit(); true } else false }
        Prefs(this).server?.let { address.setText(it) }
        showHomeOnly()
        signInOrigin = savedInstanceState?.getString(STATE_SIGN_IN)
        oldWebView()?.let { say(getString(R.string.setup_old_webview, it)) }
    }

    /** The WebView's version when it is older than the tested one or lacks the bridge's features (design risks). */
    private fun oldWebView(): String? {
        val version = WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: return null
        val major = version.substringBefore('.').toIntOrNull() ?: return null
        val features = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        return if (major < MIN_WEBVIEW_MAJOR || !features) version else null
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        signInOrigin?.let { outState.putString(STATE_SIGN_IN, it) }
    }

    override fun onDestroy() {
        stopWaitingForNetwork()
        io.shutdown()
        super.onDestroy()
    }

    /** A notice, never a refusal: an address that only works at home still connects. */
    private fun showHomeOnly() {
        homeOnly.visibility = if (ServerAddress.homeOnly(address.text.toString())) View.VISIBLE else View.GONE
    }

    private fun openOutsideHomeGuide() {
        val view = Intent(Intent.ACTION_VIEW, Uri.parse(OUTSIDE_HOME_GUIDE)).addCategory(Intent.CATEGORY_BROWSABLE)
        try { startActivity(view) } catch (e: ActivityNotFoundException) { /* no browser: the notice stays */ }
    }

    private fun say(text: String?, offer: String? = null) {
        message.text = text ?: ""
        message.visibility = if (text == null) View.GONE else View.VISIBLE
        alternative.visibility = if (offer == null) View.GONE else View.VISIBLE
        if (offer != null) {
            alternative.text = getString(R.string.setup_try, offer)
            alternative.setOnClickListener { address.setText(offer); submit() }
        }
    }

    private fun submit() {
        when (val r = ServerAddress.parse(address.text.toString())) {
            ServerAddress.Result.Invalid -> say(getString(R.string.setup_refused))
            is ServerAddress.Result.NeedsHttps -> say(getString(R.string.setup_needs_https), r.suggestion)
            is ServerAddress.Result.Ok -> {
                if (r.insecure && confirmedInsecure != r.origin) {
                    // Plain http on the local network works, with a warning the user accepts once.
                    confirmedInsecure = r.origin
                    say(getString(R.string.setup_insecure))
                    connect.setText(R.string.setup_connect_anyway)
                    return
                }
                check(r.origin)
            }
        }
    }

    /** Behind a login wall: the explanation and "Sign in here", which opens the server in the sign-in screen. */
    private fun offerSignIn(text: Int, origin: String) {
        say(getString(text))
        alternative.visibility = View.VISIBLE
        alternative.setText(R.string.setup_sign_in)
        alternative.setOnClickListener { signIn.launch(Intent(this, SignInActivity::class.java).putExtra(SignInActivity.EXTRA_ORIGIN, origin)) }
        signInOrigin = origin
    }

    private fun check(origin: String) {
        say(null)
        progress.visibility = View.VISIBLE
        connect.isEnabled = false
        // The web view's cookies: after signing in through a login wall, the check gets through too.
        val cookies = try { CookieManager.getInstance().getCookie("$origin/healthz") } catch (e: Exception) { null }
        io.execute {
            val answer = HealthCheck.check(origin, cookies)
            runOnUiThread {
                progress.visibility = View.GONE
                connect.isEnabled = true
                when (answer.outcome) {
                    HealthCheck.Outcome.OK -> {
                        stopWaitingForNetwork()
                        Prefs(this).server = origin
                        setResult(RESULT_OK)
                        finish()
                    }
                    HealthCheck.Outcome.NO_NETWORK -> { say(getString(R.string.setup_no_network)); retryWhenOnline(origin) }
                    HealthCheck.Outcome.NOT_OPENTODO -> say(getString(R.string.setup_not_opentodo))
                    HealthCheck.Outcome.UNTRUSTED -> say(getString(R.string.setup_untrusted))
                    HealthCheck.Outcome.LOGIN_WALL -> offerSignIn(R.string.setup_login_wall, origin)
                    HealthCheck.Outcome.WEB_PAGE -> offerSignIn(R.string.setup_web_page, origin)
                }
            }
        }
    }

    /** The first start needs a connection: try again by itself when the network returns. */
    private fun retryWhenOnline(origin: String) {
        val cm = getSystemService(ConnectivityManager::class.java)
        // With a network up the server itself is unreachable: no automatic retry loop.
        if (networkCallback != null || cm.activeNetwork != null) return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread { stopWaitingForNetwork(); if (!isFinishing) check(origin) }
            }
        }
        networkCallback = cb
        cm.registerDefaultNetworkCallback(cb)
    }

    private fun stopWaitingForNetwork() {
        val cb = networkCallback ?: return
        networkCallback = null
        try { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(cb) } catch (e: IllegalArgumentException) { /* already gone */ }
    }

    companion object {
        /**
         * The oldest WebView (Chromium) major version the web app draws in: oklch() and
         * color-mix() need 111, the same line as web/public/browser-check.js, so the shell
         * warns before connecting instead of after.
         */
        const val MIN_WEBVIEW_MAJOR = 111
        private const val STATE_SIGN_IN = "signInOrigin"
        const val OUTSIDE_HOME_GUIDE = "https://open-todo.app/docs/self-hosting/home-assistant-addon/#reach-opentodo-from-outside-your-home"
    }
}
