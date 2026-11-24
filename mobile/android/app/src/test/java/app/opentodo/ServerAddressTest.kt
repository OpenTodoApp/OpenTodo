package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The address rules both shells share: server-address/cases.json, which the iPhone app's ServerAddressTests read too. */
class ServerAddressTest {
    private val doc = JSONObject(javaClass.classLoader!!.getResource("server-address/cases.json")!!.readText(Charsets.UTF_8))

    @Test fun sharedCases() {
        val cases = doc.getJSONArray("parse")
        assertTrue("the fixture has cases", cases.length() > 0)
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val input = c.getString("input")
            val expected = when {
                c.has("ok") -> ServerAddress.Result.Ok(c.getString("ok"), c.getBoolean("insecure"))
                c.has("needsHttps") -> ServerAddress.Result.NeedsHttps(c.getString("needsHttps"))
                c.optBoolean("invalid") -> ServerAddress.Result.Invalid
                else -> throw AssertionError("case ${i + 1}: no expected result")
            }
            assertEquals("\"$input\"", expected, ServerAddress.parse(input))
        }
    }

    @Test fun localHosts() {
        val local = doc.getJSONArray("local")
        val notLocal = doc.getJSONArray("notLocal")
        assertTrue(local.length() > 0 && notLocal.length() > 0)
        for (i in 0 until local.length()) assertTrue(local.getString(i), ServerAddress.isLocal(local.getString(i)))
        for (i in 0 until notLocal.length()) assertFalse(notLocal.getString(i), ServerAddress.isLocal(notLocal.getString(i)))
    }

    @Test fun homeOnlyAddresses() {
        for (a in listOf("http://192.168.1.10:8080", "10.0.0.4", "http://172.20.1.1", "homeassistant.local:8080", "http://localhost:8080", "https://[fd00::1]"))
            assertTrue(a, ServerAddress.homeOnly(a))
        // Tailscale and CGNAT addresses, MagicDNS names and public hosts work away from home.
        for (a in listOf("http://100.101.102.103:8080", "https://homeassistant.tail1234.ts.net", "homeassistant", "todo.example.com", "http://todo.example.com", "", "not an address"))
            assertFalse(a, ServerAddress.homeOnly(a))
    }
}
