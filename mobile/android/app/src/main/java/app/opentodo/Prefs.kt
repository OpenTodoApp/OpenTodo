package app.opentodo

import android.content.Context
import android.content.SharedPreferences

/** App-private settings: the server, the handed-over schedule, location reminders and widget data, the quick-add notification, the wrapped key. Never backed up. */
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

    /** Per reminder, the fire time it was last shown for (shell-push D4: alarm and push show it once): `{id: ms}`. */
    var remindersShown: String
        get() = p.getString("remindersShown", "{}") ?: "{}"
        set(v) = p.edit().putString("remindersShown", v).apply()

    /** Per reminder, the fire time it was last answered for (android-urgent-alarms D2: one answer per firing): `{id: ms}`. */
    var remindersActed: String
        get() = p.getString("remindersActed", "{}") ?: "{}"
        set(v) { p.edit().putString("remindersActed", v).commit() }

    /**
     * The UnifiedPush registration (shell-push D3): token, distributor, endpoint and the Web Push
     * keys, private key included. It never leaves the phone and goes with the server's data.
     */
    var push: String?
        get() = p.getString("push", null)
        set(v) = p.edit().apply { if (v == null) remove("push") else putString("push", v) }.apply()

    /** The last Focus session the web app published (focus-live-activity D7), only while one runs or is paused. */
    var focus: String?
        get() = p.getString("focus", null)
        set(v) = p.edit().apply { if (v == null) remove("focus") else putString("focus", v) }.apply()

    /** The running session's Pause/Resume token (Focus.EXTRA_TOKEN); none outside a session. */
    var focusToken: String?
        get() = p.getString("focusToken", null)
        set(v) = p.edit().apply { if (v == null) remove("focusToken") else putString("focusToken", v) }.apply()

    var widget: String?
        get() = p.getString("widget", null)
        set(v) = p.edit().putString("widget", v).apply()

    /** Completions ticked on the Today widget and not yet confirmed by a publication (WidgetPending): `{taskId: ms}`. */
    var widgetPending: String?
        get() = p.getString("widgetPending", null)
        set(v) = p.edit().apply { if (v == null) remove("widgetPending") else putString("widgetPending", v) }.apply()

    /** The month a Calendar widget shows, counted from the current one (android-upcoming-calendar-widgets D4); 0 removes it. */
    fun calendarOffset(widgetId: Int): Int = p.getInt("calendarOffset:$widgetId", 0)

    fun setCalendarOffset(widgetId: Int, offset: Int) =
        p.edit().apply { if (offset == 0) remove("calendarOffset:$widgetId") else putInt("calendarOffset:$widgetId", offset) }.apply()

    /** Every Calendar widget's month (WidgetStore.clear). */
    fun clearCalendarOffsets() = p.edit().apply { p.all.keys.filter { it.startsWith("calendarOffset:") }.forEach { remove(it) } }.apply()

    /** Adds a tick to the ids the next background run completes (android-widget-list D2). */
    fun queueWidgetCompletion(taskId: String) = synchronized(LOCK) {
        val queue = queueOf(p.getString("widgetQueue", null))
        if (taskId !in queue) p.edit().putString("widgetQueue", org.json.JSONArray(queue + taskId).toString()).commit()
    }

    /** The queued ids, removed from the queue at once, so each is sent to the web app once. */
    fun takeWidgetQueue(): List<String> = synchronized(LOCK) {
        val queue = queueOf(p.getString("widgetQueue", null))
        if (queue.isNotEmpty()) p.edit().remove("widgetQueue").commit()
        queue
    }

    private fun queueOf(json: String?): List<String> = try {
        val a = org.json.JSONArray(json ?: "[]")
        (0 until a.length()).map { a.optString(it) }.filter { it.isNotEmpty() }.take(WidgetModel.MAX_ROWS)
    } catch (e: Exception) { emptyList() }

    /**
     * android-urgent-alarms D4: the settings pages already opened for urgent reminders (`exact`,
     * `full-screen`), each once per device: kept apart, so signing out or changing server keeps them.
     */
    private val device: SharedPreferences = context.applicationContext.getSharedPreferences("opentodo-device", Context.MODE_PRIVATE)

    fun urgentAsked(page: String): Boolean = device.getBoolean("urgentAsked.$page", false)

    fun markUrgentAsked(page: String) = device.edit().putBoolean("urgentAsked.$page", true).apply()

    /** The last system bars the web app asked for (theme-engine D8), applied at the next launch before the page draws. */
    var systemBars: String?
        get() = p.getString("systemBars", null)
        set(v) = p.edit().putString("systemBars", v).apply()

    /** The quick-add notification's switch (android-quick-add-notification D1); off by default, gone with the server's data. */
    var quickAddNotification: Boolean
        get() = p.getBoolean("quickAddNotification", false)
        set(v) = p.edit().putBoolean("quickAddNotification", v).apply()

    /** Whether its Add task button takes a title inline (D3: false for an encrypted account). */
    var quickAddReply: Boolean
        get() = p.getBoolean("quickAddReply", false)
        set(v) = p.edit().putBoolean("quickAddReply", v).apply()

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

    private companion object { val LOCK = Any() }

    /** Everything that belongs to the server: kept only the address when [keepServer]. */
    fun clearServerData(keepServer: Boolean) {
        val server = this.server
        p.edit().clear().commit()
        if (keepServer) this.server = server
    }
}
