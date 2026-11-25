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
        val list = listOf(ShellReminder("r1", "t1", now + hour, "A"), ShellReminder("r2", "t2", now + 2 * hour, null))
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), now))
    }

    /** The alarm receiver reads the stored schedule without a window: a 2026 timestamp is not "beyond the horizon of 1970". */
    @Test fun theStoredScheduleIsReadWithoutTheTimeWindow() {
        val list = listOf(ShellReminder("r1", "t1", now + hour, "A"))
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), null))
        assertTrue(ReminderSchedule.parse(ReminderSchedule.toJson(list), 0).isEmpty())
    }

    /** android-urgent-alarms D3: only a JSON `true` makes a reminder urgent, and the stored schedule keeps it (a reboot re-arms it). */
    @Test fun urgentIsReadStrictlyAndStored() {
        val json = """[{"id":"a","taskId":"t","fireAt":${now + hour},"urgent":true},{"id":"b","taskId":"t","fireAt":${now + hour},"urgent":"true"},{"id":"c","taskId":"t","fireAt":${now + hour},"urgent":1},{"id":"d","taskId":"t","fireAt":${now + hour}}]"""
        val list = ReminderSchedule.parse(json, now)
        assertEquals(listOf(true, false, false, false), list.map { it.urgent })
        assertEquals(list, ReminderSchedule.parse(ReminderSchedule.toJson(list), null))
        // An ordinary reminder is stored as before, without the field.
        assertTrue(!ReminderSchedule.toJson(list.drop(1)).contains("urgent"))
    }

    @Test fun anUrgentReminderIsAnAlarmClockOnlyWhenExact() {
        val urgent = ShellReminder("a", "t", now, null, urgent = true)
        assertTrue(UrgentAlarms.armAsAlarmClock(urgent, exact = true))
        assertEquals(false, UrgentAlarms.armAsAlarmClock(urgent, exact = false))
        assertEquals(false, UrgentAlarms.armAsAlarmClock(urgent.copy(urgent = false), exact = true))
    }

    /** android-urgent-alarms D4: exact alarms first, then full-screen, each only where Android asks for it and once. */
    @Test fun urgentAlarmsAskEachMissingPermissionOnce() {
        fun ask(sdk: Int, exact: Boolean = false, full: Boolean = false, askedExact: Boolean = false, askedFull: Boolean = false) =
            UrgentAlarms.nextAsk(sdk, exact, full, askedExact, askedFull)
        // Before Android 12 neither is a permission.
        assertEquals(null, ask(30))
        // Android 12 and 13: exact alarms only (full-screen is granted at install).
        assertEquals(UrgentAlarms.EXACT, ask(31))
        assertEquals(null, ask(33, askedExact = true))
        assertEquals(null, ask(33, exact = true))
        // Android 14+: exact first, then full-screen, then nothing.
        assertEquals(UrgentAlarms.EXACT, ask(34))
        assertEquals(UrgentAlarms.FULL_SCREEN, ask(34, askedExact = true))
        assertEquals(UrgentAlarms.FULL_SCREEN, ask(36, exact = true))
        assertEquals(null, ask(36, askedExact = true, askedFull = true))
        assertEquals(null, ask(36, exact = true, full = true))
        assertEquals(null, ask(36, exact = true, askedFull = true))
    }

    /** android-urgent-alarms D2: one answer per firing, so a repeating task is not advanced twice. */
    @Test fun aFiringIsAnsweredOnce() {
        val first = UrgentAlarms.firstAnswer("{}", "r1", now, now)
        assertTrue(first != null)
        // A second tap, or Done from the shade while the alarm screen is open.
        assertEquals(null, UrgentAlarms.firstAnswer(first!!, "r1", now, now + 1000))
        assertEquals(null, UrgentAlarms.firstAnswer(first, "r1", now + 30_000, now + 1000))
        // Snoozed, the next firing is answered again; another reminder is another.
        assertTrue(UrgentAlarms.firstAnswer(first, "r1", now + 10 * 60_000, now + 10 * 60_000) != null)
        assertTrue(UrgentAlarms.firstAnswer(first, "r2", now, now) != null)
        // A location reminder has no time: every answer counts and nothing is stored.
        assertEquals(first, UrgentAlarms.firstAnswer(first, "g1", 0, now))
    }

    @Test fun theLockedAlarmScreenHidesTheTitleWhenPrivateContentIsHidden() {
        assertTrue(UrgentAlarms.showTitle(locked = false, privateOnLockScreen = false))
        assertTrue(UrgentAlarms.showTitle(locked = true, privateOnLockScreen = true))
        assertEquals(false, UrgentAlarms.showTitle(locked = true, privateOnLockScreen = false))
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
