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

    /** The alarm receiver reads the stored schedule without a window: a 2026 timestamp is not "beyond the horizon of 1970". */
    @Test fun theStoredScheduleIsReadWithoutTheTimeWindow() {
        val list = listOf(ShellReminder("r1", "t1", now + hour, "A"))
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), null))
        assertTrue(ReminderSchedule.parse(ReminderSchedule.toJson(list), 0).isEmpty())
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

    @Test fun doneComesFirstOnEveryReminder() {
        assertEquals(listOf("done", "snooze", "dismiss"), ReminderSchedule.REMINDER_ACTIONS)
        assertEquals(listOf("done", "dismiss"), ReminderSchedule.LOCATION_ACTIONS)
        for (a in ReminderSchedule.REMINDER_ACTIONS + ReminderSchedule.LOCATION_ACTIONS) assertTrue(ReminderSchedule.isAction(a))
        assertTrue(!ReminderSchedule.isAction("delete") && !ReminderSchedule.isAction(null))
    }

    /** shell-push D4: a firing is shown once, by its alarm or by a push, whichever comes first. */
    @Test fun aFiringIsShownOnce() {
        assertEquals(false, ReminderSchedule.wasShown("{}", "r1", now))
        val shown = ReminderSchedule.markShown("{}", "r1", now, now)
        assertTrue(ReminderSchedule.wasShown(shown, "r1", now))
        // The alarm and the push may name the time a little differently: the same minute is the same firing.
        assertTrue(ReminderSchedule.wasShown(shown, "r1", now + 59_999))
        assertTrue(ReminderSchedule.wasShown(shown, "r1", now - 59_999))
        // Snoozed ten minutes, the same reminder fires again; another reminder is another.
        assertEquals(false, ReminderSchedule.wasShown(shown, "r1", now + 10 * 60_000))
        assertEquals(false, ReminderSchedule.wasShown(shown, "r1", now + 60_000))
        assertEquals(false, ReminderSchedule.wasShown(shown, "r2", now))
        val snoozed = ReminderSchedule.markShown(shown, "r1", now + 10 * 60_000, now + 10 * 60_000)
        assertTrue(ReminderSchedule.wasShown(snoozed, "r1", now + 10 * 60_000))
        assertEquals(false, ReminderSchedule.wasShown(snoozed, "r1", now))
    }

    @Test fun shownFiringsAreForgottenAfterADayAndKeptFew() {
        var shown = ReminderSchedule.markShown("{}", "old", now - 25 * hour, now - 25 * hour)
        shown = ReminderSchedule.markShown(shown, "recent", now - 23 * hour, now - 23 * hour)
        shown = ReminderSchedule.markShown(shown, "new", now, now)
        assertEquals(false, ReminderSchedule.wasShown(shown, "old", now - 25 * hour))
        assertTrue(ReminderSchedule.wasShown(shown, "recent", now - 23 * hour))
        assertTrue(ReminderSchedule.wasShown(shown, "new", now))
        for (i in 1..300) shown = ReminderSchedule.markShown(shown, "r$i", now + i, now)
        assertEquals(200, org.json.JSONObject(shown).length())
        assertTrue(ReminderSchedule.wasShown(shown, "r300", now + 300))
        assertEquals(false, ReminderSchedule.wasShown(shown, "r1", now + 1))
        // Unreadable storage starts over.
        assertEquals(false, ReminderSchedule.wasShown("not json", "r1", now))
        assertTrue(ReminderSchedule.wasShown(ReminderSchedule.markShown("not json", "r1", now, now), "r1", now))
    }
}
