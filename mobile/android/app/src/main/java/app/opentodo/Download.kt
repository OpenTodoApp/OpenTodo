package app.opentodo

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction

/**
 * A file the web view asks to download (shell-repairs D2): only an address on the configured
 * server's origin is fetched, by the shell itself with the web view's cookies and user agent,
 * into a file of the app's cache that the save dialog then copies. `blob:` and `data:`
 * addresses are left alone (the web app hands those bytes over the bridge, [FileSave]), and
 * any other address is treated as a foreign link.
 *
 * Pure Kotlin (no Android types) so the rules are unit tested on the JVM.
 */
object Download {
    enum class Decision { FETCH, IGNORE, FOREIGN }

    /** A fetched file: where it is, and the name and type the save dialog gets. */
    data class Fetched(val file: File, val name: String, val type: String)

    private const val MAX_REDIRECTS = 5
    private const val TIMEOUT_MS = 30_000
    private val EXTENDED = Regex("""(?i)(?:^|;)\s*filename\*\s*=\s*([^;]*)""")
    private val PLAIN = Regex("""(?i)(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))""")

    /** What the shell does with a download of [url] while [origin] is the configured server. */
    fun decide(url: String, origin: String?): Decision {
        val scheme = url.trim().substringBefore(':', "").lowercase()
        if (scheme == "blob" || scheme == "data") return Decision.IGNORE
        val target = SignInFlow.originOf(url)
        return if (origin != null && target != null && target == origin) Decision.FETCH else Decision.FOREIGN
    }

    /**
     * The file name of a `Content-Disposition` header: `filename*=` (RFC 5987, UTF-8 or
     * ISO-8859-1) before `filename=`; null when the header names none.
     */
    fun dispositionName(header: String?): String? {
        if (header == null) return null
        EXTENDED.find(header)?.let { m -> extended(m.groupValues[1].trim().removeSurrounding("\""))?.let { return it } }
        val m = PLAIN.find(header) ?: return null
        val quoted = m.groups[1]?.value
        val name = quoted?.replace(Regex("""\\(.)"""), "$1") ?: m.groups[2]?.value?.trim().orEmpty()
        return name.takeIf { it.isNotEmpty() }
    }

    /** The name to propose: the header's, else the last segment of the address's path, reduced by [FileSave.name]. */
    fun fileName(disposition: String?, url: String): String {
        dispositionName(disposition)?.let { return FileSave.name(it) }
        val path = try { URI(url.trim()).path } catch (e: Exception) { null }
        return FileSave.name(path)
    }

    /** `charset'language'percent-encoded` to text; null for another charset or a malformed value. */
    private fun extended(value: String): String? {
        val parts = value.split('\'')
        if (parts.size != 3) return null
        val charset: Charset = when (parts[0].lowercase()) {
            "utf-8" -> Charsets.UTF_8
            "iso-8859-1" -> Charsets.ISO_8859_1
            else -> return null
        }
        val bytes = ByteArrayOutputStream()
        val raw = parts[2]
        var i = 0
        while (i < raw.length) {
            val c = raw[i]
            if (c == '%') {
                if (i + 2 >= raw.length) return null
                val hi = Character.digit(raw[i + 1], 16)
                val lo = Character.digit(raw[i + 2], 16)
                if (hi < 0 || lo < 0) return null
                bytes.write(hi * 16 + lo)
                i += 3
            } else {
                if (c.code > 0x7e || c.code < 0x21) return null
                bytes.write(c.code)
                i += 1
            }
        }
        return try {
            charset.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString().takeIf { it.isNotEmpty() }
        } catch (e: CharacterCodingException) {
            null
        }
    }

    /**
     * Blocking; call off the main thread. Fetches [url] into a new file of [dir], or answers
     * null and leaves no file: an address off [origin], a redirect that leaves it, a status
     * outside 200..299 or a broken transfer. [cookies] gives the web view's cookies for an
     * address, asked again for every redirect. [disposition] and [mimeType] are the web
     * view's own reading of the response, used when the fetched one names none.
     */
    fun fetch(
        url: String,
        origin: String,
        userAgent: String?,
        dir: File,
        disposition: String? = null,
        mimeType: String? = null,
        cookies: (String) -> String?,
    ): Fetched? {
        var address = url.trim()
        repeat(MAX_REDIRECTS + 1) {
            if (decide(address, origin) != Decision.FETCH) return null
            val conn = try { URL(address).openConnection() as HttpURLConnection } catch (e: Exception) { return null }
            try {
                conn.instanceFollowRedirects = false
                conn.connectTimeout = TIMEOUT_MS
                conn.readTimeout = TIMEOUT_MS
                if (!userAgent.isNullOrEmpty()) conn.setRequestProperty("User-Agent", userAgent)
                cookies(address)?.takeIf { it.isNotEmpty() }?.let { conn.setRequestProperty("Cookie", it) }
                val status = conn.responseCode
                if (status in 300..399) {
                    val location = conn.getHeaderField("Location") ?: return null
                    address = try { URI(address).resolve(location.trim()).toString() } catch (e: Exception) { return null }
                    return@repeat
                }
                if (status !in 200..299) return null
                val file = FileSave.newFile(dir)
                try {
                    conn.inputStream.use { input -> FileOutputStream(file).use { input.copyTo(it) } }
                } catch (e: IOException) {
                    file.delete()
                    return null
                }
                // A transfer cut short of its announced length is not a file (some stacks end it quietly).
                val announced = conn.getHeaderField("Content-Length")?.trim()?.toLongOrNull()
                if (announced != null && conn.contentEncoding == null && file.length() != announced) {
                    file.delete()
                    return null
                }
                val name = fileName(conn.getHeaderField("Content-Disposition") ?: disposition, address)
                return Fetched(file, name, FileSave.type(conn.contentType ?: mimeType))
            } catch (e: IOException) {
                return null
            } finally {
                conn.disconnect()
            }
        }
        return null
    }
}
