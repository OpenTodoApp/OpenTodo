package app.opentodo

import android.content.Context
import android.content.SharedPreferences

/** App-private settings: the server, the handed-over schedule, location reminders and widget data, the wrapped key. Never backed up. */
class Prefs(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("opentodo", Context.MODE_PRIVATE)

    var server: String?
        get() = p.getString("server", null)
        set(v) = p.edit().putString("server", v).apply()

    var reminders: String
        get() = p.getString("reminders", "[]") ?: "[]"
        set(v) = p.edit().putString("reminders", v).apply()

    /** The handed-over location reminders (location-reminders D3), stored only while background location is granted. */
    var geofences: String
        get() = p.getString("geofences", "") ?: ""
        set(v) = p.edit().putString("geofences", v).apply()

    /** The location reminders registered as proximity alerts now (at most 19). */
    var geofencesRegistered: String
        get() = p.getString("geofencesRegistered", "") ?: ""
        set(v) = p.edit().putString("geofencesRegistered", v).apply()

    /** The ranking anchor: the one position kept, `{lat, lon}`; never logged or handed to the web view. */
    var geofenceAnchor: String?
        get() = p.getString("geofenceAnchor", null)
        set(v) = p.edit().apply { if (v == null) remove("geofenceAnchor") else putString("geofenceAnchor", v) }.apply()

    /** Per location reminder, when it last notified: `{id: ms}`. */
    var geofencesFired: String
        get() = p.getString("geofencesFired", "{}") ?: "{}"
        set(v) = p.edit().putString("geofencesFired", v).apply()

    var widget: String?
        get() = p.getString("widget", null)
        set(v) = p.edit().putString("widget", v).apply()

    /** The last system bars the web app asked for (theme-engine D8), applied at the next launch before the page draws. */
    var systemBars: String?
        get() = p.getString("systemBars", null)
        set(v) = p.edit().putString("systemBars", v).apply()

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
