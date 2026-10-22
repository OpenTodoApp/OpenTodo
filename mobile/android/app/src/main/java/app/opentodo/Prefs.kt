package app.opentodo

import android.content.Context
import android.content.SharedPreferences

/** App-private settings: the server, the handed-over schedule and widget data, the wrapped key. Never backed up. */
class Prefs(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("opentodo", Context.MODE_PRIVATE)

    var server: String?
        get() = p.getString("server", null)
        set(v) = p.edit().putString("server", v).apply()

    var reminders: String
        get() = p.getString("reminders", "[]") ?: "[]"
        set(v) = p.edit().putString("reminders", v).apply()

    var widget: String?
        get() = p.getString("widget", null)
        set(v) = p.edit().putString("widget", v).apply()

    var exactAlarmAsked: Boolean
        get() = p.getBoolean("exactAlarmAsked", false)
        set(v) = p.edit().putBoolean("exactAlarmAsked", v).apply()

    /** The account key, AES-GCM encrypted under the biometric Keystore key: base64 iv and ciphertext. */
    var wrappedKey: Pair<String, String>?
        get() {
            val iv = p.getString("keyIv", null) ?: return null
            val ct = p.getString("keyCt", null) ?: return null
            return iv to ct
        }
        set(v) {
            p.edit().apply { if (v == null) { remove("keyIv"); remove("keyCt") } else { putString("keyIv", v.first); putString("keyCt", v.second) } }.apply()
        }

    /** Everything that belongs to the server: kept only the address when [keepServer]. */
    fun clearServerData(keepServer: Boolean) {
        val server = this.server
        p.edit().clear().commit()
        if (keepServer) this.server = server
    }
}
