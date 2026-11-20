package app.opentodo

import org.json.JSONArray

/**
 * Links to other apps (OpenSpec change app-links, design D6): a link such as
 * zotero://select/items/ABC is handed to the system only when its scheme is on the
 * list the page passes (the viewer's own) and not on this shell's own deny list.
 * The same rules as internal/origin/applink.go and web/src/lib/appLinkGrammar.ts,
 * pinned by the bridge fixture app-links.json (the shared vectors). Pure Kotlin.
 */
object AppLink {
    private const val MAX_URL = 2048
    private val DENIED = setOf("javascript", "data", "vbscript", "file", "blob", "about", "filesystem", "view-source", "intent", "opentodo")
    private val OWN_RULES = setOf("http", "https", "mailto")
    private val LINK = Regex("^([A-Za-z][A-Za-z0-9+.-]{0,31}):(.+)$")
    private val ENTRY = Regex("^([a-z][a-z0-9+.-]{0,31})(?::([a-z0-9][a-z0-9-]{0,31}))?$")

    /** The lower-cased scheme when [url] is a link into another app, else null. */
    fun scheme(url: String): String? {
        if (url.isEmpty() || url.toByteArray(Charsets.UTF_8).size > MAX_URL) return null
        if (url.any { it.code <= 0x20 || it.code == 0x7f }) return null
        val m = LINK.matchEntire(url) ?: return null
        val s = m.groupValues[1].lowercase()
        return if (s in DENIED || s in OWN_RULES) null else s
    }

    /** Whether [entry] may be on a person's list. */
    fun validEntry(entry: String): Boolean {
        val m = ENTRY.matchEntire(entry) ?: return false
        val s = m.groupValues[1]
        return s !in DENIED && s !in OWN_RULES
    }

    /** Whether [list] lets [url] open: its scheme, or `scheme:action` matching the part before `?`, `/` or `#`. */
    fun allows(list: List<String>, url: String): Boolean {
        val s = scheme(url) ?: return false
        val action = url.substring(s.length + 1).removePrefix("//").split('?', '/', '#').first().lowercase()
        return list.any { e ->
            if (!validEntry(e)) return@any false
            val parts = e.split(':')
            parts[0] == s && (parts.size == 1 || parts[1] == action)
        }
    }

    /** The page's list (a JSON array of strings); empty when it does not parse. */
    fun list(json: String): List<String> = try {
        val a = JSONArray(json)
        (0 until a.length()).mapNotNull { a.optString(it, null) }
    } catch (e: org.json.JSONException) {
        emptyList()
    }
}
