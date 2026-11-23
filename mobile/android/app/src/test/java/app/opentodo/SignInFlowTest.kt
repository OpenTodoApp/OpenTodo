package app.opentodo

import app.opentodo.SignInFlow.Decision.BROWSER
import app.opentodo.SignInFlow.Decision.STAY
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The navigation rule of the app's web view (android-sign-in-flows). */
class SignInFlowTest {
    private val server = "https://todo.example.com"
    private val now = 1_000_000L
    private val flow = SignInFlow(server) { now }

    private fun link(url: String) = flow.decide(url, isRedirect = false, hasGesture = true)

    /** The rules both shells share: sign-in/flows.json, which the iPhone app's SignInFlowTests read too. */
    @Test fun sharedCases() {
        val doc = JSONObject(javaClass.classLoader!!.getResource("sign-in/flows.json")!!.readText())
        val cases = doc.getJSONArray("cases")
        assertTrue("the fixture has cases", cases.length() > 0)
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            var clock = 1_000_000L
            val f = SignInFlow(doc.getString("server")) { clock }
            val steps = case.getJSONArray("steps")
            for (j in 0 until steps.length()) {
                val step = steps.getJSONObject(j)
                val where = "${case.getString("name")}, step ${j + 1}: $step"
                when {
                    step.has("link") || step.has("redirect") || step.has("script") -> {
                        val kind = listOf("link", "redirect", "script").first { step.has(it) }
                        val got = f.decide(step.getString(kind), isRedirect = kind == "redirect", hasGesture = kind == "link")
                        assertEquals(where, if (step.getString("expect") == "stay") STAY else BROWSER, got)
                    }
                    step.has("started") -> f.started(step.getString("started"))
                    step.has("end") -> f.end()
                    step.has("inSignIn") -> assertEquals(where, step.getBoolean("inSignIn"), f.inSignIn)
                    step.has("wait") -> clock += when (step.getString("wait")) {
                        "almostTimeout" -> SignInFlow.TIMEOUT_MS - 1
                        "timeoutAndMore" -> SignInFlow.TIMEOUT_MS + 1
                        else -> throw AssertionError("$where: unknown wait")
                    }
                    else -> throw AssertionError("$where: unknown step")
                }
            }
        }
    }

    /** Android only: an intent link from the page is never followed in the web view. */
    @Test fun anIntentLinkOpensOutside() {
        assertEquals(BROWSER, link("intent://scan#Intent;end"))
        assertFalse(flow.inSignIn)
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
