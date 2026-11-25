package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderScheduleTest {
    private val now = 1_800_000_000_000L
    private val hour = 3_600_000L

    /** The cases both apps read (the iPhone app's ReminderTests too): reminders/schedule.json. */
    @Test fun theScheduleFollowsTheSharedCases() {
        val doc = JSONObject(javaClass.classLoader!!.getResource("reminders/schedule.json")!!.readText())
        val at = doc.getLong("now")
        val cases = doc.getJSONArray("cases")
        assertTrue("the fixture has cases", cases.length() > 0)
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val armed = c.getJSONArray("armed")
            val want = (0 until armed.length()).map { k ->
                val r = armed.getJSONObject(k)
                ShellReminder(r.getString("id"), "", r.getLong("fireAt"), if (r.isNull("title")) null else r.getString("title"))
            }
            val got = ReminderSchedule.parse(c.getString("handed"), at).map { it.copy(taskId = "") }
            assertEquals(c.getString("name"), want, got)
        }
    }

    @Test fun roundTrip() {
        val list = listOf(ShellReminder("r1", "t1", now + hour, "A", "Today 14:00"), ShellReminder("r2", "t2", now + 2 * hour, null))
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), now))
    }

    /** push-due-date D4: the due text is the body; an empty or missing one is none, a long one is cut. */
    @Test fun dueText() {
        val long = "x".repeat(150)
        val json = """[{"id":"a","taskId":"t","fireAt":${now + hour},"due":"Tomorrow"},{"id":"b","taskId":"t","fireAt":${now + hour},"due":""},{"id":"c","taskId":"t","fireAt":${now + hour},"due":"$long"},{"id":"d","taskId":"t","fireAt":${now + hour}}]"""
        assertEquals(listOf("Tomorrow", null, "x".repeat(100), null), ReminderSchedule.parse(json, now).map { it.due })
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
