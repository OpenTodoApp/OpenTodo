package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetModelTest {
    @Test fun nothingPublished() {
        assertNull(WidgetModel.parse(null))
        assertNull(WidgetModel.parse(""))
        assertNull(WidgetModel.parse("not json"))
    }

    @Test fun todayList() {
        val tasks = (1..7).joinToString(",") { """{"id":"t$it","title":"Task $it","priority":${if (it == 1) 1 else 4},"overdue":${it == 1}${if (it == 2) ",\"time\":\"09:30\"" else ""}}""" }
        val m = WidgetModel.parse("""{"updatedAt":1800000000000,"locked":false,"count":9,"overdue":1,"tasks":[$tasks]}""")!!
        assertEquals(1800000000000L, m.updatedAt)
        assertEquals(9, m.count)
        assertEquals(WidgetModel.ROWS, m.rows.size)
        assertEquals(WidgetModel.Row("t1", "Task 1", null, 1, true), m.rows[0])
        assertEquals("09:30", m.rows[1].time)
        assertEquals(4, m.more)
    }

    @Test fun lockedShowsCountsOnly() {
        val m = WidgetModel.parse("""{"updatedAt":1,"locked":true,"count":3,"overdue":2,"tasks":[{"id":"t","title":"secret","priority":1,"overdue":true}]}""")!!
        assertTrue(m.locked)
        assertTrue(m.rows.isEmpty())
        assertEquals(3, m.count)
        assertEquals(2, m.overdue)
    }

    @Test fun badFieldsAreTamed() {
        val m = WidgetModel.parse("""{"updatedAt":1,"locked":false,"count":1,"overdue":0,"tasks":[{"id":"t","priority":9,"time":"soon"}]}""")!!
        assertEquals(WidgetModel.Row("t", null, null, 4, false), m.rows[0])
        assertEquals(0, m.more)
    }
}
