package app.opentodo

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.Executors

/**
 * First-run sign-in through a login wall (android-sign-in-flows): the server's address in a
 * web view with the same navigation rule as the app ([SignInFlow]) and no bridge. Each time a
 * page of the server finishes loading, the health check runs again with the web view's
 * cookies; once it passes, the screen closes with RESULT_OK. The close button and back
 * (with no page to go back to) cancel.
 */
class SignInActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var siteHost: TextView
    private lateinit var origin: String
    private lateinit var flow: SignInFlow
    private val io = Executors.newSingleThreadExecutor()
    private var checking = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        origin = intent.getStringExtra(EXTRA_ORIGIN)?.let { SignInFlow.originOf(it) } ?: return finish()
        flow = SignInFlow(origin)
        setContentView(R.layout.activity_sign_in)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.sign_in_root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        findViewById<View>(R.id.site_bar).visibility = View.VISIBLE
        siteHost = findViewById(R.id.site_host)
        findViewById<View>(R.id.site_close).setOnClickListener { cancel() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else cancel() }
        })
        web = findViewById(R.id.web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            // The same user agent as the app's web view, for walls that tie a session to it.
            userAgentString = "$userAgentString OpenTodoAndroid/${BuildConfig.VERSION_NAME}"
        }
        web.webViewClient = Client()
        web.loadUrl("$origin/")
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdown()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    private fun cancel() {
        setResult(RESULT_CANCELED)
        finish()
    }

    /** Through the wall when the health check passes with the web view's cookies. */
    private fun checkThrough() {
        if (checking || isFinishing) return
        checking = true
        CookieManager.getInstance().flush()
        val cookies = CookieManager.getInstance().getCookie("$origin/healthz")
        io.execute {
            val answer = HealthCheck.check(origin, cookies)
            runOnUiThread {
                checking = false
                if (answer.outcome == HealthCheck.Outcome.OK && !isFinishing) { setResult(RESULT_OK); finish() }
            }
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val stays = if (request.isForMainFrame) flow.decide(request.url.toString(), request.isRedirect, request.hasGesture()) == SignInFlow.Decision.STAY
            else SignInFlow.originOf(request.url.toString()) == origin
            if (stays) return false
            // A refused redirect never goes to the browser (the session would land there): the
            // sign-in page stays, and the bar's close button cancels.
            if (request.isForMainFrame && request.isRedirect) return true
            val url = request.url.toString()
            if (Bridge.safeExternal(url)) {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            if (url == null) return
            flow.started(url)
            siteHost.text = getString(R.string.site_bar_host, SignInFlow.hostOf(url))
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (url != null && SignInFlow.originOf(url) == origin) checkThrough()
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            // Never bypassed (native-shells D3).
            handler.cancel()
            cancel()
        }
    }

    companion object {
        const val EXTRA_ORIGIN = "origin"
    }
}
