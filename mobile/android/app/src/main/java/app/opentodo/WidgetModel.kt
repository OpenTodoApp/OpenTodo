package app.opentodo

import org.json.JSONObject

/**
 * What the Today and Upcoming widgets show, built from the web app's last publication only
 * (native-shells D6): every published row (at most [MAX_ROWS]), whether the web app can complete
 * a task from the widget (android-widget-list D3), and the Upcoming list by day, null when the
 * web app publishes none (android-upcoming-calendar-widgets D1). Pure for tests.
 */
data class WidgetModel(
    val updatedAt: Long,
    val locked: Boolean,
    val count: Int,
    val overdue: Int,
    val canComplete: Boolean,
    val rows: List<Row>,
    val more: Int,
    val upcoming: Upcoming? = null,
) {
    data class Row(
        val id: String,
        val title: String?,
        val time: String?,
        val date: String?,
        val project: String?,
        val priority: Int,
        val overdue: Boolean,
    )

    /** The Upcoming list (android-upcoming-calendar-widgets D1): rows in day order, each [Row.date] the day it is under. */
    data class Upcoming(val count: Int, val rows: List<Row>, val more: Int)

    /** One line of a list: a group heading, a day heading (Upcoming) or a task (android-widget-list D1). */
    sealed interface Item {
        data class Heading(val group: Group) : Item
        /** The day the following Upcoming rows are listed under, `YYYY-MM-DD`. */
        data class Day(val date: String) : Item
        data class Task(val row: Row) : Item
        /** Tasks counted but not published (beyond [MAX_ROWS]); a tap opens the list in the app. */
        data class More(val count: Int) : Item
    }

    enum class Group { EARLIER, TODAY }

    /** The rows still to show once the [pending] completions are hidden. */
    fun visibleRows(pending: Set<String>): List<Row> = rows.filter { it.id !in pending }

    /** The header's count: the published count less the rows hidden as completed. */
    fun visibleCount(pending: Set<String>): Int = (count - rows.count { it.id in pending }).coerceAtLeast(0)

    /**
     * The list's lines: the rows in the web app's order (overdue first), under "Earlier" and
     * "Today" headings only when both groups have rows, then the tasks not published.
     */
    fun items(pending: Set<String>): List<Item> {
        // Locked: counts only, said by the empty view.
        if (locked) return emptyList()
        val shown = visibleRows(pending)
        val (earlier, today) = shown.partition { it.overdue }
        val tasks = if (earlier.isEmpty() || today.isEmpty()) shown.map { Item.Task(it) }
        else listOf<Item>(Item.Heading(Group.EARLIER)) + earlier.map { Item.Task(it) } + Item.Heading(Group.TODAY) + today.map { Item.Task(it) }
        return if (more > 0) tasks + Item.More(more) else tasks
    }

    /** Whether an Upcoming row is hidden: ticked there (its occurrence), or ticked in Today (android-upcoming-calendar-widgets D3). */
    private fun hiddenUpcoming(row: Row, pending: Set<String>): Boolean = WidgetPending.key(row.id, row.date) in pending || row.id in pending

    /** The Upcoming header's count once the [pending] completions are hidden. */
    fun upcomingCount(pending: Set<String>): Int =
        upcoming?.let { u -> (u.count - u.rows.count { hiddenUpcoming(it, pending) }).coerceAtLeast(0) } ?: 0

    /** The Upcoming list's lines: a [Item.Day] heading before each day's rows, then the tasks not published. */
    fun upcomingItems(pending: Set<String>): List<Item> {
        val u = upcoming ?: return emptyList()
        if (locked) return emptyList()
        val out = ArrayList<Item>()
        var day: String? = null
        for (row in u.rows) {
            if (hiddenUpcoming(row, pending)) continue
            if (row.date != day) { day = row.date; out += Item.Day(row.date ?: "") }
            out += Item.Task(row)
        }
        if (u.more > 0) out += Item.More(u.more)
        return out
    }

    /** Whether the publication lists the task: in Today ([date] null) or in Upcoming on [date]. */
    fun lists(taskId: String, date: String?): Boolean =
        if (date == null) rows.any { it.id == taskId } else upcoming?.rows?.any { it.id == taskId && it.date == date } == true

    companion object {
        /** The web app publishes at most 50 (shellPublish.ts WIDGET_MAX). */
        const val MAX_ROWS = 50
        private val TIME = Regex("""\d\d:\d\d""")
        private val DATE = Regex("""\d{4}-\d\d-\d\d""")

        /** Null when nothing was published yet (or the publication is unreadable). Locked: counts, no titles. */
        fun parse(json: String?): WidgetModel? {
            if (json.isNullOrEmpty()) return null
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val locked = o.optBoolean("locked", false)
            val tasks = o.optJSONArray("tasks")
            val all = ArrayList<Row>()
            if (!locked && tasks != null) for (i in 0 until tasks.length()) {
                val t = tasks.optJSONObject(i) ?: continue
                all += Row(
                    id = t.optString("id"),
                    title = text(t, "title", 200),
                    time = text(t, "time", 5)?.takeIf { TIME.matches(it) },
                    date = text(t, "date", 10)?.takeIf { DATE.matches(it) },
                    project = text(t, "project", 100),
                    priority = t.optInt("priority", 4).coerceIn(1, 4),
                    overdue = t.optBoolean("overdue", false),
                )
            }
            val rows = all.filter { it.id.isNotEmpty() }.take(MAX_ROWS)
            val count = o.optInt("count", rows.size).coerceAtLeast(0)
            val actions = o.optJSONArray("actions")
            val complete = actions != null && (0 until actions.length()).any { actions.optString(it) == "complete" }
            val upcoming = o.optJSONObject("upcoming")?.let { u ->
                val list = u.optJSONArray("tasks")
                val upRows = ArrayList<Row>()
                if (!locked && list != null) for (i in 0 until list.length()) {
                    val t = list.optJSONObject(i) ?: continue
                    val date = text(t, "date", 10)?.takeIf { DATE.matches(it) } ?: continue
                    upRows += Row(
                        id = t.optString("id"),
                        title = text(t, "title", 200),
                        time = text(t, "time", 5)?.takeIf { TIME.matches(it) },
                        date = date,
                        project = text(t, "project", 100),
                        priority = t.optInt("priority", 4).coerceIn(1, 4),
                        overdue = false,
                    )
                }
                val shown = upRows.filter { it.id.isNotEmpty() }.take(MAX_ROWS)
                val upCount = u.optInt("count", shown.size).coerceAtLeast(0)
                Upcoming(upCount, shown, (upCount - shown.size).coerceAtLeast(0))
            }
            return WidgetModel(
                updatedAt = o.optLong("updatedAt", 0),
                locked = locked,
                count = count,
                overdue = o.optInt("overdue", 0).coerceAtLeast(0),
                canComplete = complete && !locked,
                rows = rows,
                more = (count - rows.size).coerceAtLeast(0),
                upcoming = upcoming,
            )
        }

        private fun text(o: JSONObject, key: String, max: Int): String? =
            if (o.isNull(key)) null else o.optString(key).take(max).ifEmpty { null }
    }
}

/**
 * Completions ticked on the widgets that no publication has confirmed yet (android-widget-list D2):
 * `{key: ms}`, the key a Today row's task id, or `id@date` for an Upcoming row, so a repeating task
 * shows again under its next date (android-upcoming-calendar-widgets D3). A row stays hidden until a
 * publication leaves it out, or for [HIDE_MS] at most, so a completion that never ran shows the
 * task again. Pure for tests.
 */
object WidgetPending {
    const val HIDE_MS = 30 * 60 * 1000L

    /** The pending key of a tick: the task id in Today ([date] null), `id@date` in Upcoming. */
    fun key(taskId: String, date: String?): String = if (date == null) taskId else "$taskId@$date"

    fun parse(json: String?): Map<String, Long> {
        if (json.isNullOrEmpty()) return emptyMap()
        val o = try { JSONObject(json) } catch (e: Exception) { return emptyMap() }
        return o.keys().asSequence().associateWith { o.optLong(it, 0) }.filterValues { it > 0 }
    }

    fun toJson(pending: Map<String, Long>): String = JSONObject().apply { pending.forEach { (k, v) -> put(k, v) } }.toString()

    /** The ids hidden now: ticked less than [HIDE_MS] ago. */
    fun active(pending: Map<String, Long>, now: Long): Set<String> =
        pending.filterValues { now - it in 0 until HIDE_MS }.keys

    /** After a new publication: keep only the ticks it still lists (Today by id, Upcoming by occurrence) and that are not too old. */
    fun prune(pending: Map<String, Long>, published: WidgetModel?, now: Long): Map<String, Long> {
        val listed = (published?.rows?.map { it.id }.orEmpty() + published?.upcoming?.rows?.map { key(it.id, it.date) }.orEmpty()).toSet()
        return pending.filter { (id, at) -> id in listed && now - at in 0 until HIDE_MS }
    }

    fun add(pending: Map<String, Long>, id: String, now: Long): Map<String, Long> =
        active(pending, now).associateWith { pending.getValue(it) } + (id to now)
}
