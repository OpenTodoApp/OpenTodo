package app.opentodo

import org.json.JSONObject

/**
 * The system bars the web app asks for (theme-engine D8, native-shells "System bars
 * follow the app's theme"): the colour of the status and navigation bars and whether
 * their icons must be light. The payload is `{"color":"#rrggbb","dark":true|false}`,
 * kept in the shared bridge fixture system-bars.json; anything else is ignored.
 */
data class SystemBars(val color: Int, val lightIcons: Boolean) {
    companion object {
        private val HEX = Regex("^#[0-9a-f]{6}$")
        private const val MAX = 200

        /** The bars of a payload, or null for a malformed one (the shell then keeps its bars). */
        fun parse(json: String?): SystemBars? {
            if (json == null || json.length > MAX) return null
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val color = o.opt("color") as? String ?: return null
            val dark = o.opt("dark") as? Boolean ?: return null
            if (!HEX.matches(color)) return null
            return SystemBars(0xFF000000.toInt() or color.substring(1).toInt(16), dark)
        }
    }
}
