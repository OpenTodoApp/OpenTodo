package app.opentodo

import android.appwidget.AppWidgetHost
import android.appwidget.AppWidgetHostView
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.view.View
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Task 4.6: the Today widget draws the web app's publication and nothing else (native-shells D6).
 * The test is the widget host, as a launcher would be, after the shell grants it the bind.
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
        shell("appwidget grantbind --package ${context.packageName} --user current")
        val manager = AppWidgetManager.getInstance(context)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            host = AppWidgetHost(context, HOST_ID)
            host.startListening()
            widgetId = host.allocateAppWidgetId()
            assertTrue("bind allowed", manager.bindAppWidgetIdIfAllowed(widgetId, ComponentName(context, TodayWidget::class.java)))
            view = host.createView(context, widgetId, manager.getAppWidgetInfo(widgetId))
        }
    }

    @After fun tearDown() {
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

    private fun visible(id: Int): Boolean {
        var v = false
        InstrumentationRegistry.getInstrumentation().runOnMainSync { v = view.findViewById<View>(id)?.visibility == View.VISIBLE }
        return v
    }

    @Test fun beforeAnyPublicationItAsksToOpenTheApp() {
        WidgetStore.redraw(context)
        waitUntil("the empty widget") { text(R.id.message) == context.getString(R.string.widget_open_app) }
    }

    @Test fun drawsTheTodayList() {
        val requests = server.paths.size
        WidgetStore.publish(context, """{"updatedAt":${System.currentTimeMillis()},"locked":false,"count":7,"overdue":1,
            "tasks":[{"id":"a","title":"Pay rent","time":"09:00","priority":1,"overdue":true},{"id":"b","title":"Call Ana","priority":4}]}""")
        waitUntil("the rows") { text(R.id.row0) == "09:00  Pay rent" }
        assertEquals("Call Ana", text(R.id.row1))
        assertTrue(!visible(R.id.row2))
        assertEquals("7", text(R.id.count))
        assertEquals(context.getString(R.string.widget_more, 5), text(R.id.more))
        // The widget never asks the server for anything itself.
        assertEquals(requests, server.paths.size)
    }

    @Test fun whileLockedOnlyCounts() {
        WidgetStore.publish(context, """{"updatedAt":${System.currentTimeMillis()},"locked":true,"count":3,"overdue":1,"tasks":[{"id":"a","title":"Secret"}]}""")
        waitUntil("the locked widget") { text(R.id.message) == context.getString(R.string.widget_locked, 3, 1) }
        assertTrue(!visible(R.id.row0))
        assertTrue(!visible(R.id.more))
    }

    @Test fun clearingTheServerEmptiesTheWidget() {
        WidgetStore.publish(context, """{"updatedAt":1,"locked":false,"count":1,"tasks":[{"id":"a","title":"Pay rent"}]}""")
        waitUntil("the row") { text(R.id.row0) == "Pay rent" }
        WidgetStore.clear(context)
        waitUntil("the empty widget") { text(R.id.message) == context.getString(R.string.widget_open_app) }
    }

    companion object { private const val HOST_ID = 4242 }
}
