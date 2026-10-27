package app.opentodo

import app.opentodo.SignInFlow.Decision.BROWSER
import app.opentodo.SignInFlow.Decision.STAY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The navigation rule of the app's web view (android-sign-in-flows). */
class SignInFlowTest {
    private val server = "https://todo.example.com"
    private var now = 1_000_000L
    private val flow = SignInFlow(server) { now }

    private fun link(url: String) = flow.decide(url, isRedirect = false, hasGesture = true)
    private fun redirect(url: String) = flow.decide(url, isRedirect = true, hasGesture = false)
    private fun script(url: String) = flow.decide(url, isRedirect = false, hasGesture = false)

    @Test fun theServerAlwaysStays() {
        assertEquals(STAY, link("https://todo.example.com/today"))
        assertEquals(STAY, link("https://TODO.example.com:443/?task=1"))
        assertEquals(STAY, redirect("https://todo.example.com/"))
        assertFalse(flow.inSignIn)
    }

    @Test fun linksToOtherSitesOpenTheBrowser() {
        assertEquals(BROWSER, link("https://example.org/outside"))
        assertEquals(BROWSER, script("https://example.org/outside"))
        assertEquals(BROWSER, link("http://todo.example.com/"))
        assertEquals(BROWSER, link("https://todo.example.com:8443/"))
        assertEquals(BROWSER, link("mailto:someone@example.org"))
        assertEquals(BROWSER, link("intent://scan#Intent;end"))
        assertFalse(flow.inSignIn)
    }

    /** Pangolin, Authelia, Cloudflare Access…: the server's address is redirected to the wall's sign-in page. */
    @Test fun loginWallChain() {
        assertEquals(STAY, redirect("https://auth.example.com/login?rd=https://todo.example.com/"))
        assertTrue(flow.inSignIn)
        flow.started("https://auth.example.com/login?rd=https://todo.example.com/")
        // The form on the sign-in page, its own pages, a passkey step, an upstream provider.
        assertEquals(STAY, link("https://auth.example.com/login"))
        assertEquals(STAY, redirect("https://id.example.net/authorize?client_id=wall"))
        flow.started("https://id.example.net/authorize?client_id=wall")
        assertEquals(STAY, script("https://auth.example.com/callback?code=1"))
        // Back on the server: the flow is over.
        assertEquals(STAY, redirect("https://todo.example.com/"))
        flow.started("https://todo.example.com/")
        assertFalse(flow.inSignIn)
        assertEquals(BROWSER, link("https://auth.example.com/settings"))
    }

    /** OpenTodo's own single sign-on: a same-origin link to the start route, then the server's redirect. */
    @Test fun singleSignOn() {
        assertEquals(STAY, link("https://todo.example.com/api/v1/auth/oidc/start"))
        assertEquals(STAY, redirect("https://sso.example.com/authorize?state=x"))
        flow.started("https://sso.example.com/authorize?state=x")
        assertEquals(STAY, link("https://sso.example.com/authorize/consent"))
        assertEquals(STAY, redirect("https://todo.example.com/api/v1/auth/oidc/callback?code=1&state=x"))
        assertFalse(flow.inSignIn)
    }

    @Test fun aLinkOnTheSignInPageToAnotherSiteOpensTheBrowser() {
        redirect("https://auth.example.com/login")
        flow.started("https://auth.example.com/login")
        assertEquals(BROWSER, link("https://example.org/privacy"))
        assertTrue(flow.inSignIn)
        assertEquals(STAY, link("https://auth.example.com/reset"))
    }

    @Test fun aRedirectFromAnotherSiteDoesNotStartAFlow() {
        flow.started("https://example.org/page")
        assertEquals(BROWSER, redirect("https://evil.example.net/"))
        assertFalse(flow.inSignIn)
    }

    @Test fun theFlowTimesOut() {
        redirect("https://auth.example.com/login")
        flow.started("https://auth.example.com/login")
        now += SignInFlow.TIMEOUT_MS - 1
        assertEquals(STAY, link("https://auth.example.com/next"))
        now += SignInFlow.TIMEOUT_MS + 1
        assertFalse(flow.inSignIn)
        // Nothing new after the timeout…
        assertEquals(BROWSER, redirect("https://id.example.net/authorize"))
        assertEquals(BROWSER, script("https://id.example.net/authorize"))
        // …but a form sent late on the sign-in page still works, and the way home too.
        assertEquals(STAY, link("https://auth.example.com/login"))
        assertEquals(STAY, redirect("https://auth.example.com/done"))
        assertFalse(flow.inSignIn)
        assertEquals(STAY, redirect("https://todo.example.com/"))
        flow.started("https://todo.example.com/")
        assertEquals(BROWSER, link("https://auth.example.com/login"))
    }

    @Test fun leavingEndsTheFlow() {
        redirect("https://auth.example.com/login")
        flow.started("https://auth.example.com/login")
        flow.end()
        assertFalse(flow.inSignIn)
        assertEquals(BROWSER, script("https://id.example.net/authorize"))
        // The server's address again (the bar's close button): its wall starts a new flow.
        flow.started("https://todo.example.com/")
        assertEquals(STAY, redirect("https://auth.example.com/login"))
    }

    @Test fun theHiddenRunNeverLeaves() {
        assertTrue(SignInFlow.hiddenRunStays("https://todo.example.com/?reminder=1", server))
        assertFalse(SignInFlow.hiddenRunStays("https://auth.example.com/login", server))
    }

    @Test fun origins() {
        assertEquals("https://todo.example.com", SignInFlow.originOf("https://Todo.Example.com:443/a?b#c"))
        assertEquals("http://localhost:8080", SignInFlow.originOf("http://localhost:8080/"))
        assertEquals("http://[::1]:8080", SignInFlow.originOf("http://[::1]:8080/x"))
        assertNull(SignInFlow.originOf("about:blank"))
        assertNull(SignInFlow.originOf("javascript:alert(1)"))
        assertEquals("auth.example.com:8443", SignInFlow.hostOf("https://auth.example.com:8443/login"))
    }
}
