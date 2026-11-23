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
}
