package app.opentodo

import android.app.ActivityOptions
import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkManager
import java.time.LocalDate
import java.time.YearMonth
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * android-upcoming-calendar-widgets: the Upcoming and Calendar widgets draw the web app's
 * publication and nothing else. The test hosts both, as a launcher would (see WidgetTest).
 */
@RunWith(AndroidJUnit4::class)
class UpcomingCalendarWidgetTest {
    private lateinit var server: FakeServer
    private lateinit var host: AppWidgetHost
    private var upcomingId = 0
    private var calendarId = 0
    private lateinit var upcoming: AppWidgetHostView
    private lateinit var calendar: AppWidgetHostView

    @Before fun setUp() {
        resetApp()
        server = FakeServer()
        Prefs(context).server = server.origin
        shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow")
        val grant = shell("appwidget grantbind --package ${context.packageName} --user ${android.os.Process.myUserHandle().hashCode()}")
        val manager = AppWidgetManager.getInstance(context)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            host = AppWidgetHost(context, HOST_ID)
            host.startListening()
            upcomingId = host.allocateAppWidgetId()
            calendarId = host.allocateAppWidgetId()
            assertTrue("bind allowed (grantbind said: \"$grant\")", manager.bindAppWidgetIdIfAllowed(upcomingId, ComponentName(context, UpcomingWidget::class.java)))
            assertTrue(manager.bindAppWidgetIdIfAllowed(calendarId, ComponentName(context, CalendarWidget::class.java)))
            upcoming = host.createView(context, upcomingId, manager.getAppWidgetInfo(upcomingId))
            calendar = host.createView(context, calendarId, manager.getAppWidgetInfo(calendarId))
        }
    }

    @After fun tearDown() {
        shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW default")
        WorkManager.getInstance(context).cancelAllWork().result.get()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            host.deleteAppWidgetId(upcomingId)
            host.deleteAppWidgetId(calendarId)
            host.stopListening()
        }
        server.shutdown()
        resetApp()
    }

    /** A row's tap as a launcher sends it (WidgetTest.tap). */
    private fun tap(fill: Intent) {
        val options = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            ActivityOptions.makeBasic().setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED).toBundle()
        else null
        WidgetAction.template(context).send(context, 0, fill, null, null, null, options)
    }

    private fun text(view: View, id: Int): String {
        var s = ""
        InstrumentationRegistry.getInstrumentation().runOnMainSync { s = view.findViewById<TextView>(id)?.text?.toString() ?: "" }
        return s
    }

    /** The Upcoming list's drawn lines: headings as they read, tasks as their titles. */
    private fun lines(): List<String> {
        val factory = UpcomingListFactory(context)
        factory.onDataSetChanged()
        val out = ArrayList<String>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            for (i in 0 until factory.count) {
                val v = factory.getViewAt(i).apply(context, FrameLayout(context))
                out += (v.findViewById<TextView>(R.id.heading) ?: v.findViewById(R.id.title)).text.toString()
            }
        }
        return out
    }

    /** The calendar's drawn cells with a visible dot, as their day numbers. */
    private fun markedDays(): List<String> {
        val out = ArrayList<String>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            fun walk(v: View) {
                if (v.id == R.id.cell && v.findViewById<View>(R.id.day_dot).visibility == View.VISIBLE) out += v.findViewById<TextView>(R.id.day_number).text.toString()
                if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
            walk(calendar)
        }
        return out
    }

    private fun publication(tomorrow: LocalDate, locked: Boolean = false): String {
        val later = tomorrow.plusDays(2)
        return """{"updatedAt":${System.currentTimeMillis()},"locked":$locked,"count":0,"overdue":0,"tasks":[],"actions":["complete"],
            "upcoming":{"count":3,"tasks":[{"id":"a","title":"Book the dentist","date":"$tomorrow","time":"08:15","priority":4},
                {"id":"b","title":"Call Ana","date":"$tomorrow","priority":4},{"id":"c","title":"Water the plants","date":"$later","priority":4}]},
            "calendar":{"weekStart":1,"dayView":true,"days":{"$tomorrow":2,"$later":1}}}"""
    }

    @Test fun upcomingListsByDayAndTicksAnOccurrence() {
        val tomorrow = LocalDate.now().plusDays(1)
        val requests = server.paths.size
        WidgetStore.publish(context, publication(tomorrow))
        waitUntil("the count") { text(upcoming, R.id.count) == "3" }
        assertEquals(listOf(context.getString(R.string.widget_tomorrow), "Book the dentist", "Call Ana"), lines().take(3))
        assertEquals(5, lines().size)
        // The widgets never ask the server for anything themselves.
        assertEquals(requests, server.paths.size)
        tap(WidgetAction.fillComplete("b", tomorrow.toString()))
        waitUntil("the row hidden") { "Call Ana" !in lines() }
        waitUntil("the count") { text(upcoming, R.id.count) == "2" }
        assertEquals("/?complete=b", server.waitForPath("/?complete=", timeoutMs = 60_000))
    }

    @Test fun calendarMarksTheDaysWithTasksAndMovesItsOwnMonth() {
        // A day of this month, so the marks are on the month shown.
        val today = LocalDate.now()
        val day = if (today.plusDays(3).month == today.month) today else today.withDayOfMonth(1)
        WidgetStore.publish(context, publication(day))
        val month = YearMonth.from(today)
        waitUntil("the month") { text(calendar, R.id.month) == CalendarWidget.monthTitle(month) }
        waitUntil("the marks") { day.dayOfMonth.toString() in markedDays() }
        context.sendBroadcast(Intent(context, CalendarWidget::class.java).setAction(CalendarWidget.ACTION_MONTH)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, calendarId).putExtra(CalendarWidget.EXTRA_STEP, 1).setPackage(context.packageName))
        waitUntil("the next month") { text(calendar, R.id.month) == CalendarWidget.monthTitle(month.plusMonths(1)) }
        assertEquals(1, Prefs(context).calendarOffset(calendarId))
    }

    @Test fun lockedShowsCountsAndNoMarks() {
        WidgetStore.publish(context, publication(LocalDate.now().plusDays(1), locked = true))
        waitUntil("the locked Upcoming") { text(upcoming, R.id.message) == context.getString(R.string.widget_upcoming_locked, 3) }
        waitUntil("the locked calendar") { text(calendar, R.id.updated) == context.getString(R.string.widget_calendar_locked) }
        assertTrue(lines().isEmpty())
        assertTrue(markedDays().isEmpty())
    }

    @Test fun anOlderWebAppAsksToOpenTheApp() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":0,"tasks":[]}""")
        waitUntil("Upcoming") { text(upcoming, R.id.message) == context.getString(R.string.widget_open_app) }
        waitUntil("Calendar") { text(calendar, R.id.updated) == context.getString(R.string.widget_open_app) }
    }

    companion object { private const val HOST_ID = 4243 }
}
