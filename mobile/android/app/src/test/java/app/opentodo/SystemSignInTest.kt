package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** app-sso-system-browser: the rules of single sign-on in the system browser. */
class SystemSignInTest {
    /** The rules both apps share: sign-in/system.json, which the iPhone app's SystemSignInTests read too. */
    private val cases: JSONObject by lazy {
        val url = javaClass.classLoader!!.getResource("sign-in/system.json")
        assertNotNull("missing sign-in/system.json", url)
        JSONObject(url!!.readText())
    }

    private fun each(key: String, check: (JSONObject) -> Unit) {
        val list = cases.getJSONArray(key)
        assertTrue("the fixture has $key cases", list.length() > 0)
        for (i in 0 until list.length()) check(list.getJSONObject(i))
    }

    @Test fun challengeIsS256() {
        // RFC 7636, appendix B.
        val vector = cases.getJSONObject("challenge")
        assertEquals(vector.getString("challenge"), SystemSignIn.challenge(vector.getString("verifier")))
        val p = SystemSignIn.pending()
        assertEquals(43, p.verifier.length)
        assertEquals(SystemSignIn.challenge(p.verifier), p.challenge)
        assertNotEquals(p.state, SystemSignIn.pending().state)
    }

    @Test fun onlyTheServersStartRouteGoesToTheBrowser() {
        val server = cases.getString("server")
        each("start") { assertEquals(it.getString("url"), it.getBoolean("start"), SystemSignIn.isStart(it.getString("url"), server)) }
        each("startUrl") {
            val p = SystemSignIn.Pending("v", it.getString("challenge"), it.getString("state"))
            assertEquals(it.getString("url"), SystemSignIn.startUrl(server, p, link = it.getBoolean("link")))
        }
    }

    @Test fun theModeTheWebAppAskedForIsPassedOn() {
        each("link") { assertEquals(it.getString("url"), it.getBoolean("link"), SystemSignIn.isLink(it.getString("url"))) }
    }

    @Test fun outcome() {
        each("outcome") {
            val want = when (it.getString("outcome")) {
                "code" -> SystemSignIn.Outcome.Code(it.getString("value"))
                "error" -> SystemSignIn.Outcome.Error(it.getString("value"))
                "cancelled" -> SystemSignIn.Outcome.Cancelled
                "invalid" -> SystemSignIn.Outcome.Invalid
                else -> fail("unknown outcome ${it.getString("outcome")}")
            }
            assertEquals(it.getString("url"), want, SystemSignIn.outcome(it.getString("url"), it.getString("state")))
        }
    }

    @Test fun healthAnnouncesAppFlows() {
        each("health") { assertEquals(it.getString("body"), it.getBoolean("supported"), SystemSignIn.supported(it.getString("body"))) }
    }

    @Test fun theErrorAddressCarriesTheCode() {
        each("errorUrl") { assertEquals(it.getString("url"), SystemSignIn.errorUrl(cases.getString("server"), it.getString("code"))) }
    }

    @Test fun theSignInOpensInANamedBrowser() {
        val tabs = setOf("com.android.chrome", "org.mozilla.firefox")
        // The default browser, when it has Custom Tabs.
        assertEquals("org.mozilla.firefox", SystemSignIn.browserFor("org.mozilla.firefox", listOf("com.android.chrome", "org.mozilla.firefox"), tabs))
        // A default without Custom Tabs gives way to the first browser that has them.
        assertEquals("com.android.chrome", SystemSignIn.browserFor("com.example.plain", listOf("com.example.plain", "com.android.chrome", "org.mozilla.firefox"), tabs))
        // No default (the chooser would ask): still a named browser with Custom Tabs.
        assertEquals("org.mozilla.firefox", SystemSignIn.browserFor(null, listOf("com.example.plain", "org.mozilla.firefox"), tabs))
        // No browser with Custom Tabs: the default browser by name.
        assertEquals("com.example.plain", SystemSignIn.browserFor("com.example.plain", listOf("com.example.plain"), emptySet()))
        // Neither: nothing, so the app never falls back to the chooser.
        assertNull(SystemSignIn.browserFor(null, listOf("com.example.plain", "com.example.other"), emptySet()))
    }

    @Test fun redeemScriptNamesTheRouteAndValues() {
        val script = SystemSignIn.redeemScript("c0de", "v3r")
        assertTrue(script.contains("'/api/v1/auth/oidc/app-session'"))
        assertTrue(script.contains("code: 'c0de', code_verifier: 'v3r'"))
    }

    /** What each app does around those rules: sign-in/finish.json, which the iPhone app's SystemSignInTests read too. */
    private val finishCases: JSONObject by lazy {
        val url = javaClass.classLoader!!.getResource("sign-in/finish.json")
        assertNotNull("missing sign-in/finish.json", url)
        JSONObject(url!!.readText())
    }

    private fun finishEach(key: String, check: (JSONObject) -> Unit) {
        val list = finishCases.getJSONArray(key)
        assertTrue("the fixture has $key cases", list.length() > 0)
        for (i in 0 until list.length()) check(list.getJSONObject(i))
    }

    @Test fun theStartRouteOpensInTheBrowserOnlyWhenTheServerAnnouncesIt() {
        var both = 0
        finishEach("begin") {
            val status = if (it.isNull("status")) null else it.getInt("status")
            val body = if (it.isNull("body")) null else it.getString("body")
            val browser = if (it.getBoolean("browser")) "com.android.chrome" else null
            val opens = if (SystemSignIn.opensBrowser(status, body, browser)) "browser" else "webView"
            assertEquals(it.getString("case"), it.getString("opens"), opens)
            if (opens == "browser") both++
        }
        assertTrue("a case opens the browser", both > 0)
    }

    @Test fun whatTheAppDoesWhenTheBrowserComesBack() {
        val state = finishCases.getString("state")
        var checked = 0
        finishEach("finish") {
            if (it.isNull("android")) return@finishEach
            val outcome = SystemSignIn.outcome(it.getString("url"), state)
            val step = when (val next = SystemSignIn.finish(outcome, it.getBoolean("onServer"))) {
                is SystemSignIn.Finish.Redeem -> "redeem:${next.code}"
                is SystemSignIn.Finish.RedeemAfterLoad -> "redeemAfterLoad:${next.code}"
                is SystemSignIn.Finish.ShowError -> "error:${next.code}"
                SystemSignIn.Finish.Stay -> "stay"
            }
            assertEquals(it.getString("case"), it.getString("android"), step)
            assertEquals(it.getString("case"), it.getBoolean("ends"), SystemSignIn.ends(outcome))
            checked++
        }
        assertTrue(checked > 0)
    }

    /** The script the iOS tests run against each of the server's answers (an expired code included): the same text here. */
    @Test fun theRedeemScriptIsTheOneBothAppsRun() {
        val r = finishCases.getJSONObject("redeem")
        assertEquals(r.getString("script"), SystemSignIn.redeemScript(r.getString("code"), r.getString("verifier")))
    }
}
