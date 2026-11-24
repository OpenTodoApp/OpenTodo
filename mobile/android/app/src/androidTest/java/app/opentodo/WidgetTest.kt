package app.opentodo

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.view.View
import android.widget.FrameLayout
import android.widget.ListView
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkInfo
import androidx.work.WorkManager
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Task 4.6: the Today widget draws the web app's publication and nothing else (native-shells D6).
 * The test is the widget host, as a launcher would be, after the shell grants it the bind; the
 * list's lines are drawn by the widget's own factory (android-widget-list D1).
 */
@RunWith(AndroidJUnit4::class)
class WidgetTest {
    private lateinit var server: FakeServer
    private lateinit var host: AppWidgetHost
    private var widgetId = 0
    private lateinit var view: AppWidgetHostView

    @Before fun setUp() {
        resetApp()
        server = FakeServer()
        Prefs(context).server = server.origin
        val grant = shell("appwidget grantbind --package ${context.packageName} --user ${android.os.Process.myUserHandle().hashCode()}")
        val manager = AppWidgetManager.getInstance(context)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            host = AppWidgetHost(context, HOST_ID)
            host.startListening()
            widgetId = host.allocateAppWidgetId()
            assertTrue("bind allowed (grantbind said: \"$grant\")", manager.bindAppWidgetIdIfAllowed(widgetId, ComponentName(context, TodayWidget::class.java)))
            view = host.createView(context, widgetId, manager.getAppWidgetInfo(widgetId))
        }
    }

    @After fun tearDown() {
        WorkManager.getInstance(context).cancelAllWork().result.get()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            host.deleteAppWidgetId(widgetId)
            host.stopListening()
        }
        server.shutdown()
        resetApp()
    }

    private fun text(id: Int): String {
        var s = ""
        InstrumentationRegistry.getInstrumentation().runOnMainSync { s = view.findViewById<TextView>(id)?.text?.toString() ?: "" }
        return s
    }

    private fun exists(id: Int): Boolean {
        var v = false
        InstrumentationRegistry.getInstrumentation().runOnMainSync { v = view.findViewById<View>(id) != null }
        return v
    }

    /** One drawn line of the list: its title or heading, its details, and whether it has a circle. */
    private data class Line(val text: String, val date: String = "", val meta: String = "", val circle: Boolean = false)

    private fun lines(): List<Line> {
        val factory = TodayListFactory(context)
        factory.onDataSetChanged()
        val out = ArrayList<Line>()
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            for (i in 0 until factory.count) {
                val v = factory.getViewAt(i).apply(context, FrameLayout(context))
                fun t(id: Int) = v.findViewById<TextView>(id)?.takeIf { it.visibility == View.VISIBLE }?.text?.toString() ?: ""
                val heading = v.findViewById<TextView>(R.id.heading)
                out += if (heading != null) Line(heading.text.toString())
                else Line(t(R.id.title), t(R.id.date), t(R.id.meta), v.findViewById<View>(R.id.check).visibility == View.VISIBLE)
            }
        }
        return out
    }

    @Test fun beforeAnyPublicationItAsksToOpenTheApp() {
        WidgetStore.redraw(context)
        waitUntil("the empty widget") { text(R.id.message) == context.getString(R.string.widget_open_app) }
        assertTrue(lines().isEmpty())
    }

    @Test fun drawsTheTodayListAsAScrollingList() {
        val requests = server.paths.size
        WidgetStore.publish(context, """{"updatedAt":${System.currentTimeMillis()},"locked":false,"count":3,"overdue":1,"actions":["complete"],
            "tasks":[{"id":"a","title":"Pay rent","date":"2026-10-20","project":"Home","priority":1,"overdue":true},
                     {"id":"b","title":"Call Ana","time":"09:00","priority":4},{"id":"c","title":"Water the plants","priority":4}]}""")
        waitUntil("the count") { text(R.id.count) == "3" }
        assertTrue(exists(R.id.list))
        assertTrue(exists(R.id.add))
        val drawn = lines()
        assertEquals(context.getString(R.string.widget_earlier), drawn[0].text)
        assertEquals("Pay rent", drawn[1].text)
        assertEquals("Home", drawn[1].meta)
        assertTrue(drawn[1].date.isNotEmpty())
        assertTrue(drawn[1].circle)
        assertEquals(context.getString(R.string.widget_today), drawn[2].text)
        assertEquals(Line("Call Ana", "", "09:00", true), drawn[3])
        assertEquals(Line("Water the plants", "", "", true), drawn[4])
        assertEquals(5, drawn.size)
        // The widget never asks the server for anything itself.
        assertEquals(requests, server.paths.size)
    }

    @Test fun anOlderWebAppGetsNoCircles() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":1,"tasks":[{"id":"a","title":"Pay rent"}]}""")
        assertEquals(listOf(Line("Pay rent")), lines())
    }

    @Test fun theCircleHidesTheRowAndQueuesTheCompletionForTheWebApp() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":2,"actions":["complete"],"tasks":[{"id":"a","title":"Pay rent"},{"id":"b","title":"Call Ana"}]}""")
        waitUntil("the count") { text(R.id.count) == "2" }
        context.sendBroadcast(Intent(context, WidgetActionReceiver::class.java).putExtra("kind", "complete").putExtra("id", "a"))
        waitUntil("the row hidden") { lines().map { it.text } == listOf("Call Ana") }
        waitUntil("the count") { text(R.id.count) == "1" }
        // One hidden run at the web app's completion address; the shell writes no task data.
        val runs = WorkManager.getInstance(context).getWorkInfosForUniqueWork("widget").get()
        assertEquals(1, runs.size)
        assertTrue(runs[0].state != WorkInfo.State.CANCELLED)
        // The next publication without the task confirms it; a later one that lists it again shows it.
        WidgetStore.publish(context, """{"updatedAt":2,"locked":false,"count":1,"actions":["complete"],"tasks":[{"id":"b","title":"Call Ana"}]}""")
        WidgetStore.publish(context, """{"updatedAt":3,"locked":false,"count":2,"actions":["complete"],"tasks":[{"id":"a","title":"Pay rent"},{"id":"b","title":"Call Ana"}]}""")
        assertEquals(listOf("Pay rent", "Call Ana"), lines().map { it.text })
    }

    @Test fun nothingLeftForToday() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":0,"actions":["complete"],"tasks":[]}""")
        waitUntil("the empty state") { text(R.id.message) == context.getString(R.string.widget_empty) }
        assertTrue(lines().isEmpty())
    }

    @Test fun whileLockedOnlyCounts() {
        WidgetStore.publish(context, """{"updatedAt":${System.currentTimeMillis()},"locked":true,"count":3,"overdue":1,"tasks":[{"id":"a","title":"Secret"}]}""")
        waitUntil("the locked widget") { text(R.id.message) == context.getString(R.string.widget_locked, 3, 1) }
        assertTrue(lines().isEmpty())
    }

    @Test fun clearingTheServerEmptiesTheWidget() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":1,"tasks":[{"id":"a","title":"Pay rent"}]}""")
        waitUntil("the count") { text(R.id.count) == "1" }
        WidgetStore.clear(context)
        waitUntil("the empty widget") { text(R.id.message) == context.getString(R.string.widget_open_app) }
        assertTrue(lines().isEmpty())
    }

    companion object { private const val HOST_ID = 4242 }
}
