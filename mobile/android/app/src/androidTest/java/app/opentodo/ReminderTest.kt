package app.opentodo

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.service.notification.StatusBarNotification
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Task 4.5: the handed-over schedule fires as notifications, with Snooze, Dismiss and a tap (native-shells D4). */
@RunWith(AndroidJUnit4::class)
class ReminderTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    private lateinit var server: FakeServer

    @Before fun setUp() {
        resetApp()
        allowExactAlarms()
        server = FakeServer()
        Prefs(context).server = server.origin
    }

    @After fun tearDown() {
        server.shutdown()
        resetApp()
    }

    private fun schedule(id: String, inMs: Long, title: String? = "Water the plants"): String {
        val r = JSONObject().put("id", id).put("taskId", "task-$id").put("fireAt", System.currentTimeMillis() + inMs)
        if (title != null) r.put("title", title)
        return JSONArray().put(r).toString()
    }

    /**
     * The pending section of `dumpsys alarm` (from its "Pending alarm…" header to the next line
     * indented no deeper): the removal and delivery histories list the same tags.
     */
    private fun pendingSection(): List<String> {
        val lines = shell("dumpsys alarm").lines()
        val start = lines.indexOfFirst { it.trim().startsWith("Pending alarm") }
        if (start < 0) return emptyList()
        val indent = lines[start].indexOfFirst { !it.isWhitespace() }
        val end = (start + 1 until lines.size).firstOrNull { i ->
            val l = lines[i]; l.isNotBlank() && l.indexOfFirst { !it.isWhitespace() } <= indent
        } ?: lines.size
        return lines.subList(start, end)
    }

    /** The app's pending alarms (`tag=*walarm*:app.opentodo/.AlarmReceiver`). */
    private fun armedAlarms(): Int = pendingSection().count { it.contains("*walarm*:${context.packageName}/.AlarmReceiver") }

    private fun shown(id: String): StatusBarNotification? =
        context.getSystemService(NotificationManager::class.java).activeNotifications.firstOrNull { it.id == Notifier.notificationId(id) }

    private fun waitForNotification(id: String, timeoutMs: Long = 30_000): StatusBarNotification {
        var n: StatusBarNotification? = null
        waitUntil("the notification of $id", timeoutMs) { n = shown(id); n != null }
        return n!!
    }

    @Test fun anExactAlarmFiresTheNotification() {
        assertTrue("exact alarms allowed for the test", Scheduler.canExact(context))
        Scheduler.replace(context, schedule("r1", 3_000))
        val n = waitForNotification("r1")
        assertEquals("Water the plants", n.notification.extras.getString(Notification.EXTRA_TITLE))
        val actions = n.notification.actions.map { it.title.toString() }
        assertEquals(listOf(context.getString(R.string.action_snooze), context.getString(R.string.action_dismiss)), actions)
    }

    @Test fun withoutExactAlarmsTheInexactFallbackIsArmed() {
        // Android may hold an inexact alarm back by minutes, so this checks it is armed, not that it fired.
        val before = armedAlarms()
        val list = ReminderSchedule.parse(schedule("r2", 60 * 60_000), System.currentTimeMillis())
        Prefs(context).reminders = ReminderSchedule.toJson(list)
        Scheduler.arm(context, list, exact = false)
        var armed = 0
        try {
            waitUntil("the inexact alarm in dumpsys alarm") { armed = armedAlarms(); armed > before }
            Scheduler.clear(context)
            waitUntil("the alarm to be cancelled") { armedAlarms() < armed }
        } catch (e: AssertionError) {
            val ours = pendingSection().filter { it.contains(context.packageName) }.take(20)
            throw AssertionError("${e.message}; before=$before armed=$armed; pending lines: $ours")
        }
    }

    @Test fun withoutATitleTheNotificationSaysReminder() {
        // No title handed over (titles off, or an encrypted account): the generic text.
        Scheduler.replace(context, schedule("r8", 60 * 60_000, title = null))
        assertTrue(Notifier.reminder(context, Scheduler.find(context, "r8")!!))
        assertEquals(context.getString(R.string.reminder_generic), waitForNotification("r8").notification.extras.getString(Notification.EXTRA_TITLE))
    }

    @Test fun snoozeAppliesInTheBackgroundAtTheActionAddress() {
        Scheduler.replace(context, schedule("r3", 60 * 60_000))
        assertTrue(Notifier.reminder(context, Scheduler.find(context, "r3")!!))
        val n = waitForNotification("r3")
        n.notification.actions[0].actionIntent.send()
        waitUntil("the notification to go") { shown("r3") == null }
        assertEquals("/?reminder=r3&action=snooze", server.waitForPath("/?reminder=", timeoutMs = 60_000))
    }

    @Test fun dismissAppliesInTheBackgroundAtTheActionAddress() {
        Scheduler.replace(context, schedule("r4", 60 * 60_000))
        assertTrue(Notifier.reminder(context, Scheduler.find(context, "r4")!!))
        waitForNotification("r4").notification.actions[1].actionIntent.send()
        waitUntil("the notification to go") { shown("r4") == null }
        assertEquals("/?reminder=r4&action=dismiss", server.waitForPath("/?reminder=", timeoutMs = 60_000))
    }

    @Test fun aTapOpensTheTask() {
        // The app in front, as when Android delivers the tap (a test process may not start activities from the background).
        androidx.test.core.app.ActivityScenario.launch(MainActivity::class.java)
        server.waitForPath("/")
        Scheduler.replace(context, schedule("r5", 60 * 60_000))
        assertTrue(Notifier.reminder(context, Scheduler.find(context, "r5")!!))
        waitForNotification("r5").notification.contentIntent.send()
        assertEquals("/?task=task-r5", server.waitForPath("/?task="))
    }

    @Test fun aRebootArmsTheStoredScheduleAgain() {
        // As after a reboot: the schedule is stored, nothing is armed.
        val list = ReminderSchedule.parse(schedule("r6", 3_000), System.currentTimeMillis())
        Prefs(context).reminders = ReminderSchedule.toJson(list)
        BootReceiver().onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))
        waitForNotification("r6")
    }

    @Test fun anEmptyHandOverClearsTheSchedule() {
        Scheduler.replace(context, schedule("r7", 60 * 60_000))
        Scheduler.replace(context, "[]")
        assertEquals("[]", Prefs(context).reminders)
    }
}
