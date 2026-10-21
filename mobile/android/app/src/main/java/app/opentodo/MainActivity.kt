package app.opentodo

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Base64
import android.view.View
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/** The app: the configured server in a full-screen web view, with the bridge on that origin only. */
class MainActivity : AppCompatActivity(), Bridge.Host {
    private lateinit var web: WebView
    private lateinit var errorView: View
    private lateinit var errorText: TextView
    private var origin: String? = null
    private var started = false
    private var pendingShare: Intent? = null
    private var pendingFilesScript: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var permissionDone: ((Boolean) -> Unit)? = null
    private val io = Executors.newSingleThreadExecutor()

    private val setup = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == RESULT_OK) start() else finish()
    }
    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionDone?.invoke(granted && NotificationManagerCompat.from(this).areNotificationsEnabled())
        permissionDone = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        web = findViewById(R.id.web)
        errorView = findViewById(R.id.error)
        errorText = findViewById(R.id.error_text)
        findViewById<Button>(R.id.retry).setOnClickListener { errorView.visibility = View.GONE; web.reload() }
        findViewById<Button>(R.id.change_server).setOnClickListener { confirmChangeServer() }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
        if (Prefs(this).server == null) {
            // A share that arrives before a server is set waits for the first-run screen.
            if (isShare(intent)) pendingShare = intent
            setup.launch(Intent(this, SetupActivity::class.java))
        } else {
            start()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (started) handle(intent) else if (isShare(intent)) pendingShare = intent
    }

    override fun onDestroy() {
        io.shutdown()
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }

    private fun isShare(i: Intent?) = i?.action == Intent.ACTION_SEND || i?.action == Intent.ACTION_SEND_MULTIPLE

    @SuppressLint("SetJavaScriptEnabled")
    private fun start() {
        val server = Prefs(this).server ?: return
        if (!started || origin != server) {
            origin = server
            started = true
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
            web.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                setSupportMultipleWindows(false)
                userAgentString = "$userAgentString OpenTodoAndroid/${BuildConfig.VERSION_NAME}"
            }
            web.webViewClient = Client()
            web.webChromeClient = Chrome()
            Bridge(this, server, this).install(web)
            HiddenRun.schedulePeriodic(this)
        }
        val share = pendingShare
        pendingShare = null
        handle(share ?: intent)
    }

    private fun handle(intent: Intent?) {
        val base = origin ?: return
        when {
            intent?.action == ACTION_CHANGE_SERVER -> { if (web.url == null) web.loadUrl("$base/"); confirmChangeServer() }
            isShare(intent) -> share(intent!!)
            intent?.action == Intent.ACTION_VIEW && intent.data?.scheme == "opentodo-open" -> {
                val path = intent.data?.schemeSpecificPart.orEmpty()
                web.loadUrl(base + if (path.startsWith("/") && !path.startsWith("//")) path else "/")
            }
            web.url == null -> web.loadUrl("$base/")
        }
    }

    // Shares: text and links as the capture screen's address, files as the extension's `opentodo-files` message.
    private fun share(intent: Intent) {
        val base = origin ?: return
        val uris: List<Uri> = when (intent.action) {
            Intent.ACTION_SEND_MULTIPLE -> intentUris(intent)
            else -> listOfNotNull(intentUri(intent))
        }
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        if (uris.isEmpty()) { pendingFilesScript = null; web.loadUrl(base + ShareMapper.path(subject, text, false)); return }
        io.execute {
            val script = filesMessage(uris)
            runOnUiThread {
                pendingFilesScript = script
                web.loadUrl(base + ShareMapper.path(subject, text, script != null))
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun intentUri(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM)

    @Suppress("DEPRECATION")
    private fun intentUris(i: Intent): List<Uri> =
        (if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()

    /** Reads the shared files within the limits into the message the capture screen accepts once. */
    private fun filesMessage(uris: List<Uri>): String? {
        data class Meta(val uri: Uri, val name: String, val size: Long, val type: String)
        val metas = uris.take(ShareMapper.MAX_FILES * 2).map { uri ->
            var name = "file"
            var size = -1L
            try {
                contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        c.getString(0)?.let { name = it }
                        if (!c.isNull(1)) size = c.getLong(1)
                    }
                }
            } catch (e: Exception) { /* unreadable: left out below */ }
            Meta(uri, name, size, contentResolver.getType(uri) ?: "application/octet-stream")
        }
        val files = JSONArray()
        for (i in ShareMapper.accept(metas.map { it.size })) {
            val m = metas[i]
            val bytes = try { contentResolver.openInputStream(m.uri)?.use { it.readBytes() } } catch (e: Exception) { null } ?: continue
            if (bytes.size > ShareMapper.MAX_FILE_BYTES) continue
            files.put(JSONObject().put("name", m.name).put("type", m.type).put("data", "data:${m.type};base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)))
        }
        if (files.length() == 0) return null
        val message = JSONObject().put("type", "opentodo-files").put("files", files)
        // Posted until the capture screen says it took it (like the extension's injected script).
        return "(function(){var m=$message,n=0;function post(){if(document.documentElement.dataset.opentodoFiles==='received'||n++>80)return;" +
            "window.postMessage(m,location.origin);setTimeout(post,250)}post()})();"
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (Bridge.originOf(url) == origin) return false
            openExternal(url.toString())
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            errorView.visibility = View.GONE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            val script = pendingFilesScript ?: return
            if (url != null && Uri.parse(url).path == "/share") {
                pendingFilesScript = null
                view.evaluateJavascript(script, null)
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showError(getString(R.string.error_offline))
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            // Never bypassed: an untrusted certificate is the operator's to fix (native-shells D3).
            handler.cancel()
            showError(getString(R.string.error_untrusted))
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try { chooser.launch(params.createIntent()); true } catch (e: ActivityNotFoundException) { fileCallback = null; false }
        }
    }

    private fun showError(message: String) {
        errorText.text = message
        errorView.visibility = View.VISIBLE
    }

    private fun confirmChangeServer() {
        AlertDialog.Builder(this)
            .setTitle(R.string.change_server)
            .setMessage(R.string.change_server_confirm)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.change_server) { _, _ -> forgetServer(); setup.launch(Intent(this, SetupActivity::class.java)) }
            .show()
    }

    /** "Change server": the old server's storage, schedule, widget data and stored key go. */
    private fun forgetServer() {
        web.loadUrl("about:blank")
        WebStorage.getInstance().deleteAllData()
        CookieManager.getInstance().removeAllCookies(null)
        web.clearCache(true)
        web.clearHistory()
        Scheduler.clear(this)
        NotificationManagerCompat.from(this).cancelAll()
        WidgetStore.clear(this)
        BiometricKeyStore.forget(this)
        HiddenRun.cancel(this)
        Prefs(this).clearServerData(keepServer = false)
        WidgetStore.redraw(this)
        started = false
        origin = null
    }

    // Bridge.Host

    override fun requestNotificationPermission(done: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            done(NotificationManagerCompat.from(this).areNotificationsEnabled())
            return
        }
        permissionDone = done
        notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun requestExactAlarms() {
        if (Build.VERSION.SDK_INT < 31) return
        try { startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))) } catch (e: ActivityNotFoundException) { /* inexact alarms stay */ }
    }

    private fun prompt(cipher: javax.crypto.Cipher, title: Int, done: (javax.crypto.Cipher?) -> Unit) {
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(getString(title))
            .setNegativeButtonText(getString(R.string.biometric_use_passphrase))
            .setAllowedAuthenticators(BIOMETRIC_STRONG)
            .build()
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = done(result.cryptoObject?.cipher)
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = done(null)
        }).authenticate(info, BiometricPrompt.CryptoObject(cipher))
    }

    override fun biometricStore(key: ByteArray, done: (Boolean) -> Unit) {
        val cipher = try { BiometricKeyStore.encryptCipher() } catch (e: Exception) { return done(false) }
        prompt(cipher, R.string.biometric_enable_title) { c ->
            if (c == null) { BiometricKeyStore.forget(this); done(false) } else { BiometricKeyStore.save(this, c, key); done(true) }
        }
    }

    override fun biometricRead(done: (ByteArray?) -> Unit) {
        val cipher = try { BiometricKeyStore.decryptCipher(this) } catch (e: Exception) { null } ?: return done(null)
        prompt(cipher, R.string.biometric_unlock_title) { c -> done(c?.let { BiometricKeyStore.open(this, it) }) }
    }

    override fun openExternal(url: String) {
        if (!Bridge.safeExternal(url)) return
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) } catch (e: ActivityNotFoundException) { /* nothing can open it */ }
    }

    companion object {
        const val ACTION_CHANGE_SERVER = "app.opentodo.CHANGE_SERVER"
    }
}
