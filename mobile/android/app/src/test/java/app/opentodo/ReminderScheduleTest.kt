package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderScheduleTest {
    private val now = 1_800_000_000_000L
    private val hour = 3_600_000L

    @Test fun parsesFiltersAndSorts() {
        val json = """[
          {"id":"r2","taskId":"t2","fireAt":${now + 2 * hour}},
          {"id":"r1","taskId":"t1","fireAt":${now + hour},"title":"Call the plumber"},
          {"id":"old","taskId":"t3","fireAt":${now - hour}},
          {"id":"far","taskId":"t4","fireAt":${now + 9 * 24 * hour}},
          {"id":"r1","taskId":"t1","fireAt":${now + 3 * hour}},
          {"taskId":"t5","fireAt":${now + hour}},
          {"id":"r6","taskId":"t6","fireAt":"soon"},
          {"id":"r7","taskId":"t7","fireAt":${now + hour},"title":null}
        ]"""
        val list = ReminderSchedule.parse(json, now)
        assertEquals(listOf("r1", "r7", "r2"), list.map { it.id })
        assertEquals("Call the plumber", list[0].title)
        assertEquals(null, list[1].title)
        assertEquals(null, list[2].title)
    }

    @Test fun aLateHandOverStillFires() {
        val list = ReminderSchedule.parse("""[{"id":"r","taskId":"t","fireAt":${now - 30_000}}]""", now)
        assertEquals(1, list.size)
    }

    @Test fun badInputIsEmpty() {
        assertTrue(ReminderSchedule.parse("not json", now).isEmpty())
        assertTrue(ReminderSchedule.parse("{}", now).isEmpty())
        assertTrue(ReminderSchedule.parse("[]", now).isEmpty())
    }

    @Test fun roundTrip() {
        val list = listOf(ShellReminder("r1", "t1", now + hour, "A"), ShellReminder("r2", "t2", now + 2 * hour, null))
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), now))
    }

    @Test fun atMost500() {
        val json = (0 until 600).joinToString(",", "[", "]") { """{"id":"r$it","taskId":"t","fireAt":${now + it * 1000L}}""" }
        assertEquals(ReminderSchedule.MAX, ReminderSchedule.parse(json, now).size)
    }

    @Test fun actionAddressesMatchTheWebApp() {
        assertEquals("/?reminder=r+1&action=snooze", ReminderSchedule.actionPath("r 1", "snooze"))
        assertEquals("/?reminder=abc&action=dismiss", ReminderSchedule.actionPath("abc", "dismiss"))
        assertEquals("/?task=t%2F1", ReminderSchedule.taskPath("t/1"))
    }
}
