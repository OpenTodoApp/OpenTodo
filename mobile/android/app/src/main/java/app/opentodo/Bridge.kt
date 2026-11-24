package app.opentodo

import android.content.Context
import android.net.Uri
import android.os.Build
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
 * so it offers only reminders, widgets, geofences and push (and never asks for a permission,
 * saves a file, gives haptic feedback or starts a distributor's screen). The hidden run passes [backgroundDone], which the
 * web app calls when it has synced and handed over (shell-reminders-on D4): only that run
 * lists the capability `background`.
 */
class Bridge(
    private val context: Context,
    private val origin: String,
    private val host: Host?,
    private val backgroundDone: (() -> Unit)? = null,
) {
    interface Host {
        fun requestNotificationPermission(done: (Boolean) -> Unit)
        /**
         * shell-reminders-on D3: the system page where the user allows exact alarms (API 31+).
         * Only the web app's button leads here; handing over a schedule never does.
         */
        fun openAlarmSettings() {}
        /** The microphone for dictation. The default refuses, so a host without a screen never grants it. */
        fun requestMicrophone(done: (Boolean) -> Unit) { done(false) }
        fun biometricStore(key: ByteArray, done: (Boolean) -> Unit)
        fun biometricRead(done: (ByteArray?) -> Unit)
        fun openExternal(url: String)
        /** app-links D6: a link into another app the page's list allows (checked by the bridge). */
        fun openAppLink(url: String) {}
        /** theme-engine D8: colour the status and navigation bars (main thread). */
        fun setSystemBars(bars: SystemBars) {}
        /** location-reminders D4: fine (with coarse) location; done(true) when either is granted. */
        fun requestLocationPermission(done: (Boolean) -> Unit) = done(false)
        /** "Allow all the time" (Android 10+; on 11+ the system sends the user to the setting). */
        fun requestBackgroundLocation(done: (Boolean) -> Unit) = done(false)
        /**
         * shell-repairs D2: one chunk of a file the page saves ([FileSave]); done gets `more`,
         * or after the last chunk `saved`, `cancelled` or `failed`. The default saves nothing.
         */
        fun saveFile(json: String, done: (String) -> Unit) = done(FileSave.FAILED)
        /** shell-repairs D5: the platform's feedback for a `HapticFeedbackConstants` value (main thread). */
        fun haptic(constant: Int) {}
        fun playCompletionSound() {}
        /**
         * shell-push D5: the link activity of the user's UnifiedPush distributor (main thread);
         * done gets whether it answered RESULT_OK and the app it named. The default starts nothing.
         */
        fun pushLink(done: (Boolean, String?) -> Unit) = done(false, null)
        /** shell-reveal-on-paint D2: the page has drawn its first frame; the launch screen goes (main thread). */
        fun painted() {}
        /** text-size D3: the page applies `textScale` to its root, so the web view's text zoom goes to 100 (main thread). */
        fun textScaleApplied() {}
    }

    private val main = Handler(Looper.getMainLooper())

    fun capabilities(): List<String> = capabilities(BuildConfig.PLAY_BUILD)

    /**
     * geofences also in the hidden run, which hands the regions over hourly (it never asks);
     * never in the Google Play build, which has no location permission (play-location-later).
     */
    fun capabilities(play: Boolean): List<String> = capabilityList(
        play = play,
        hasScreen = host != null,
        background = host == null && backgroundDone != null,
        sdkInt = Build.VERSION.SDK_INT,
        biometric = host != null && BiometricKeyStore.available(context),
    )

    /** False on a WebView too old for origin-restricted injection: the app then runs as the plain web app. */
    fun install(webView: WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        val rules = setOf(origin)
        WebViewCompat.addWebMessageListener(webView, "opentodoNative", rules) { _, message, sourceOrigin, isMainFrame, reply ->
            if (isMainFrame && originOf(sourceOrigin) == origin) handle(message.data ?: return@addWebMessageListener, reply)
        }
        WebViewCompat.addDocumentStartJavaScript(webView, script(BuildConfig.VERSION_NAME, capabilities(), BuildConfig.PLAY_BUILD, context.resources.configuration.fontScale), rules)
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
            "scheduleGeofences" -> scheduleGeofences(args.optString(0, ""), answer)
            "testNotification" -> answer(Notifier.test(context))
            "publishWidget" -> WidgetStore.publish(context, args.optString(0, ""))
            // focus-live-activity D1: the whole session each time; only the visible app has a session to show.
            "publishFocus" -> if (host != null) Focus.publish(context, args.optString(0, ""))
            "biometricStore" -> {
                val key = try { android.util.Base64.decode(args.optString(0), android.util.Base64.NO_WRAP) } catch (e: IllegalArgumentException) { null }
                if (host == null || key == null || key.size != 32) answer(false) else host.biometricStore(key) { ok -> key.fill(0); answer(ok) }
            }
            "biometricRead" -> if (host == null) answer(null) else host.biometricRead { key ->
                answer(key?.let { android.util.Base64.encodeToString(it, android.util.Base64.NO_WRAP).also { _ -> it.fill(0) } })
            }
            "biometricForget" -> BiometricKeyStore.forget(context)
            "openExternal" -> args.optString(0).takeIf { externalLink(it) }?.let { host?.openExternal(it) }
            // app-links D6: only a scheme on the viewer's list the page passes, never a denied one.
            "openAppLink" -> args.optString(0).takeIf { AppLink.allows(AppLink.list(args.optString(1, "[]")), it) }?.let { url -> main.post { host?.openAppLink(url) } }
            "requestMicrophone" -> if (host == null) answer(false) else host.requestMicrophone { answer(it) }
            "saveFile" -> if (host == null) answer(FileSave.FAILED) else host.saveFile(args.optString(0)) { answer(it) }
            // An unknown kind plays tick (haptic-kinds D1); without a screen nothing plays.
            "haptic" -> if (host != null) Haptic.constant(args.optString(0), Build.VERSION.SDK_INT).let { c -> main.post { host.haptic(c) } }
            "playCompletionSound" -> if (host != null && args.length() == 0) main.post { host.playCompletionSound() }
            // Without a screen there is no page to open, and the visible app has no run to end.
            "openAlarmSettings" -> if (host != null) main.post { host.openAlarmSettings() }
            "backgroundDone" -> if (host == null) backgroundDone?.invoke()
            // shell-reveal-on-paint D2: only the visible app has a launch screen to end.
            "painted" -> if (host != null) main.post { host.painted() }
            "textScaleApplied" -> if (host != null) main.post { host.textScaleApplied() }
            // shell-push D5: only the visible app may start the distributor's link screen (host).
            "pushSubscribe" -> args.optString(0).let { vapid -> main.post { Push.subscribe(context, host, vapid) { answer(it) } } }
            "pushState" -> answer(Push.stateJson(context))
            "pushUnsubscribe" -> main.post { Push.forget(context) }
            "setSystemBars" -> if (host != null) {
                // A malformed payload keeps the bars, and nothing of it is logged.
                val json = args.optString(0)
                SystemBars.parse(json)?.let { bars -> Prefs(context).systemBars = json; main.post { host.setSystemBars(bars) } }
            }
        }
    }

    /**
     * Replaces the schedule. The notification permission is asked only for a schedule that is
     * not empty and only with a screen; the exact-alarm setting is never opened from here
     * (shell-reminders-on D3): without it the alarms are inexact and the answer says so.
     */
    private fun scheduleReminders(json: String, answer: (Any?) -> Unit) {
        Scheduler.replace(context, json)
        val wantsAlarms = json.trim() != "[]"
        fun afterPermission(granted: Boolean) = answer(reminderAnswer(granted, Scheduler.canExact(context)))
        if (Scheduler.notificationsAllowed(context) || !wantsAlarms || host == null) afterPermission(Scheduler.notificationsAllowed(context))
        else host.requestNotificationPermission { afterPermission(it) }
    }

    /**
     * location-reminders D3/D4: replaces the watched regions. Only with `ask` and a screen does
     * the shell ask, fine location first, then "Allow all the time"; the answer is the state after.
     */
    private fun scheduleGeofences(json: String, answer: (Any?) -> Unit) {
        val payload = GeofenceSchedule.parse(json)
        val finish: () -> Unit = { answer(Geofences.replace(context, payload.regions)) }
        val h: Host = host ?: return finish()
        // The Play build declares no location permission (play-location-later): it never asks.
        if (BuildConfig.PLAY_BUILD || !payload.ask || !Geofences.available(context)) return finish()
        val askBackground: () -> Unit = {
            if (Geofences.background(context)) finish() else h.requestBackgroundLocation { finish() }
        }
        if (Geofences.fine(context)) askBackground()
        else h.requestLocationPermission { if (Geofences.fine(context)) askBackground() else finish() }
    }

    /** The web view's text zoom (text-size D3): the system's until the page applies the font scale itself. */
    object TextZoom {
        fun of(applied: Boolean, system: Int): Int = if (applied) 100 else system
    }

    companion object {
        const val VERSION = 1
        private const val MAX_MESSAGE = 2 * 1024 * 1024

        /**
         * The capability list, by what the bridge has: geofences never in the Play build,
         * what needs a screen only in the visible app, `background` only in the hidden run.
         */
        fun capabilityList(play: Boolean, hasScreen: Boolean, background: Boolean, sdkInt: Int, biometric: Boolean): List<String> {
            val caps = mutableListOf("reminders", "widgets")
            if (!play) caps += "geofences"
            // shell-push D5: also a background run, which reads pushState to notice a new endpoint.
            caps += "push"
            if (hasScreen) caps += listOf("share", "links", "obsidian-links", "app-links", "system-bars", "microphone", "files", "haptics", "completion-sound", "first-paint", "focus")
            if (alarmSettings(hasScreen, sdkInt)) caps += "alarm-settings"
            if (hasScreen && biometric) caps += "biometric"
            if (background && !hasScreen) caps += "background"
            return caps
        }

        /** `alarm-settings`: a screen to open the page from, and Android 12+ (before it exact alarms need no permission). */
        fun alarmSettings(hasScreen: Boolean, sdkInt: Int): Boolean = hasScreen && sdkInt >= Build.VERSION_CODES.S

        /** What scheduleReminders answers: `denied` without notifications, `exact-denied` when the alarms are inexact. */
        fun reminderAnswer(notifications: Boolean, exact: Boolean): String =
            if (!notifications) "denied" else if (exact) "granted" else "exact-denied"

        fun originOf(uri: Uri): String {
            val scheme = uri.scheme?.lowercase() ?: return ""
            val host = uri.host?.lowercase() ?: return ""
            val h = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
            val port = uri.port
            val def = if (scheme == "https") 443 else 80
            return "$scheme://$h" + if (port == -1 || port == def) "" else ":$port"
        }

        /** The font scale as a JavaScript number: finite and positive, else 1 (the page clamps it). */
        fun textScaleLiteral(scale: Float): String = if (scale.isFinite() && scale > 0f) scale.toString() else "1"

        /** http(s), mailto and tel, and a `geo:` point for the maps app (android-location-and-map). */
        fun safeExternal(url: String): Boolean {
            if (WebLocation.mapLink(url)) return true
            val scheme = Uri.parse(url).scheme?.lowercase()
            return scheme == "https" || scheme == "http" || scheme == "mailto" || scheme == "tel"
        }

        /**
         * What the bridge's openExternal hands to the system: [safeExternal], or an Obsidian
         * note link of the one accepted shape (obsidian-origin, capability `obsidian-links`).
         * Navigation of the web view never opens an Obsidian link: only this method does.
         */
        fun externalLink(url: String): Boolean = safeExternal(url) || ObsidianLink.valid(url)

        /**
         * The page side: `window.opentodoShell`, promise-returning methods over the message channel.
         * text-size D3: `textScale` is the system font scale, which the page applies to its root
         * font size (the web view's own text zoom stays at 100); a change recreates the activity.
         */
        fun script(app: String, caps: List<String>, play: Boolean = false, textScale: Float = 1f): String = """
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
                bridge: $VERSION, platform: 'android', app: ${JSONObject.quote(app)},${if (play) " store: 'play'," else ""}
                capabilities: Object.freeze(${JSONArray(caps)}),
                textScale: ${textScaleLiteral(textScale)},
                scheduleReminders: function (json) { return call('scheduleReminders', [String(json)]) },
                scheduleGeofences: function (json) { return call('scheduleGeofences', [String(json)]) },
                testNotification: function () { return call('testNotification', []) },
                publishWidget: function (json) { send('publishWidget', [String(json)]) },
                publishFocus: function (json) { send('publishFocus', [String(json)]) },
                biometricStore: function (key) { return call('biometricStore', [String(key)]) },
                biometricRead: function () { return call('biometricRead', []) },
                biometricForget: function () { send('biometricForget', []) },
                openExternal: function (url) { send('openExternal', [String(url)]) },
                openAppLink: function (url, schemes) { send('openAppLink', [String(url), String(schemes)]) },
                setSystemBars: function (json) { send('setSystemBars', [String(json)]) },
                requestMicrophone: function () { return call('requestMicrophone', []) },
                saveFile: function (json) { return call('saveFile', [String(json)]) },
                haptic: function (kind) { send('haptic', [String(kind)]) },
                playCompletionSound: function () { send('playCompletionSound', []) },
                openAlarmSettings: function () { send('openAlarmSettings', []) },
                backgroundDone: function () { send('backgroundDone', []) },
                painted: function () { send('painted', []) },
                textScaleApplied: function () { send('textScaleApplied', []) },
                pushSubscribe: function (key) { return call('pushSubscribe', [String(key)]) },
                pushState: function () { return call('pushState', []) },
                pushUnsubscribe: function () { send('pushUnsubscribe', []) }
              });
            })();
        """.trimIndent()
    }
}
