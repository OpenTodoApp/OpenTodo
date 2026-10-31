package app.opentodo

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Obsidian note links (OpenSpec change obsidian-origin, design D2): the one custom
 * scheme the shell hands to the system, and only as `obsidian://open?vault=<vault>&file=<note>`
 * with exactly those two members. Every other Obsidian action (new, search, a community
 * plugin's adv-uri) can write or run something, and `path=` opens any file, so they stay
 * refused. The same rule as internal/origin/obsidian.go and web/src/lib/taskOrigin.ts,
 * pinned by the bridge fixture external-links.json. Pure Kotlin, no android.net.Uri.
 */
object ObsidianLink {
    private const val PREFIX = "obsidian://open?"
    private const val MAX_URL = 2048
    private const val MAX_VAULT = 255
    private const val MAX_FILE = 1024
    private const val VALUE_CHARS = "-._~!\$'()*,;:@/%"

    fun valid(url: String): Boolean {
        if (!url.startsWith(PREFIX) || url.toByteArray(Charsets.UTF_8).size > MAX_URL) return false
        val parts = url.substring(PREFIX.length).split('&')
        if (parts.size != 2) return false
        val seen = mutableSetOf<String>()
        for (part in parts) {
            val eq = part.indexOf('=')
            if (eq < 0) return false
            val name = part.substring(0, eq)
            if (!seen.add(name)) return false
            val value = decode(part.substring(eq + 1)) ?: return false
            val n = value.codePointCount(0, value.length)
            when (name) {
                "vault" -> if (n < 1 || n > MAX_VAULT) return false
                "file" -> if (n < 1 || n > MAX_FILE || value.startsWith("/")) return false
                else -> return false
            }
        }
        return true
    }

    /** Percent-decodes one value: only the allowed characters, well-formed escapes, valid UTF-8, no control characters. */
    private fun decode(raw: String): String? {
        val bytes = ByteArrayOutputStream()
        var i = 0
        while (i < raw.length) {
            val c = raw[i]
            val allowed = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || VALUE_CHARS.indexOf(c) >= 0
            if (!allowed) return null
            if (c == '%') {
                if (i + 2 >= raw.length) return null
                val hi = Character.digit(raw[i + 1], 16)
                val lo = Character.digit(raw[i + 2], 16)
                if (hi < 0 || lo < 0) return null
                bytes.write(hi * 16 + lo)
                i += 3
            } else {
                bytes.write(c.code)
                i += 1
            }
        }
        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
        } catch (e: CharacterCodingException) {
            return null
        }
        var j = 0
        while (j < text.length) {
            val cp = text.codePointAt(j)
            if (cp < 0x20 || (cp in 0x7f..0x9f)) return null
            j += Character.charCount(cp)
        }
        return text
    }
}
