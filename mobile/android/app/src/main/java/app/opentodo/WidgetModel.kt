package app.opentodo

import org.json.JSONObject

/**
 * What the Today widget shows, built from the web app's last publication only (native-shells D6):
 * every published row (at most [MAX_ROWS]), and whether the web app can complete a task from
 * the widget (android-widget-list D3). Pure for tests.
 */
data class WidgetModel(
    val updatedAt: Long,
    val locked: Boolean,
    val count: Int,
    val overdue: Int,
    val canComplete: Boolean,
    val rows: List<Row>,
    val more: Int,
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

    /** One line of the list: a group heading or a task (android-widget-list D1). */
    sealed interface Item {
        data class Heading(val group: Group) : Item
        data class Task(val row: Row) : Item
        /** Tasks counted but not published (beyond [MAX_ROWS]); a tap opens Today. */
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
            return WidgetModel(
                updatedAt = o.optLong("updatedAt", 0),
                locked = locked,
                count = count,
                overdue = o.optInt("overdue", 0).coerceAtLeast(0),
                canComplete = complete && !locked,
                rows = rows,
                more = (count - rows.size).coerceAtLeast(0),
            )
        }

        private fun text(o: JSONObject, key: String, max: Int): String? =
            if (o.isNull(key)) null else o.optString(key).take(max).ifEmpty { null }
    }
}

/**
 * Completions ticked on the widget that no publication has confirmed yet (android-widget-list D2):
 * `{taskId: ms}`. A row stays hidden until a publication leaves it out, or for [HIDE_MS] at most,
 * so a completion that never ran shows the task again. Pure for tests.
 */
object WidgetPending {
    const val HIDE_MS = 30 * 60 * 1000L

    fun parse(json: String?): Map<String, Long> {
        if (json.isNullOrEmpty()) return emptyMap()
        val o = try { JSONObject(json) } catch (e: Exception) { return emptyMap() }
        return o.keys().asSequence().associateWith { o.optLong(it, 0) }.filterValues { it > 0 }
    }

    fun toJson(pending: Map<String, Long>): String = JSONObject().apply { pending.forEach { (k, v) -> put(k, v) } }.toString()

    /** The ids hidden now: ticked less than [HIDE_MS] ago. */
    fun active(pending: Map<String, Long>, now: Long): Set<String> =
        pending.filterValues { now - it in 0 until HIDE_MS }.keys

    /** After a new publication: keep only the ids it still lists and that are not too old. */
    fun prune(pending: Map<String, Long>, published: WidgetModel?, now: Long): Map<String, Long> {
        val listed = published?.rows?.map { it.id }?.toSet() ?: emptySet()
        return pending.filter { (id, at) -> id in listed && now - at in 0 until HIDE_MS }
    }

    fun add(pending: Map<String, Long>, id: String, now: Long): Map<String, Long> =
        active(pending, now).associateWith { pending.getValue(it) } + (id to now)
}
