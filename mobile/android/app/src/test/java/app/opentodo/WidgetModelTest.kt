package app.opentodo

import java.time.LocalDate
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetModelTest {
    private fun row(id: String, overdue: Boolean = false) = """{"id":"$id","title":"Task $id","priority":4,"overdue":$overdue}"""
    private fun publication(vararg rows: String, count: Int = rows.size, actions: String = """["complete"]""") =
        """{"updatedAt":1,"locked":false,"count":$count,"overdue":0,"tasks":[${rows.joinToString(",")}],"actions":$actions}"""

    @Test fun nothingPublished() {
        assertNull(WidgetModel.parse(null))
        assertNull(WidgetModel.parse(""))
        assertNull(WidgetModel.parse("not json"))
    }

    @Test fun everyPublishedRowWithItsDetails() {
        val tasks = (1..20).joinToString(",") { """{"id":"t$it","title":"Task $it","priority":${if (it == 1) 1 else 4},"overdue":${it == 1}${if (it == 1) ",\"date\":\"2026-10-20\",\"project\":\"Home\"" else ""}${if (it == 2) ",\"time\":\"09:30\"" else ""}}""" }
        val m = WidgetModel.parse("""{"updatedAt":1800000000000,"locked":false,"count":22,"overdue":1,"tasks":[$tasks],"actions":["complete"]}""")!!
        assertEquals(1800000000000L, m.updatedAt)
        assertEquals(22, m.count)
        assertEquals(20, m.rows.size)
        assertTrue(m.canComplete)
        assertEquals(WidgetModel.Row("t1", "Task 1", null, "2026-10-20", "Home", 1, true), m.rows[0])
        assertEquals("09:30", m.rows[1].time)
        assertEquals(2, m.more)
    }

    @Test fun atMostFiftyRows() {
        val m = WidgetModel.parse(publication(*(1..60).map { row("t$it") }.toTypedArray()))!!
        assertEquals(WidgetModel.MAX_ROWS, m.rows.size)
        assertEquals(10, m.more)
        assertEquals(WidgetModel.Item.More(10), m.items(emptySet()).last())
    }

    @Test fun lockedShowsCountsOnly() {
        val m = WidgetModel.parse("""{"updatedAt":1,"locked":true,"count":3,"overdue":2,"tasks":[{"id":"t","title":"secret","priority":1,"overdue":true}],"actions":["complete"]}""")!!
        assertTrue(m.locked)
        assertTrue(m.rows.isEmpty())
        assertFalse(m.canComplete)
        assertEquals(3, m.count)
        assertEquals(2, m.overdue)
        // The empty view says it: no line, not even "+ 3 more".
        assertTrue(m.items(emptySet()).isEmpty())
    }

    @Test fun badFieldsAreTamed() {
        val m = WidgetModel.parse("""{"updatedAt":1,"locked":false,"count":1,"overdue":0,"tasks":[{"id":"t","priority":9,"time":"soon","date":"yesterday","project":""},{"title":"no id"}]}""")!!
        assertEquals(listOf(WidgetModel.Row("t", null, null, null, null, 4, false)), m.rows)
        assertEquals(0, m.more)
    }

    /** android-widget-list D3: an older web app does not announce `complete`, so no circles. */
    @Test fun completingNeedsTheWebAppsWord() {
        assertFalse(WidgetModel.parse(publication(row("a"), actions = "[]"))!!.canComplete)
        assertFalse(WidgetModel.parse("""{"updatedAt":1,"locked":false,"count":1,"tasks":[${row("a")}]}""")!!.canComplete)
        assertTrue(WidgetModel.parse(publication(row("a")))!!.canComplete)
    }

    @Test fun headingsOnlyWhenBothGroupsHaveRows() {
        val both = WidgetModel.parse(publication(row("late", true), row("a"), row("b")))!!
        assertEquals(
            listOf("h:EARLIER", "late", "h:TODAY", "a", "b"),
            both.items(emptySet()).map { if (it is WidgetModel.Item.Heading) "h:${it.group}" else (it as WidgetModel.Item.Task).row.id },
        )
        val todayOnly = WidgetModel.parse(publication(row("a"), row("b")))!!
        assertTrue(todayOnly.items(emptySet()).none { it is WidgetModel.Item.Heading })
        // Ticking the only overdue task removes the headings too.
        assertTrue(both.items(setOf("late")).none { it is WidgetModel.Item.Heading })
    }

    @Test fun pendingCompletionsAreHiddenAndCounted() {
        val m = WidgetModel.parse(publication(row("a"), row("b"), row("c"), count = 3))!!
        assertEquals(listOf("a", "c"), m.visibleRows(setOf("b")).map { it.id })
        assertEquals(2, m.visibleCount(setOf("b")))
        // A pending id the publication does not list changes nothing.
        assertEquals(3, m.visibleCount(setOf("zzz")))
    }

    @Test fun pendingIsConfirmedByAPublicationOrExpires() {
        val now = 1_000_000_000L
        var pending = WidgetPending.add(emptyMap(), "a", now)
        pending = WidgetPending.add(pending, "b", now + 1)
        assertEquals(setOf("a", "b"), WidgetPending.active(pending, now + 2))
        // The web app's first publication of the run still lists both; the next one lacks "a".
        val before = WidgetModel.parse(publication(row("a"), row("b")))
        assertEquals(setOf("a", "b"), WidgetPending.prune(pending, before, now + 3).keys)
        val after = WidgetModel.parse(publication(row("b")))
        assertEquals(setOf("b"), WidgetPending.prune(pending, after, now + 4).keys)
        // A completion that never ran shows the task again after 30 minutes.
        assertTrue(WidgetPending.active(pending, now + WidgetPending.HIDE_MS + 1).isEmpty())
        assertTrue(WidgetPending.prune(pending, before, now + WidgetPending.HIDE_MS + 1).isEmpty())
        // Sign-out or lock (no rows) drops everything.
        assertTrue(WidgetPending.prune(pending, WidgetModel.parse("""{"updatedAt":1,"locked":true,"count":0,"tasks":[]}"""), now + 5).isEmpty())
    }

    @Test fun pendingRoundTripsAndToleratesJunk() {
        val pending = mapOf("a" to 5L, "t/1 ü" to 7L)
        assertEquals(pending, WidgetPending.parse(WidgetPending.toJson(pending)))
        assertTrue(WidgetPending.parse("not json").isEmpty())
        assertTrue(WidgetPending.parse(null).isEmpty())
        assertTrue(WidgetPending.parse("""{"a":"x","b":-1}""").isEmpty())
    }

    @Test fun rowDetails() {
        assertEquals("09:30 · Home", TodayWidget.details(WidgetModel.Row("a", "A", "09:30", null, "Home", 4, false)))
        assertEquals("Home", TodayWidget.details(WidgetModel.Row("a", "A", null, "2026-10-20", "Home", 4, true)))
        assertEquals("", TodayWidget.details(WidgetModel.Row("a", "A", null, null, null, 4, false)))
    }

    @Test fun overdueDateInThePhonesLanguage() {
        assertEquals("Oct 20", TodayWidget.shortDate("2026-10-20", "MMM d", Locale.US))
        assertEquals("20 Oct", TodayWidget.shortDate("2026-10-20", "d MMM", Locale.UK))
        assertEquals("nonsense", TodayWidget.shortDate("nonsense", "MMM d", Locale.US))
        assertEquals("2026-02-30", TodayWidget.shortDate("2026-02-30", "MMM d", Locale.US))
    }

    @Test fun theCompletionAddress() {
        assertEquals("/?complete=t1", WidgetStore.completePath(listOf("t1")))
        assertEquals("/?complete=t%2F1+%C3%BC", WidgetStore.completePath(listOf("t/1 ü")))
        // One run for every tick queued since the last.
        assertEquals("/?complete=a&complete=b", WidgetStore.completePath(listOf("a", "b")))
    }

    private fun upRow(id: String, date: String, extra: String = "") = """{"id":"$id","title":"Task $id","date":"$date","priority":4$extra}"""
    private fun withUpcoming(vararg rows: String, count: Int = rows.size, today: String = "", locked: Boolean = false) =
        """{"updatedAt":1,"locked":$locked,"count":0,"overdue":0,"tasks":[$today],"actions":["complete"],"upcoming":{"count":$count,"tasks":[${rows.joinToString(",")}]}}"""

    /** android-upcoming-calendar-widgets D3: a heading before each day's rows, then the tasks not published. */
    @Test fun upcomingByDay() {
        val m = WidgetModel.parse(withUpcoming(upRow("a", "2026-10-23", ""","time":"09:00","project":"Home""""), upRow("b", "2026-10-23"), upRow("c", "2026-10-26"), count = 5))!!
        assertEquals(WidgetModel.Row("a", "Task a", "09:00", "2026-10-23", "Home", 4, false), m.upcoming!!.rows[0])
        assertEquals(
            listOf("d:2026-10-23", "a", "b", "d:2026-10-26", "c", "more:2"),
            m.upcomingItems(emptySet()).map {
                when (it) {
                    is WidgetModel.Item.Day -> "d:${it.date}"
                    is WidgetModel.Item.Task -> it.row.id
                    is WidgetModel.Item.More -> "more:${it.count}"
                    is WidgetModel.Item.Heading -> "h"
                }
            },
        )
        assertEquals(5, m.upcomingCount(emptySet()))
        // The Today list is untouched by Upcoming.
        assertTrue(m.items(emptySet()).isEmpty())
    }

    @Test fun upcomingNeedsItsListAndTamesBadRows() {
        assertNull(WidgetModel.parse(publication(row("a")))!!.upcoming)
        val m = WidgetModel.parse(withUpcoming(upRow("a", "soon"), """{"date":"2026-10-23"}""", """{"id":"b","title":"Task b","date":"2026-10-24","time":"late","priority":0}""", count = 3))!!
        assertEquals(listOf(WidgetModel.Row("b", "Task b", null, "2026-10-24", null, 1, false)), m.upcoming!!.rows)
        assertEquals(3, m.upcoming?.count)
        assertEquals(2, m.upcoming?.more)
    }

    @Test fun upcomingLockedShowsTheCountOnly() {
        val m = WidgetModel.parse(withUpcoming(upRow("a", "2026-10-23"), count = 4, locked = true))!!
        assertTrue(m.upcoming!!.rows.isEmpty())
        assertEquals(4, m.upcoming?.count)
        assertTrue(m.upcomingItems(emptySet()).isEmpty())
    }

    /** A tick in Upcoming hides that occurrence; a tick in Today hides the task in both lists. */
    @Test fun upcomingTicksAreHiddenByOccurrence() {
        val m = WidgetModel.parse(withUpcoming(upRow("a", "2026-10-23"), upRow("b", "2026-10-23"), upRow("b", "2026-10-25"), count = 3))!!
        val ticked = setOf(WidgetPending.key("b", "2026-10-23"))
        assertEquals(listOf("a", "b@2026-10-25"), m.upcomingItems(ticked).filterIsInstance<WidgetModel.Item.Task>().map { WidgetPending.key(it.row.id, if (it.row.id == "b") it.row.date else null) })
        assertEquals(2, m.upcomingCount(ticked))
        assertEquals(1, m.upcomingCount(setOf("b")))
        assertTrue(m.lists("b", "2026-10-25"))
        assertFalse(m.lists("b", "2026-10-24"))
        assertFalse(m.lists("b", null))
    }

    /** A repeating task ticked under Thursday shows under its next date as soon as a publication lists it there. */
    @Test fun upcomingTickIsConfirmedPerOccurrence() {
        val now = 1_000_000_000L
        val pending = WidgetPending.add(emptyMap(), WidgetPending.key("water", "2026-10-22"), now)
        val before = WidgetModel.parse(withUpcoming(upRow("water", "2026-10-22")))
        assertEquals(pending.keys, WidgetPending.prune(pending, before, now + 1).keys)
        val moved = WidgetModel.parse(withUpcoming(upRow("water", "2026-10-24")))!!
        val left = WidgetPending.prune(pending, moved, now + 2)
        assertTrue(left.isEmpty())
        assertEquals(listOf("water"), moved.upcomingItems(left.keys).filterIsInstance<WidgetModel.Item.Task>().map { it.row.id })
        // A Today tick stays until Today no longer lists the task.
        val today = WidgetModel.parse(withUpcoming(today = row("t")))
        assertEquals(setOf("t"), WidgetPending.prune(mapOf("t" to now), today, now + 3).keys)
    }

    /** A tick in Upcoming hides the same task's Today row too (an overdue repeating task can be in both). */
    @Test fun anUpcomingTickHidesTheTodayRow() {
        val m = WidgetModel.parse(withUpcoming(upRow("a", "2026-10-23"), today = row("a")))!!
        val ticked = setOf(WidgetPending.key("a", "2026-10-23"))
        assertTrue(m.visibleRows(ticked).isEmpty())
        assertEquals(0, m.visibleCount(ticked))
        assertEquals(setOf("a", "t/1@x"), WidgetPending.ids(setOf("a@2026-10-23", "t/1@x")))
    }

    /** android-upcoming-calendar-widgets D6: a tick names its occurrence only where the web app reads it. */
    @Test fun aTickNamesItsOccurrence() {
        val json = """{"updatedAt":1,"locked":false,"count":1,"tasks":[{"id":"a","title":"A","due":"2026-10-22","priority":4}],"actions":["complete","complete-on"],
            "upcoming":{"count":1,"tasks":[{"id":"b","date":"2026-10-23","due":"2026-10-24","priority":4},{"id":"c","date":"2026-10-25","priority":4}]}}"""
        val m = WidgetModel.parse(json)!!
        assertTrue(m.canCompleteOn)
        assertEquals("a@2026-10-22", m.completion(m.row("a", null)!!))
        // A span listed under its first day names its due day; a deadline-only row has no due.
        assertEquals("b@2026-10-24", m.completion(m.row("b", "2026-10-23")!!))
        assertEquals("c", m.completion(m.row("c", "2026-10-25")!!))
        val older = WidgetModel.parse(json.replace(""","complete-on"""", ""))!!
        assertFalse(older.canCompleteOn)
        assertEquals("a", older.completion(older.row("a", null)!!))
    }

    /** android-upcoming-calendar-widgets D7: the app's logical day, live from its day start. */
    @Test fun theAppsLogicalToday() {
        val early = java.time.LocalDateTime.parse("2026-10-23T02:30")
        assertEquals(LocalDate.parse("2026-10-22"), WidgetModel.logicalToday(240, "2026-10-20", early))
        assertEquals(LocalDate.parse("2026-10-23"), WidgetModel.logicalToday(0, null, early))
        assertEquals(LocalDate.parse("2026-10-20"), WidgetModel.logicalToday(null, "2026-10-20", early))
        assertEquals(LocalDate.parse("2026-10-23"), WidgetModel.logicalToday(null, "junk", early))
        assertEquals(java.time.LocalDateTime.parse("2026-10-23T04:00"), CalendarWidget.nextDayStart(early, 240))
        assertEquals(java.time.LocalDateTime.parse("2026-10-24T00:00"), CalendarWidget.nextDayStart(early, 0))
    }

    @Test fun aRepublicationWithinTheMinuteIsNotRedrawn() {
        val a = publication(row("a")).replace("\"updatedAt\":1", "\"updatedAt\":1000")
        assertTrue(WidgetStore.sameWithinAMinute(a, a.replace("1000", "30000")))
        assertFalse(WidgetStore.sameWithinAMinute(a, a.replace("1000", "70000")))
        assertFalse(WidgetStore.sameWithinAMinute(a, publication(row("b")).replace("\"updatedAt\":1", "\"updatedAt\":1000")))
        assertFalse(WidgetStore.sameWithinAMinute(null, a))
    }

    @Test fun upcomingDayHeadings() {
        val today = LocalDate.parse("2026-10-22")
        assertEquals("Tomorrow", TodayWidget.dayHeading("2026-10-23", today, "Tomorrow", "EEE, MMM d", Locale.US))
        assertEquals("Sat, Oct 24", TodayWidget.dayHeading("2026-10-24", today, "Tomorrow", "EEE, MMM d", Locale.US))
        assertEquals("nonsense", TodayWidget.dayHeading("nonsense", today, "Tomorrow", "EEE, MMM d", Locale.US))
    }

    /** A row tap's fill-in, read by WidgetActionActivity: open a task (or Today), or complete one. */
    @Test fun rowTapsRoute() {
        assertEquals(WidgetAction.Open("/?task=t%2F1"), WidgetAction.route(WidgetAction.KIND_OPEN, "t/1"))
        assertEquals(WidgetAction.Open("/today"), WidgetAction.route(WidgetAction.KIND_OPEN, null))
        assertEquals(WidgetAction.Complete("a"), WidgetAction.route(WidgetAction.KIND_COMPLETE, "a"))
        // android-upcoming-calendar-widgets D3: an Upcoming tick carries its day; a malformed day is dropped.
        assertEquals(WidgetAction.Complete("a", "2026-10-23"), WidgetAction.route(WidgetAction.KIND_COMPLETE, "a", "2026-10-23"))
        assertEquals(WidgetAction.Complete("a"), WidgetAction.route(WidgetAction.KIND_COMPLETE, "a", "soon"))
        assertEquals(WidgetAction.Open("/upcoming"), WidgetAction.route(WidgetAction.KIND_OPEN_UPCOMING, null))
        assertNull(WidgetAction.route(WidgetAction.KIND_COMPLETE, ""))
        assertNull(WidgetAction.route("delete", "a"))
        assertNull(WidgetAction.route(null, "a"))
    }
}
