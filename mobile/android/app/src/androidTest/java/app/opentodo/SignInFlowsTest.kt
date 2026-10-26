package app.opentodo

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebView
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.closeSoftKeyboard
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CopyOnWriteArrayList

/**
 * android-sign-in-flows: a login wall in front of the server (a stand-in for Pangolin,
 * Authelia, oauth2-proxy…) and a stand-in identity provider on another origin. Signing in
 * happens in the app's web view, never in the system browser, and the bridge stays off the
 * provider's pages.
 */
@RunWith(AndroidJUnit4::class)
class SignInFlowsTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    private lateinit var idp: FakeProvider
    private lateinit var server: WalledServer

    @Before fun setUp() {
        resetApp()
        clearCookies()
        allowExactAlarms()
        idp = FakeProvider()
        Intents.init()
        // Anything handed to the system browser is caught here and fails the test below.
        intending(hasAction(Intent.ACTION_VIEW)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, null))
    }

    @After fun tearDown() {
        SignInFlow.timeoutMs = SignInFlow.TIMEOUT_MS
        Intents.release()
        if (::server.isInitialized) server.shutdown()
        idp.shutdown()
        resetApp()
        clearCookies()
    }

    private fun clearCookies() = InstrumentationRegistry.getInstrumentation().runOnMainSync {
        CookieManager.getInstance().removeAllCookies(null)
        CookieManager.getInstance().flush()
    }

    private fun assertNoBrowser() {
        val opened = Intents.getIntents().filter { it.action == Intent.ACTION_VIEW }.map { it.dataString }
        assertTrue("opened in the system browser: $opened", opened.isEmpty())
    }

    private fun openApp(): Pair<ActivityScenario<MainActivity>, WebView> {
        Prefs(context).server = server.origin
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        return scenario to web
    }

    private fun siteBar(scenario: ActivityScenario<MainActivity>): String? {
        var text: String? = null
        scenario.onActivity { a ->
            text = if (a.findViewById<View>(R.id.site_bar).visibility == View.VISIBLE) a.findViewById<TextView>(R.id.site_host).text.toString() else null
        }
        return text
    }

    @Test fun aLoginWallSignsInInsideTheApp() {
        server = WalledServer(idp, wall = true)
        val (scenario, web) = openApp()
        idp.waitFor("GET /login")
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        web.waitForJs("document.readyState", "\"complete\"")
        // The provider's page: no bridge, and the bar names the site.
        assertEquals("\"undefined\"", web.js("typeof window.opentodoShell"))
        assertEquals("\"undefined\"", web.js("typeof window.opentodoNative"))
        waitUntil("the site bar") { siteBar(scenario) == context.getString(R.string.site_bar_host, idp.host) }
        web.js("document.forms[0].submit(); 0")
        idp.waitFor("POST /login")
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        waitUntil("the site bar to go") { siteBar(scenario) == null }
        assertTrue(server.requests.any { it.startsWith("GET /_wall/callback") })
        assertTrue("the wall's cookie is kept", CookieManager.getInstance().getCookie(server.origin)?.contains("wall=ok") == true)
        assertNoBrowser()
    }

    @Test fun singleSignOnCompletesInsideTheApp() {
        server = WalledServer(idp, wall = false)
        val (_, web) = openApp()
        web.waitForJs("document.readyState", "\"complete\"")
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        web.js("document.getElementById('sso').click(); 0")
        idp.waitFor("GET /login")
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        web.waitForJs("document.readyState", "\"complete\"")
        web.js("document.forms[0].submit(); 0")
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        assertTrue(server.requests.any { it.startsWith("GET /api/v1/auth/oidc/callback") })
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        // The provider's page is not left in the back history.
        waitUntil("the sign-in pages out of the history") {
            var back = true
            InstrumentationRegistry.getInstrumentation().runOnMainSync { back = web.canGoBack() }
            !back
        }
        assertNoBrowser()
    }

    @Test fun theSiteBarLeadsBackToTheServer() {
        server = WalledServer(idp, wall = false)
        val (scenario, web) = openApp()
        web.waitForJs("document.readyState", "\"complete\"")
        web.js("document.getElementById('sso').click(); 0")
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        waitUntil("the site bar") { siteBar(scenario) != null }
        onView(withId(R.id.site_close)).perform(click())
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        waitUntil("the site bar to go") { siteBar(scenario) == null }
        assertNoBrowser()
    }

    @Test fun firstRunBehindALoginWall() {
        server = WalledServer(idp, wall = true)
        val scenario = ActivityScenario.launchActivityForResult(SetupActivity::class.java)
        onView(withId(R.id.address)).perform(replaceText(server.origin), closeSoftKeyboard())
        onView(withId(R.id.connect)).perform(click())
        onView(withId(R.id.connect)).perform(click()) // "Connect anyway" (plain http on this device)
        val text = context.getString(R.string.setup_login_wall)
        waitUntil("the login wall message") {
            try { onView(withId(R.id.message)).check(matches(withText(text))); true } catch (e: Throwable) { false }
        }
        onView(withId(R.id.alternative)).check(matches(withText(R.string.setup_sign_in))).perform(click())
        idp.waitFor("GET /login")
        val web = signInWebView()
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        web.waitForJs("document.readyState", "\"complete\"")
        web.js("document.forms[0].submit(); 0")
        // The sign-in screen closes once the check passes, then the first-run screen does too.
        assertEquals(Activity.RESULT_OK, scenario.result.resultCode)
        assertEquals(server.origin, Prefs(context).server)
        assertNoBrowser()
    }

    /**
     * The tester's setup in #471 (Pangolin, Pocket ID, a bypass for `/api/` and `/healthz`): the
     * first-run check passes without signing in, then the app's first page meets the wall. The
     * sign-in must run in the app, not in the browser and not end on a blank screen.
     */
    @Test fun healthBypassedButThePageBehindTheWall() {
        server = WalledServer(idp, wall = true, bypass = true)
        val setup = ActivityScenario.launchActivityForResult(SetupActivity::class.java)
        onView(withId(R.id.address)).perform(replaceText(server.origin), closeSoftKeyboard())
        onView(withId(R.id.connect)).perform(click())
        onView(withId(R.id.connect)).perform(click()) // "Connect anyway"
        assertEquals(Activity.RESULT_OK, setup.result.resultCode)
        assertTrue(idp.requests.isEmpty())
        val (scenario, web) = openApp()
        idp.waitFor("GET /login")
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        web.waitForJs("document.readyState", "\"complete\"")
        waitUntil("the site bar") { siteBar(scenario) == context.getString(R.string.site_bar_host, idp.host) }
        var errorShown = true
        scenario.onActivity { errorShown = it.findViewById<View>(R.id.error).visibility == View.VISIBLE }
        assertTrue("no error over the sign-in page", !errorShown)
        web.js("document.forms[0].submit(); 0")
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        assertNoBrowser()
    }

    /** A sign-in that can't go on (timed out, then sent on to a new site): an error with "Sign in here", never a blank screen or the browser. */
    @Test fun aStuckSignInShowsAnErrorWithSignIn() {
        server = WalledServer(idp, wall = true)
        val (scenario, web) = openApp()
        idp.waitFor("GET /login")
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        web.waitForJs("document.readyState", "\"complete\"")
        SignInFlow.timeoutMs = 1
        Thread.sleep(50)
        web.js("document.forms[1].submit(); 0")
        idp.waitFor("POST /upstream")
        fun shown(id: Int): Boolean { var v = false; scenario.onActivity { v = it.findViewById<View>(id).visibility == View.VISIBLE }; return v }
        waitUntil("the sign-in error") { shown(R.id.error) && shown(R.id.sign_in) }
        scenario.onActivity { assertEquals(it.getString(R.string.error_sign_in), it.findViewById<TextView>(R.id.error_text).text.toString()) }
        assertNoBrowser()
        SignInFlow.timeoutMs = SignInFlow.TIMEOUT_MS
        val before = idp.requests.count { it.startsWith("GET /login") }
        onView(withId(R.id.sign_in)).perform(click())
        waitUntil("a fresh sign-in") { idp.requests.count { it.startsWith("GET /login") } > before }
        web.waitForJs("location.origin", "\"${idp.origin}\"")
        assertTrue(!shown(R.id.error))
        assertNoBrowser()
    }

    private fun signInWebView(): WebView {
        var web: WebView? = null
        waitUntil("the sign-in screen") {
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                web = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
                    .filterIsInstance<SignInActivity>().firstOrNull()?.findViewById(R.id.web)
            }
            web != null
        }
        return web!!
    }
}

/** Records "METHOD /path?query" of every request. */
private fun MockWebServer.recording(into: MutableList<String>, answer: (RecordedRequest, String) -> MockResponse) {
    dispatcher = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            val path = request.path ?: "/"
            into += "${request.method} $path"
            return answer(request, path)
        }
    }
}

private fun page(body: String) = MockResponse().setHeader("Content-Type", "text/html; charset=utf-8").setBody(body)

private fun redirect(to: String) = MockResponse().setResponseCode(302).setHeader("Location", to)

/** A stand-in identity provider on another origin (127.0.0.1 rather than localhost): a sign-in form that sends the person back. */
class FakeProvider {
    private val server = MockWebServer()
    val requests = CopyOnWriteArrayList<String>()
    @Volatile var returnTo: String = ""

    init {
        server.recording(requests) { r, path ->
            when {
                r.method == "GET" && path.startsWith("/login") -> page(
                    "<!doctype html><title>Sign in</title><form method=post action=/login><input name=user value=ann></form>" +
                        "<form method=post action=/upstream><input name=user value=ann></form>" +
                        "<a id=privacy href=\"https://example.org/privacy\">privacy</a>",
                )
                r.method == "POST" && path.startsWith("/login") -> redirect(returnTo)
                // On to an upstream provider on yet another origin.
                r.method == "POST" && path.startsWith("/upstream") -> redirect("https://example.org/upstream")
                else -> MockResponse().setResponseCode(404)
            }
        }
        server.start()
    }

    val host: String get() = "127.0.0.1:${server.port}"
    val origin: String get() = "http://$host"

    fun waitFor(prefix: String) = waitUntil("$prefix at the provider (seen $requests)") { requests.any { it.startsWith(prefix) } }

    fun shutdown() = server.shutdown()
}

/**
 * OpenTodo behind a login wall: without the wall's cookie every request is redirected to the
 * provider, whose form returns to the wall's callback, which sets the cookie. Without the
 * wall it is a plain server with OpenTodo's single sign-on routes.
 */
class WalledServer(private val idp: FakeProvider, private val wall: Boolean, private val bypass: Boolean = false) {
    private val server = MockWebServer()
    val requests = CopyOnWriteArrayList<String>()

    init {
        server.recording(requests) { r, path ->
            // [bypass]: the wall lets `/healthz` and `/api/*` through, as in the issue's Pangolin setup.
            val bypassed = bypass && (path == "/healthz" || path.startsWith("/api/"))
            val through = !wall || bypassed || r.getHeader("Cookie")?.contains("wall=ok") == true
            when {
                path.startsWith("/_wall/callback") -> redirect("/").setHeader("Set-Cookie", "wall=ok; Path=/; Max-Age=86400; HttpOnly")
                !through -> { idp.returnTo = "$origin/_wall/callback?token=1"; redirect("${idp.origin}/login?rd=%2F") }
                path == "/healthz" -> MockResponse().setHeader("Content-Type", "application/json").setBody("""{"status":"ok","version":"0.0.0-test"}""")
                path.startsWith("/api/v1/auth/oidc/start") -> { idp.returnTo = "$origin/api/v1/auth/oidc/callback?code=1"; redirect("${idp.origin}/login?client_id=opentodo") }
                path.startsWith("/api/v1/auth/oidc/callback") -> redirect("/").setHeader("Set-Cookie", "session=1; Path=/; HttpOnly")
                else -> page("<!doctype html><title>OpenTodo test</title><p>$path</p><a id=sso href=\"/api/v1/auth/oidc/start\">SSO</a>")
            }
        }
        server.start()
    }

    val origin: String get() = "http://localhost:${server.port}"

    fun shutdown() = server.shutdown()
}
