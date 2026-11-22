package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale

class CompletedModelTest {
    @Test fun barsScaleToTheBusiestDayAndKeepASliver() {
        assertEquals(100, CompletedModel.barLevel(4, 4))
        assertEquals(50, CompletedModel.barLevel(2, 4))
        assertEquals(6, CompletedModel.barLevel(1, 40))
        assertEquals(0, CompletedModel.barLevel(0, 4))
        assertEquals(0, CompletedModel.barLevel(0, 0))
    }

    @Test fun aLockedPublicationKeepsNoDays() {
        val m = CompletedModel.parse("""{"updatedAt":5,"locked":true,"completed":{"today":3,"days":[{"day":"2026-11-21","done":3}]}}""")!!
        assertEquals(CompletedModel(5, true, 3, emptyList()), m)
    }

    @Test fun badDaysAndNegativeCountsAreIgnored() {
        val m = CompletedModel.parse("""{"updatedAt":5,"locked":false,"completed":{"today":-1,"days":[{"day":"x","done":2},{"day":"2026-11-21","done":-4}]}}""")!!
        assertEquals(CompletedModel(5, false, 0, listOf(CompletedModel.Day("2026-11-21", 0))), m)
        assertNull(CompletedModel.parse("not json"))
        assertNull(CompletedModel.parse(null))
    }

    @Test fun weekdayLettersFollowTheLanguage() {
        assertEquals("S", CompletedWidget.weekdayLetter("2026-11-21", Locale.ENGLISH))
        assertEquals("M", CompletedWidget.weekdayLetter("2026-11-23", Locale.ENGLISH))
        assertEquals("L", CompletedWidget.weekdayLetter("2026-11-23", Locale.ITALIAN))
    }
}
