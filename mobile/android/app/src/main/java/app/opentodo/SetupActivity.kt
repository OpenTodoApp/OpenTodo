package app.opentodo

import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.concurrent.Executors

/** First-run screen: the server address, its rules, and the health check with the reason when it fails. */
class SetupActivity : AppCompatActivity() {
    private lateinit var address: EditText
    private lateinit var connect: Button
    private lateinit var alternative: Button
    private lateinit var message: TextView
    private lateinit var progress: ProgressBar
    private val io = Executors.newSingleThreadExecutor()
    private var confirmedInsecure: String? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

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
        connect.setOnClickListener { submit() }
        address.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_GO) { submit(); true } else false }
        Prefs(this).server?.let { address.setText(it) }
    }

    override fun onDestroy() {
        stopWaitingForNetwork()
        io.shutdown()
        super.onDestroy()
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

    private fun check(origin: String) {
        say(null)
        progress.visibility = View.VISIBLE
        connect.isEnabled = false
        io.execute {
            val answer = HealthCheck.check(origin)
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
}
