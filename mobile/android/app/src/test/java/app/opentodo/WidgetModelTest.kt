package app.opentodo

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

    /** A row tap's fill-in, read by WidgetActionActivity: open a task (or Today), or complete one. */
    @Test fun rowTapsRoute() {
        assertEquals(WidgetAction.Open("/?task=t%2F1"), WidgetAction.route(WidgetAction.KIND_OPEN, "t/1"))
        assertEquals(WidgetAction.Open("/today"), WidgetAction.route(WidgetAction.KIND_OPEN, null))
        assertEquals(WidgetAction.Complete("a"), WidgetAction.route(WidgetAction.KIND_COMPLETE, "a"))
        assertNull(WidgetAction.route(WidgetAction.KIND_COMPLETE, ""))
        assertNull(WidgetAction.route("delete", "a"))
        assertNull(WidgetAction.route(null, "a"))
    }
}
