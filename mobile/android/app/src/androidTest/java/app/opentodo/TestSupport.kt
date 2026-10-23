package app.opentodo

import android.app.Activity
import android.content.Context
import android.os.Build
import android.webkit.WebView
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * A stand-in OpenTodo server on the emulator: the health answer, a page per path, and
 * the capture screen's `/share`, which takes the shell's `opentodo-files` message like
 * the web app does. Every request path is recorded.
 */
class FakeServer(https: okhttp3.tls.HandshakeCertificates? = null) {
    val server = MockWebServer()
    val paths = CopyOnWriteArrayList<String>()

    init {
        https?.let { server.useHttps(it.sslSocketFactory(), false) }
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path ?: "/"
                paths += path
                return when {
                    path == "/healthz" -> MockResponse().setHeader("Content-Type", "application/json").setBody("""{"status":"ok","version":"0.0.0-test"}""")
                    path.startsWith("/share") -> html(SHARE_PAGE)
                    else -> html("<!doctype html><title>OpenTodo test</title><p id=path>$path</p><a id=out href=\"https://example.org/outside\">out</a>")
                }
            }
        }
        server.start()
    }

    /** `http://localhost:<port>` (or https): the origin the shell is given. */
    val origin: String get() = server.url("/").toString().removeSuffix("/").replace("127.0.0.1", "localhost")

    fun shutdown() = server.shutdown()

    fun waitForPath(prefix: String, timeoutMs: Long = 20_000): String {
        var found: String? = null
        waitUntil("a request for $prefix (seen ${paths.toList()})", timeoutMs) { found = paths.firstOrNull { it.startsWith(prefix) }; found != null }
        return found!!
    }

    private fun html(body: String) = MockResponse().setHeader("Content-Type", "text/html; charset=utf-8").setBody(body)

    companion object {
        /** Counts the files of the message and says it took them, as ShareCapture does. */
        private const val SHARE_PAGE = "<!doctype html><title>Share</title><script>" +
            "window.__files=-1;window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||e.data.type!=='opentodo-files')return;" +
            "window.__files=e.data.files.length;window.__names=e.data.files.map(function(f){return f.name}).join(',');" +
            "document.documentElement.dataset.opentodoFiles='received'});</script><p>share</p>"
    }
}

val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

fun waitUntil(what: String, timeoutMs: Long = 20_000, ok: () -> Boolean) {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
        if (ok()) return
        Thread.sleep(100)
    }
    throw AssertionError("timed out waiting for $what")
}

/** Evaluates [script] in the web view on the main thread and returns its JSON-encoded result. */
fun WebView.js(script: String): String {
    var out = "null"
    val done = CountDownLatch(1)
    InstrumentationRegistry.getInstrumentation().runOnMainSync { evaluateJavascript(script) { out = it ?: "null"; done.countDown() } }
    if (!done.await(10, TimeUnit.SECONDS)) throw AssertionError("script did not answer: $script")
    return out
}

/** Polls a script until it gives [expected] (JSON-encoded, e.g. `"\"object\""` or `2`). */
fun WebView.waitForJs(script: String, expected: String, timeoutMs: Long = 20_000) {
    var last = ""
    try {
        waitUntil("$script == $expected", timeoutMs) { last = js(script); last == expected }
    } catch (e: AssertionError) {
        throw AssertionError("$script gave $last, expected $expected")
    }
}

/** Runs a shell command as the shell user (appops, appwidget grants) and returns its output. */
fun shell(command: String): String {
    val pfd = InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)
    return android.os.ParcelFileDescriptor.AutoCloseInputStream(pfd).use { it.readBytes().toString(Charsets.UTF_8) }
}

/**
 * Exact alarms on for the app; turning them off is avoided in-process (Android stops the app).
 * Waits until AlarmManager reports the grant: right after `appops set` it can still answer
 * false, which made the bridge answer "exact-denied" on some CI runs.
 */
fun allowExactAlarms() {
    if (Build.VERSION.SDK_INT < 31) return
    val pkg = context.packageName
    var out = shell("appops set $pkg SCHEDULE_EXACT_ALARM allow")
    val deadline = System.currentTimeMillis() + 10_000
    var retried = false
    while (!Scheduler.canExact(context)) {
        if (System.currentTimeMillis() > deadline) {
            throw AssertionError("exact alarms still denied after appops set: $out / ${shell("appops get $pkg SCHEDULE_EXACT_ALARM")}")
        }
        if (!retried && System.currentTimeMillis() > deadline - 7_000) {
            retried = true
            out += shell("appops set --uid $pkg SCHEDULE_EXACT_ALARM allow") + shell("appops set $pkg SCHEDULE_EXACT_ALARM allow")
        }
        Thread.sleep(100)
    }
}

/** Finishes every activity a test left (a notification or a widget can start one outside a scenario). */
fun finishAllActivities() {
    InstrumentationRegistry.getInstrumentation().runOnMainSync {
        for (stage in listOf(Stage.RESUMED, Stage.STARTED, Stage.PAUSED, Stage.STOPPED, Stage.CREATED)) {
            ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(stage).forEach(Activity::finish)
        }
    }
    InstrumentationRegistry.getInstrumentation().waitForIdleSync()
}

/** A clean app: no server, no schedule, no widget data, no stored key, no notifications. */
fun resetApp() {
    finishAllActivities()
    Scheduler.clear(context)
    Prefs(context).clearServerData(keepServer = false)
    context.getSystemService(android.app.NotificationManager::class.java).cancelAll()
}
