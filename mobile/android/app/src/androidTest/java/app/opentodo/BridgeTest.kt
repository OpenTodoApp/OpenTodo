package app.opentodo

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.view.View
import android.webkit.WebView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.pressBack
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.hasData
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.hamcrest.Matchers.allOf
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
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
        server.shutdown()
        others.forEach { it.shutdown() }
        resetApp()
    }

    private fun open(): Pair<ActivityScenario<MainActivity>, WebView> {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        server.waitForPath("/")
        web.waitForJs("document.readyState", "\"complete\"")
        return scenario to web
    }

    @Test fun theBridgeIsThereOnTheServersOrigin() {
        val (_, web) = open()
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        assertEquals("1", web.js("window.opentodoShell.bridge"))
        assertEquals("\"android\"", web.js("window.opentodoShell.platform"))
        val caps = web.js("window.opentodoShell.capabilities.join(',')")
        for (c in listOf("reminders", "widgets", "share", "links")) assertTrue("capability $c in $caps", caps.contains(c))
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
            web.js("document.getElementById('out').click(); 0")
            waitUntil("the browser intent") {
                try { intended(allOf(hasAction(Intent.ACTION_VIEW), hasData("https://example.org/outside"))); true } catch (e: Throwable) { false }
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
