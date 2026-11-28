package app.opentodo

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Calendar widget's data and grid (android-upcoming-calendar-widgets D1, D4). */
class CalendarModelTest {
    private fun publication(calendar: String, locked: Boolean = false) =
        """{"updatedAt":5,"locked":$locked,"count":0,"overdue":0,"tasks":[],"calendar":$calendar}"""

    @Test fun nothingPublished() {
        assertNull(CalendarModel.parse(null))
        assertNull(CalendarModel.parse("not json"))
        // A web app that publishes no calendar: the widget asks to open the app.
        assertNull(CalendarModel.parse("""{"updatedAt":1,"locked":false,"count":0,"overdue":0,"tasks":[]}"""))
    }

    @Test fun daysAndHowToOpenThem() {
        val m = CalendarModel.parse(publication("""{"weekStart":0,"dayView":false,"days":{"2026-11-03":2,"2026-11-18":1}}"""))!!
        assertEquals(CalendarModel(5, false, 0, false, mapOf("2026-11-03" to 2, "2026-11-18" to 1)), m)
        assertEquals(2, m.count(LocalDate.parse("2026-11-03")))
        assertEquals(0, m.count(LocalDate.parse("2026-11-04")))
        assertEquals("/upcoming", m.dayPath(LocalDate.parse("2026-11-18")))
        val on = m.copy(dayView = true)
        assertEquals("/day/2026-11-18", on.dayPath(LocalDate.parse("2026-11-18")))
        assertEquals("/month/2026-11-01", on.monthPath(YearMonth.of(2026, 11)))
    }

    @Test fun badDaysAreDroppedAndLockedHasNone() {
        val m = CalendarModel.parse(publication("""{"weekStart":9,"days":{"soon":3,"2026-11-03":0,"2026-11-04":-1,"2026-11-05":1}}"""))!!
        assertNull(m.weekStart)
        assertTrue(m.dayView)
        assertEquals(mapOf("2026-11-05" to 1), m.days)
        val locked = CalendarModel.parse(publication("""{"weekStart":1,"dayView":true,"days":{"2026-11-05":1}}""", locked = true))!!
        assertTrue(locked.days.isEmpty())
        assertTrue(locked.locked)
    }

    /** Six weeks from the first day of the week, as the app's Month (month.ts monthGrid). */
    @Test fun sixWeeksFromTheFirstDayOfTheWeek() {
        // November 2026 starts on a Sunday.
        val monday = CalendarModel.grid(YearMonth.of(2026, 11), 1)
        assertEquals(6, monday.size)
        assertTrue(monday.all { it.size == 7 })
        assertEquals(LocalDate.parse("2026-10-26"), monday[0][0])
        assertTrue(monday.all { it[0].dayOfWeek == DayOfWeek.MONDAY })
        assertEquals(LocalDate.parse("2026-12-06"), monday[5][6])
        val sunday = CalendarModel.grid(YearMonth.of(2026, 11), 0)
        assertEquals(LocalDate.parse("2026-11-01"), sunday[0][0])
        val saturday = CalendarModel.grid(YearMonth.of(2026, 11), 6)
        assertEquals(LocalDate.parse("2026-10-31"), saturday[0][0])
    }

    @Test fun weekStartAndMonths() {
        assertEquals(0, CalendarModel.localeWeekStart(Locale.US))
        assertEquals(1, CalendarModel.localeWeekStart(Locale.GERMANY))
        assertEquals(0, CalendarModel.clampOffset(-1))
        assertEquals(5, CalendarModel.clampOffset(9))
        assertEquals(listOf("M", "T", "W", "T", "F", "S", "S"), CalendarWidget.weekdayLetters(1, Locale.US))
        assertEquals("S", CalendarWidget.weekdayLetters(0, Locale.US)[0])
    }
}
