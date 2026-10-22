package app.opentodo

import org.json.JSONArray

/** One reminder the web app handed over (bridge v1 `scheduleReminders`). */
data class ShellReminder(val id: String, val taskId: String, val fireAt: Long, val title: String?)

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
            out.add(ShellReminder(id, taskId, fireAt, title))
        }
        return out.sortedBy { it.fireAt }.take(MAX)
    }

    fun toJson(list: List<ShellReminder>): String {
        val arr = JSONArray()
        for (r in list) arr.put(org.json.JSONObject().apply {
            put("id", r.id); put("taskId", r.taskId); put("fireAt", r.fireAt)
            if (r.title != null) put("title", r.title)
        })
        return arr.toString()
    }

    /** The address a notification action opens in the background (handled by the web app like push-sw.js). */
    fun actionPath(id: String, action: String): String =
        "/?reminder=" + java.net.URLEncoder.encode(id, "UTF-8") + "&action=" + action

    fun taskPath(taskId: String): String = "/?task=" + java.net.URLEncoder.encode(taskId, "UTF-8")
}
