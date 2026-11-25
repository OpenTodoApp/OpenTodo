package app.opentodo

import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.WeekFields
import java.util.Locale
import org.json.JSONObject

/**
 * What the Calendar widget shows (android-upcoming-calendar-widgets D1, D4), from the web app's
 * last publication only: the number of open tasks per day, the app's first day of the week
 * (0 = Sunday; null when the web app sent none) and whether a day opens Day (the current
 * workspace has Calendar on) or Upcoming. Locked: no days. Pure for tests.
 */
data class CalendarModel(
    val updatedAt: Long,
    val locked: Boolean,
    val weekStart: Int?,
    val dayView: Boolean,
    val days: Map<String, Int>,
) {
    /** The open tasks due on [date] (zero for a day the web app did not publish). */
    fun count(date: LocalDate): Int = days[date.toString()] ?: 0

    /** The address a tap on [date] opens (shared fixture bridge/actions.json `calendarPaths`). */
    fun dayPath(date: LocalDate): String = if (dayView) "/day/$date" else "/upcoming"

    /** The address a tap on the month's name opens. */
    fun monthPath(month: YearMonth): String = if (dayView) "/month/${month.atDay(1)}" else "/upcoming"

    companion object {
        /** The months the widget shows: this one and the next five (shellPublish.ts CALENDAR_MONTHS). */
        const val MONTHS = 6
        private const val MAX_DAYS = 400
        private val DATE = Regex("""\d{4}-\d\d-\d\d""")

        /** Null when nothing was published yet, or by a web app that publishes no calendar. */
        fun parse(json: String?): CalendarModel? {
            if (json.isNullOrEmpty()) return null
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val c = o.optJSONObject("calendar") ?: return null
            val locked = o.optBoolean("locked", false)
            val days = LinkedHashMap<String, Int>()
            val d = c.optJSONObject("days")
            if (!locked && d != null) for (key in d.keys()) {
                val n = d.optInt(key, 0)
                if (DATE.matches(key) && n > 0 && days.size < MAX_DAYS) days[key] = n
            }
            return CalendarModel(
                updatedAt = o.optLong("updatedAt", 0),
                locked = locked,
                weekStart = if (c.has("weekStart")) c.optInt("weekStart", -1).takeIf { it in 0..6 } else null,
                dayView = c.optBoolean("dayView", true),
                days = days,
            )
        }

        /** Six weeks of seven days covering [month], each week starting on [weekStart] (0 = Sunday), as the app's Month. */
        fun grid(month: YearMonth, weekStart: Int): List<List<LocalDate>> {
            val first = month.atDay(1)
            val back = (first.dayOfWeek.value % 7 - weekStart + 7) % 7
            val start = first.minusDays(back.toLong())
            return (0 until 6).map { w -> (0 until 7).map { d -> start.plusDays((w * 7 + d).toLong()) } }
        }

        /** The phone's first day of the week (0 = Sunday), for a publication without one. */
        fun localeWeekStart(locale: Locale = Locale.getDefault()): Int = WeekFields.of(locale).firstDayOfWeek.value % 7

        /** A widget's month, counted from the current one: 0 to [MONTHS] − 1. */
        fun clampOffset(offset: Int): Int = offset.coerceIn(0, MONTHS - 1)
    }
}
