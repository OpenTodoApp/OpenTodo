package app.opentodo

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject

/**
 * The bridge, version 1 (native-shells D5): a web message listener and a document-start
 * script, both restricted to the configured origin, so no other page sees
 * `window.opentodoShell`. The activity is the [Host] for what needs a screen (permission
 * prompts, the biometric prompt, the system browser); the hidden background run has none,
 * so it offers only reminders and widgets.
 */
class Bridge(private val context: Context, private val origin: String, private val host: Host?) {
    interface Host {
        fun requestNotificationPermission(done: (Boolean) -> Unit)
        fun requestExactAlarms()
        fun biometricStore(key: ByteArray, done: (Boolean) -> Unit)
        fun biometricRead(done: (ByteArray?) -> Unit)
        fun openExternal(url: String)
    }

    private val main = Handler(Looper.getMainLooper())

    fun capabilities(): List<String> {
        val caps = mutableListOf("reminders", "widgets")
        if (host != null) {
            caps += listOf("share", "links")
            if (BiometricKeyStore.available(context)) caps += "biometric"
        }
        return caps
    }

    /** False on a WebView too old for origin-restricted injection: the app then runs as the plain web app. */
    fun install(webView: WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        val rules = setOf(origin)
        WebViewCompat.addWebMessageListener(webView, "opentodoNative", rules) { _, message, sourceOrigin, isMainFrame, reply ->
            if (isMainFrame && originOf(sourceOrigin) == origin) handle(message.data ?: return@addWebMessageListener, reply)
        }
        WebViewCompat.addDocumentStartJavaScript(webView, script(BuildConfig.VERSION_NAME, capabilities()), rules)
        return true
    }

    private fun handle(raw: String, reply: JavaScriptReplyProxy) {
        if (raw.length > MAX_MESSAGE) return
        val msg = try { JSONObject(raw) } catch (e: Exception) { return }
        val id = msg.optInt("id", 0)
        val args = msg.optJSONArray("args") ?: JSONArray()
        val answer = { value: Any? -> if (id > 0) main.post { reply.postMessage(JSONObject().put("id", id).put("result", value ?: JSONObject.NULL).toString()) } }
        when (msg.optString("method")) {
            "scheduleReminders" -> scheduleReminders(args.optString(0, "[]"), answer)
            "testNotification" -> answer(Notifier.test(context))
            "publishWidget" -> WidgetStore.publish(context, args.optString(0, ""))
            "biometricStore" -> {
                val key = try { android.util.Base64.decode(args.optString(0), android.util.Base64.NO_WRAP) } catch (e: IllegalArgumentException) { null }
                if (host == null || key == null || key.size != 32) answer(false) else host.biometricStore(key) { ok -> key.fill(0); answer(ok) }
            }
            "biometricRead" -> if (host == null) answer(null) else host.biometricRead { key ->
                answer(key?.let { android.util.Base64.encodeToString(it, android.util.Base64.NO_WRAP).also { _ -> it.fill(0) } })
            }
            "biometricForget" -> BiometricKeyStore.forget(context)
            "openExternal" -> args.optString(0).takeIf { safeExternal(it) }?.let { host?.openExternal(it) }
        }
    }

    private fun scheduleReminders(json: String, answer: (Any?) -> Unit) {
        Scheduler.replace(context, json)
        val wantsAlarms = json.trim() != "[]"
        fun afterPermission(granted: Boolean) {
            if (!granted) return answer("denied")
            if (Scheduler.canExact(context)) return answer("granted")
            val prefs = Prefs(context)
            if (host != null && !prefs.exactAlarmAsked) { prefs.exactAlarmAsked = true; host.requestExactAlarms() }
            answer("exact-denied")
        }
        if (Scheduler.notificationsAllowed(context) || !wantsAlarms || host == null) afterPermission(Scheduler.notificationsAllowed(context))
        else host.requestNotificationPermission { afterPermission(it) }
    }

    companion object {
        const val VERSION = 1
        private const val MAX_MESSAGE = 2 * 1024 * 1024

        fun originOf(uri: Uri): String {
            val scheme = uri.scheme?.lowercase() ?: return ""
            val host = uri.host?.lowercase() ?: return ""
            val h = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
            val port = uri.port
            val def = if (scheme == "https") 443 else 80
            return "$scheme://$h" + if (port == -1 || port == def) "" else ":$port"
        }

        fun safeExternal(url: String): Boolean {
            val scheme = Uri.parse(url).scheme?.lowercase()
            return scheme == "https" || scheme == "http" || scheme == "mailto" || scheme == "tel"
        }

        /** The page side: `window.opentodoShell`, promise-returning methods over the message channel. */
        fun script(app: String, caps: List<String>): String = """
            (function () {
              if (window.opentodoShell || !window.opentodoNative) return;
              var nat = window.opentodoNative, seq = 0, waiting = {};
              nat.onmessage = function (e) {
                var m; try { m = JSON.parse(e.data) } catch (x) { return }
                var w = waiting[m.id]; if (w) { delete waiting[m.id]; w(m.result) }
              };
              function call(method, args) {
                return new Promise(function (resolve) { var id = ++seq; waiting[id] = resolve; nat.postMessage(JSON.stringify({ id: id, method: method, args: args })) });
              }
              function send(method, args) { nat.postMessage(JSON.stringify({ method: method, args: args })) }
              window.opentodoShell = Object.freeze({
                bridge: $VERSION, platform: 'android', app: ${JSONObject.quote(app)},
                capabilities: Object.freeze(${JSONArray(caps)}),
                scheduleReminders: function (json) { return call('scheduleReminders', [String(json)]) },
                testNotification: function () { return call('testNotification', []) },
                publishWidget: function (json) { send('publishWidget', [String(json)]) },
                biometricStore: function (key) { return call('biometricStore', [String(key)]) },
                biometricRead: function () { return call('biometricRead', []) },
                biometricForget: function () { send('biometricForget', []) },
                openExternal: function (url) { send('openExternal', [String(url)]) }
              });
            })();
        """.trimIndent()
    }
}
