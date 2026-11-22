package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.net.URLDecoder

/**
 * What a share becomes: the cases in src/test/resources/share/cases.json, which the iOS
 * app's ShareMapTests read too, so both apps map a share the same way.
 */
class ShareMapperTest {
    private val cases: JSONObject by lazy {
        val url = javaClass.classLoader!!.getResource("share/cases.json")
        assertNotNull("missing share/cases.json", url)
        JSONObject(url!!.readText())
    }

    private fun JSONObject.stringOrNull(key: String): String? = if (isNull(key)) null else getString(key)

    /** The decoded query of `/share?…`, as the web app's URLSearchParams reads it. */
    private fun query(path: String): Map<String, String> {
        assertEquals("/share", path.substringBefore('?'))
        val q = path.substringAfter('?', "")
        if (q.isEmpty()) return emptyMap()
        val pairs = q.split('&').map {
            val (k, v) = it.split('=', limit = 2)
            URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
        }
        assertEquals("a parameter appears twice in $path", pairs.size, pairs.map { it.first }.toSet().size)
        return pairs.toMap()
    }

    @Test fun pathsFollowTheSharedCases() {
        val paths = cases.getJSONArray("paths")
        for (i in 0 until paths.length()) {
            val c = paths.getJSONObject(i)
            val want = c.getJSONObject("expect").let { e -> e.keys().asSequence().associateWith { e.getString(it) } }
            val got = ShareMapper.path(c.stringOrNull("title"), c.stringOrNull("text"), c.getBoolean("withFiles"))
            assertEquals("case $i: $c", want, query(got))
        }
    }

    @Test fun limitsFollowTheSharedCases() {
        val accept = cases.getJSONArray("accept")
        for (i in 0 until accept.length()) {
            val c = accept.getJSONObject(i)
            val sizes = c.getJSONArray("sizes").let { a -> (0 until a.length()).map { a.getLong(it) } }
            val want = c.getJSONArray("expect").let { a -> (0 until a.length()).map { a.getInt(it) } }
            assertEquals("case $i: $sizes", want, ShareMapper.accept(sizes))
        }
    }

    @Test fun atMostTenFiles() {
        assertEquals(ShareMapper.MAX_FILES, ShareMapper.accept(List(15) { 1024L }).size)
    }
}
