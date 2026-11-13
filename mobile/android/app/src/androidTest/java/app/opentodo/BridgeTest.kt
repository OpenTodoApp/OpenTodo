package app.opentodo

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.webkit.WebView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.lifecycle.Lifecycle
import androidx.test.espresso.Espresso.pressBack
import androidx.test.espresso.Espresso.pressBackUnconditionally
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.ServerSocket

/** Task 4.3: the web view, and the bridge on the configured origin only (native-shells D5). */
@RunWith(AndroidJUnit4::class)
class BridgeTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    private lateinit var server: FakeServer
    private val others = mutableListOf<FakeServer>()

    @Before fun setUp() {
        resetApp()
        allowExactAlarms()
        server = FakeServer()
        Prefs(context).server = server.origin
    }

    @After fun tearDown() {
        // A failed setUp leaves no server; the report then shows setUp's error, not this one.
        if (::server.isInitialized) server.shutdown()
        others.forEach { it.shutdown() }
        resetApp()
    }

    private fun open(): Pair<ActivityScenario<MainActivity>, WebView> {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        server.waitForPath("/")
        // The server's page itself: until it commits, the new web view's initial blank document
        // already reports readyState "complete". A test that loaded another page then cancelled
        // the first one before it reached the history, and back left the app
        // (backGoesBackInTheWebView: "Pressed back and killed the app" on two main runs).
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        web.waitForJs("document.readyState", "\"complete\"")
        return scenario to web
    }

    @Test fun theBridgeIsThereOnTheServersOrigin() {
        val (_, web) = open()
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        assertEquals("1", web.js("window.opentodoShell.bridge"))
        assertEquals("\"android\"", web.js("window.opentodoShell.platform"))
        val caps = web.js("window.opentodoShell.capabilities.join(',')")
        for (c in listOf("reminders", "widgets", "share", "links", "obsidian-links", "microphone", "files", "haptics")) assertTrue("capability $c in $caps", caps.contains(c))
    }

    @Test fun aCallAnswersThroughTheMessageChannel() {
        val (_, web) = open()
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        web.js("window.__r = null; window.opentodoShell.scheduleReminders('[]').then(function (r) { window.__r = r }); 0")
        web.waitForJs("window.__r", "\"granted\"")
    }

    @Test fun noBridgeOnAnotherOrigin() {
        val other = FakeServer().also { others += it }
        val (_, web) = open()
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        InstrumentationRegistry.getInstrumentation().runOnMainSync { web.loadUrl(other.origin + "/elsewhere") }
        other.waitForPath("/elsewhere")
        web.waitForJs("location.pathname", "\"/elsewhere\"")
        web.waitForJs("document.readyState", "\"complete\"")
        assertEquals("\"undefined\"", web.js("typeof window.opentodoShell"))
        assertEquals("\"undefined\"", web.js("typeof window.opentodoNative"))
    }

    @Test fun linksToOtherSitesOpenTheSystemBrowser() {
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_VIEW)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, null))
            val (_, web) = open()
            val outside = Uri.parse("https://example.org/outside")
            // On the test thread: Espresso refuses getIntents() on the main thread.
            fun browserOpened() = Intents.getIntents().any { it.action == Intent.ACTION_VIEW && it.data == outside }
            // A scripted click can be lost while a slow emulator still settles the page (a main run
            // timed out here once), and intended() fails when the intent was recorded twice: click
            // again every 5 seconds until one browser intent is there, however many there are.
            var clickedAt = 0L
            waitUntil("the browser intent", timeoutMs = 30_000) {
                if (System.currentTimeMillis() - clickedAt > 5_000) {
                    web.js("document.getElementById('out').click(); 0")
                    clickedAt = System.currentTimeMillis()
                }
                browserOpened()
            }
            assertEquals("\"/\"", web.js("location.pathname"))
        } finally {
            Intents.release()
        }
    }

    @Test fun backGoesBackInTheWebView() {
        val (_, web) = open()
        InstrumentationRegistry.getInstrumentation().runOnMainSync { web.loadUrl(server.origin + "/b") }
        server.waitForPath("/b")
        web.waitForJs("location.pathname", "\"/b\"")
        pressBack()
        web.waitForJs("location.pathname", "\"/\"")
    }

    /** shell-repairs D4: Back that left the app still goes back in it when the app is shown again. */
    @Test fun backStillGoesBackAfterLeavingTheApp() {
        val (scenario, web) = open()
        // The first screen: Back sends the app to the background and keeps the activity.
        pressBackUnconditionally()
        waitUntil("the app in the background") { scenario.state == Lifecycle.State.CREATED }
        shell("am start -n ${context.packageName}/${MainActivity::class.java.name}")
        waitUntil("the app shown again") { scenario.state == Lifecycle.State.RESUMED }
        InstrumentationRegistry.getInstrumentation().runOnMainSync { web.loadUrl(server.origin + "/b") }
        server.waitForPath("/b")
        web.waitForJs("location.pathname", "\"/b\"")
        pressBack()
        web.waitForJs("location.pathname", "\"/\"")
        assertEquals(Lifecycle.State.RESUMED, scenario.state)
    }

    /** shell-repairs D2: a file the page saves goes through the save dialog; its answer reaches the page. */
    @Test fun aSavedFileIsWrittenWhereTheDialogSays() {
        val target = File(context.cacheDir, "bridge-test-saved.txt").apply { delete() }
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT))
                .respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, Intent().setData(Uri.fromFile(target))))
            val (_, web) = open()
            web.waitForJs("typeof window.opentodoShell", "\"object\"")
            web.js(
                "window.__a = null; window.__b = null;" +
                    "window.opentodoShell.saveFile(JSON.stringify({id:'t',name:'../a.txt',type:'text/plain',data:'aGk=',last:false}))" +
                    ".then(function (r) { window.__a = r; return window.opentodoShell.saveFile(JSON.stringify({id:'t',name:'../a.txt',type:'text/plain',data:'IQ==',last:true})) })" +
                    ".then(function (r) { window.__b = r }); 0",
            )
            web.waitForJs("window.__b", "\"saved\"")
            assertEquals("\"more\"", web.js("window.__a"))
            assertEquals("hi!", target.readText())
            val asked = Intents.getIntents().single { it.action == Intent.ACTION_CREATE_DOCUMENT }
            assertEquals("a.txt", asked.getStringExtra(Intent.EXTRA_TITLE))
            assertEquals("text/plain", asked.type)
            waitUntil("the cache copy gone") { FileSaver.dir(context).listFiles().isNullOrEmpty() }
        } finally {
            Intents.release()
            target.delete()
        }
    }

    @Test fun aCancelledOrMalformedSaveSaysSoAndKeepsNothing() {
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null))
            val (_, web) = open()
            web.waitForJs("typeof window.opentodoShell", "\"object\"")
            web.js("window.__c = null; window.opentodoShell.saveFile(JSON.stringify({id:'c',name:'a.txt',type:'text/plain',data:'aGk=',last:true})).then(function (r) { window.__c = r }); 0")
            web.waitForJs("window.__c", "\"cancelled\"")
            web.js("window.__m = null; window.opentodoShell.saveFile('not json').then(function (r) { window.__m = r }); 0")
            web.waitForJs("window.__m", "\"failed\"")
            // An unknown kind of haptic feedback is ignored, and a known one needs nothing.
            web.js("window.opentodoShell.haptic('warning'); window.opentodoShell.haptic('tick'); 0")
            waitUntil("the cache copy gone") { FileSaver.dir(context).listFiles().isNullOrEmpty() }
        } finally {
            Intents.release()
        }
    }

    @Test fun anUnreachableServerShowsTheOfflineScreen() {
        val port = ServerSocket(0).use { it.localPort }
        Prefs(context).server = "http://localhost:$port"
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        waitUntil("the offline screen") {
            var shown = false
            scenario.onActivity { a ->
                shown = a.findViewById<View>(R.id.error).visibility == View.VISIBLE &&
                    a.findViewById<TextView>(R.id.error_text).text == a.getString(R.string.error_offline)
            }
            shown
        }
    }
}
