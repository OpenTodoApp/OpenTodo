package app.opentodo

import java.net.URLEncoder

/** Maps an Android share to the capture screen's address (the same parameters as the web share target). Pure for tests. */
object ShareMapper {
    const val MAX_FILES = 10
    const val MAX_FILE_BYTES = 20L * 1024 * 1024
    const val MAX_TOTAL_BYTES = 25L * 1024 * 1024
    private const val MAX_TEXT = 10_000

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** `/share?title=…&text=…&url=…`, with `files=1` when files follow as the `opentodo-files` message. */
    fun path(subject: String?, text: String?, withFiles: Boolean): String {
        val params = ArrayList<String>()
        val t = text?.trim()?.take(MAX_TEXT).orEmpty()
        val s = subject?.trim()?.take(500).orEmpty()
        if (s.isNotEmpty()) params += "title=" + enc(s)
        if (t.isNotEmpty()) {
            // A lone link is a link; otherwise text (the capture screen finds links inside text itself).
            if (Regex("""^https?://\S+$""").matches(t)) params += "url=" + enc(t) else params += "text=" + enc(t)
        }
        if (withFiles) params += "files=1"
        return "/share" + if (params.isEmpty()) "" else "?" + params.joinToString("&")
    }

    /** Which of the offered sizes fit the limits, in order; a file over a limit is left out. */
    fun accept(sizes: List<Long>): List<Int> {
        var total = 0L
        val out = ArrayList<Int>()
        for ((i, size) in sizes.withIndex()) {
            if (out.size >= MAX_FILES) break
            if (size < 0 || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue
            total += size
            out += i
        }
        return out
    }
}
