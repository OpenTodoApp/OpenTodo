package app.opentodo

import org.json.JSONObject

/**
 * What the Completed widget shows (completed-widget D1, D2), built from the web app's last
 * publication only: today's completions and, while the account is readable, the last 7
 * days. A locked account publishes today's count alone, so no days. Pure for tests.
 */
data class CompletedModel(val updatedAt: Long, val locked: Boolean, val today: Int, val days: List<Day>) {
    data class Day(val day: String, val done: Int)

    companion object {
        const val DAYS = 7
        private val ISO_DAY = Regex("""\d{4}-\d\d-\d\d""")

        /** Null when nothing was published yet, or by an app that publishes no completions. */
        fun parse(json: String?): CompletedModel? {
            if (json.isNullOrEmpty()) return null
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val c = o.optJSONObject("completed") ?: return null
            val locked = o.optBoolean("locked", false)
            val list = c.optJSONArray("days")
            val days = ArrayList<Day>()
            if (!locked && list != null) for (i in 0 until list.length()) {
                val d = list.optJSONObject(i) ?: continue
                val day = d.optString("day")
                if (ISO_DAY.matches(day)) days += Day(day, d.optInt("done", 0).coerceAtLeast(0))
            }
            return CompletedModel(o.optLong("updatedAt", 0), locked, c.optInt("today", 0).coerceAtLeast(0), days.takeLast(DAYS))
        }

        /** A bar's height out of 100: the day's count over the busiest day's; a day with any completion keeps a sliver. */
        fun barLevel(done: Int, max: Int): Int = if (max <= 0 || done <= 0) 0 else (done * 100 / max).coerceIn(6, 100)
    }
}
