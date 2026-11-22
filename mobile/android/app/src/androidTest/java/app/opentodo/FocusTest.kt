package app.opentodo

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.os.Build
import android.service.notification.StatusBarNotification
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * focus-live-activity tasks 3.2 and 3.3: a publication posts the ongoing notification with
 * the chronometer and Pause, the planned end replaces it with "Session done", and none
 * removes it.
 */
@RunWith(AndroidJUnit4::class)
class FocusTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    @Before fun setUp() {
        resetApp()
        allowExactAlarms()
        Focus.foreground = false
    }

    @After fun tearDown() {
        Focus.clear(context)
        resetApp()
    }

    private fun shown(id: Int): StatusBarNotification? =
        context.getSystemService(NotificationManager::class.java).activeNotifications.firstOrNull { it.id == id }

    private fun running(endInMs: Long, title: String? = "Write the report"): String {
        val now = System.currentTimeMillis()
        return JSONObject().put("v", 1).put("state", "running").put("taskId", "t1").put("mode", "pomodoro").put("phase", "work")
            .put("cycle", 1).put("cycleLength", 4).put("phaseStartedAt", now).put("runningSince", now).put("elapsedMs", 0)
            .put("plannedEndAt", now + endInMs).put("plannedMs", endInMs)
            .apply { if (title != null) put("title", title) }.toString()
    }

    @Test fun aRunningSessionShowsAnOngoingNotificationAndNoneRemovesIt() {
        Focus.publish(context, running(25 * 60_000L))
        var n: StatusBarNotification? = null
        waitUntil("the Focus notification", 10_000) { n = shown(Focus.ONGOING_ID); n != null }
        val notification = n!!.notification
        assertEquals("Write the report", notification.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(context.getString(R.string.focus_work_of, 1, 4), notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
        assertTrue(notification.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER))
        assertTrue(n!!.isOngoing)
        assertEquals(listOf(context.getString(R.string.focus_pause)), notification.actions.map { it.title.toString() })
        Focus.publish(context, """{"v":1,"state":"none"}""")
        waitUntil("the Focus notification removed", 10_000) { shown(Focus.ONGOING_ID) == null }
        assertNull(Prefs(context).focus)
    }

    @Test fun thePlannedEndReplacesItWithSessionDone() {
        Focus.publish(context, running(3_000, title = null))
        var end: StatusBarNotification? = null
        waitUntil("the session-end notification", 30_000) { end = shown(Focus.END_ID); end != null }
        assertEquals(context.getString(R.string.focus_done), end!!.notification.extras.getString(Notification.EXTRA_TITLE))
        assertNull(shown(Focus.ONGOING_ID))
    }

    @Test fun pausedShowsResumeAndArmsNothing() {
        val now = System.currentTimeMillis()
        Focus.publish(context, """{"v":1,"state":"paused","taskId":"t1","mode":"pomodoro","phase":"work","phaseStartedAt":$now,"elapsedMs":600000,"plannedMs":1500000}""")
        var n: StatusBarNotification? = null
        waitUntil("the paused notification", 10_000) { n = shown(Focus.ONGOING_ID); n != null }
        assertEquals(context.getString(R.string.focus_generic), n!!.notification.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(context.getString(R.string.focus_paused) + " · 15:00", n!!.notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString())
        assertEquals(listOf(context.getString(R.string.focus_resume)), n!!.notification.actions.map { it.title.toString() })
    }
}
