package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** app-sso-system-browser: the rules of single sign-on in the system browser. */
class SystemSignInTest {
    private val server = "https://todo.example.com"

    @Test fun challengeIsS256() {
        // RFC 7636, appendix B.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", SystemSignIn.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
        val p = SystemSignIn.pending()
        assertEquals(43, p.verifier.length)
        assertEquals(SystemSignIn.challenge(p.verifier), p.challenge)
        assertNotEquals(p.state, SystemSignIn.pending().state)
    }

    @Test fun onlyTheServersStartRouteGoesToTheBrowser() {
        assertTrue(SystemSignIn.isStart("https://todo.example.com/api/v1/auth/oidc/start", server))
        assertFalse(SystemSignIn.isStart("https://todo.example.com/api/v1/auth/oidc/start?app_challenge=x&app_state=y", server))
        assertFalse(SystemSignIn.isStart("https://sso.example.com/api/v1/auth/oidc/start", server))
        assertFalse(SystemSignIn.isStart("https://todo.example.com/api/v1/auth/oidc/callback", server))
        assertEquals("https://todo.example.com/api/v1/auth/oidc/start?app_challenge=c&app_state=s&app_mode=login",
            SystemSignIn.startUrl(server, SystemSignIn.Pending("v", "c", "s")))
    }

    @Test fun theModeTheWebAppAskedForIsPassedOn() {
        assertTrue(SystemSignIn.isLink("https://todo.example.com/api/v1/auth/oidc/start?mode=link"))
        assertFalse(SystemSignIn.isLink("https://todo.example.com/api/v1/auth/oidc/start"))
        assertFalse(SystemSignIn.isLink("https://todo.example.com/api/v1/auth/oidc/start?mode=links"))
        assertEquals("https://todo.example.com/api/v1/auth/oidc/start?app_challenge=c&app_state=s&app_mode=link",
            SystemSignIn.startUrl(server, SystemSignIn.Pending("v", "c", "s"), link = true))
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

    @Test fun outcome() {
        fun outcome(s: String) = SystemSignIn.outcome(s, "st")
        assertEquals(SystemSignIn.Outcome.Code("abc_-1"), outcome("opentodo://sso?code=abc_-1&state=st"))
        assertEquals(SystemSignIn.Outcome.Error("oidc_failed"), outcome("opentodo://sso?error=oidc_failed&state=st"))
        assertEquals(SystemSignIn.Outcome.Cancelled, outcome("opentodo://sso?state=st"))
        assertEquals(SystemSignIn.Outcome.Invalid, outcome("opentodo://sso?state=other"))
        assertEquals("a malformed code is not a cancel", SystemSignIn.Outcome.Invalid, outcome("opentodo://sso?code=a'b&state=st"))
        assertEquals(SystemSignIn.Outcome.Invalid, outcome("opentodo://sso?code=abc&state=other"))
        assertEquals(SystemSignIn.Outcome.Invalid, outcome("opentodo://sso?code=abc"))
        assertEquals(SystemSignIn.Outcome.Invalid, outcome("opentodo://task/abc?code=abc&state=st"))
        assertEquals("only plain tokens reach the page's script", SystemSignIn.Outcome.Invalid, outcome("opentodo://sso?code=a'%3Balert(1)&state=st"))
    }

    @Test fun healthAnnouncesAppFlows() {
        assertTrue(SystemSignIn.supported("""{"status":"ok","version":"1","app_sso":true}"""))
        assertFalse(SystemSignIn.supported("""{"status":"ok","version":"1"}"""))
        assertFalse(SystemSignIn.supported("not json"))
    }

    @Test fun redeemScriptNamesTheRouteAndValues() {
        val script = SystemSignIn.redeemScript("c0de", "v3r")
        assertTrue(script.contains("'/api/v1/auth/oidc/app-session'"))
        assertTrue(script.contains("code: 'c0de', code_verifier: 'v3r'"))
        assertEquals("https://todo.example.com/?error=signup_closed", SystemSignIn.errorUrl(server, "signup_closed"))
    }
}
