package app.opentodo

import org.json.JSONArray

/**
 * One reminder the web app handed over (bridge v1 `scheduleReminders`). [due] is the notification's
 * body, the task's due as of the firing day ("Today 14:00"), handed over with the title (push-due-date D4).
 * [urgent] rings it as an alarm (android-urgent-alarms D1); only a JSON `true` sets it.
 */
data class ShellReminder(
    val id: String, val taskId: String, val fireAt: Long, val title: String?, val due: String? = null, val urgent: Boolean = false,
)

/** Parsing and filtering of the handed-over schedule; pure so the rules are unit-tested. */
object ReminderSchedule {
    const val HORIZON_MS = 8L * 24 * 60 * 60 * 1000
    const val MAX = 500
    private const val GRACE_MS = 60_000L

    /**
     * The reminders to arm: valid entries, firing from a minute ago (a late hand-over still
     * fires) to the horizon, one per id, at most [MAX], earliest first. Bad JSON is an empty list.
     * With [now] null there is no time window: the stored schedule as it was armed.
     */
    fun parse(json: String, now: Long?): List<ShellReminder> {
        val arr = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
        val seen = HashSet<String>()
        val out = ArrayList<ShellReminder>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id")
            val taskId = o.optString("taskId")
            val fireAt = o.optLong("fireAt", -1)
            if (id.isEmpty() || id.length > 100 || taskId.isEmpty() || taskId.length > 100 || fireAt < 0) continue
            if (now != null && (fireAt < now - GRACE_MS || fireAt > now + HORIZON_MS)) continue
            if (!seen.add(id)) continue
            val title = if (o.has("title") && !o.isNull("title")) o.optString("title").take(200).ifEmpty { null } else null
            val due = if (o.has("due") && !o.isNull("due")) o.optString("due").take(100).ifEmpty { null } else null
            out.add(ShellReminder(id, taskId, fireAt, title, due, o.opt("urgent") == true))
        }
        return out.sortedBy { it.fireAt }.take(MAX)
    }

    fun toJson(list: List<ShellReminder>): String {
        val arr = JSONArray()
        for (r in list) arr.put(org.json.JSONObject().apply {
            put("id", r.id); put("taskId", r.taskId); put("fireAt", r.fireAt)
            if (r.title != null) put("title", r.title)
            if (r.due != null) put("due", r.due)
            if (r.urgent) put("urgent", true)
        })
        return arr.toString()
    }

    private const val SHOWN_KEEP_MS = 24L * 60 * 60 * 1000
    private const val SHOWN_SAME_MS = 60_000L
    private const val SHOWN_MAX = 200

    /**
     * shell-push D4: whether the reminder [id] was already shown for this fire time, by its
     * alarm or by a push ([shown] is `{id: fireAt}`). The two paths may name the time a little
     * differently, and a snoozed reminder fires again later: the same minute is the same firing.
     */
    fun wasShown(shown: String, id: String, fireAt: Long): Boolean {
        val o = try { org.json.JSONObject(shown) } catch (e: Exception) { return false }
        if (!o.has(id)) return false
        val at = o.optLong(id, -1)
        return at >= 0 && kotlin.math.abs(at - fireAt) < SHOWN_SAME_MS
    }

    /** [shown] with [id] shown for [fireAt]; firings older than a day are dropped, and all but the latest [SHOWN_MAX]. */
    fun markShown(shown: String, id: String, fireAt: Long, now: Long): String {
        val o = try { org.json.JSONObject(shown) } catch (e: Exception) { org.json.JSONObject() }
        val kept = ArrayList<Pair<String, Long>>()
        for (key in o.keys()) {
            val at = o.optLong(key, -1)
            if (key != id && at >= now - SHOWN_KEEP_MS) kept.add(key to at)
        }
        kept.add(id to fireAt)
        val out = org.json.JSONObject()
        for ((key, at) in kept.sortedBy { it.second }.takeLast(SHOWN_MAX)) out.put(key, at)
        return out.toString()
    }

    /**
     * A time reminder's notification buttons, in order (reminder-done-action): Done first, then
     * Snooze 10 min and Dismiss, like the web push notification.
     */
    val REMINDER_ACTIONS = listOf("done", "snooze", "dismiss")

    /** A location reminder's buttons (location-reminders D2): nothing to snooze. */
    val LOCATION_ACTIONS = listOf("done", "dismiss")

    /** The actions the web app's address accepts (`shellActions.ts`); anything else is ignored. */
    fun isAction(action: String?): Boolean = action == "done" || action == "snooze" || action == "dismiss"

    /** The address a notification action opens in the background (handled by the web app like the service worker's notification actions). */
    fun actionPath(id: String, action: String): String =
        "/?reminder=" + java.net.URLEncoder.encode(id, "UTF-8") + "&action=" + action

    fun taskPath(taskId: String): String = "/?task=" + java.net.URLEncoder.encode(taskId, "UTF-8")

    /** The address the quick-add widget opens (the web app's `?add=`; shared fixture bridge/actions.json). */
    const val QUICK_ADD_PATH = "/?add="
}

/** The rules of urgent reminders on Android (android-urgent-alarms); pure so they are unit-tested. */
object UrgentAlarms {
    const val EXACT = "exact"
    const val FULL_SCREEN = "full-screen"

    /** Android 12 (API 31) asks for exact alarms, Android 14 (API 34) for full-screen notifications. */
    private const val EXACT_SDK = 31
    private const val FULL_SCREEN_SDK = 34

    /**
     * D4: the settings page to open when the user turns Urgent on, or null: exact alarms first,
     * then full-screen notifications, each only when missing on this Android version and not
     * asked on this device before.
     */
    fun nextAsk(sdk: Int, exact: Boolean, fullScreen: Boolean, askedExact: Boolean, askedFullScreen: Boolean): String? = when {
        sdk >= EXACT_SDK && !exact && !askedExact -> EXACT
        sdk >= FULL_SCREEN_SDK && !fullScreen && !askedFullScreen -> FULL_SCREEN
        else -> null
    }

    /** D3: an urgent reminder is an alarm clock when exact alarms are allowed; everything else is armed as before. */
    fun armAsAlarmClock(r: ShellReminder, exact: Boolean): Boolean = r.urgent && exact

    /**
     * D2: [acted] with this firing answered, or null when it was answered already (a double tap,
     * or Done from the notification shade or a watch while the alarm screen is open), so a
     * repeating task is not advanced twice. A firing is the reminder at its time (the same
     * minute, as for [ReminderSchedule.wasShown]); without a time ([fireAt] 0, a location
     * reminder) every answer counts.
     */
    fun firstAnswer(acted: String, id: String, fireAt: Long, now: Long): String? = when {
        fireAt <= 0 -> acted
        ReminderSchedule.wasShown(acted, id, fireAt) -> null
        else -> ReminderSchedule.markShown(acted, id, fireAt, now)
    }

    /** The alarm screen over a locked phone names the task only when the user lets notifications show private content there. */
    fun showTitle(locked: Boolean, privateOnLockScreen: Boolean): Boolean = !locked || privateOnLockScreen
}
