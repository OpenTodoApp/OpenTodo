package app.opentodo

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.util.Locale
import java.util.TimeZone

/** Stores the web app's publication and redraws the widgets; the widgets never request anything themselves. */
object WidgetStore {
    fun publish(context: Context, json: String) {
        if (json.length > 512 * 1024) return
        val model = WidgetModel.parse(json) ?: return
        val prefs = Prefs(context)
        val before = prefs.widget
        prefs.widget = json
        // android-widget-list D2: a completion the publication confirms (the row is gone) is done.
        val pending = WidgetPending.parse(prefs.widgetPending)
        val pruned = WidgetPending.prune(pending, model, System.currentTimeMillis())
        prefs.widgetPending = WidgetPending.toJson(pruned)
        // The web app republishes on every local change; the same content within the minute shown changes no pixel.
        if (pruned == pending && sameWithinAMinute(before, json)) return
        redraw(context)
    }

    /** Whether two publications differ only in an `updatedAt` less than a minute apart (android-upcoming-calendar-widgets). */
    fun sameWithinAMinute(before: String?, after: String): Boolean {
        val a = try { org.json.JSONObject(before ?: return false) } catch (e: Exception) { return false }
        val b = try { org.json.JSONObject(after) } catch (e: Exception) { return false }
        if (kotlin.math.abs(b.optLong("updatedAt") - a.optLong("updatedAt")) >= 60_000) return false
        a.remove("updatedAt")
        b.remove("updatedAt")
        return a.toString() == b.toString()
    }

    fun clear(context: Context) {
        val prefs = Prefs(context)
        prefs.widget = null
        prefs.widgetPending = null
        prefs.clearCalendarOffsets()
        redraw(context)
    }

    fun redraw(context: Context) {
        val m = AppWidgetManager.getInstance(context)
        val ids = m.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
        if (ids.isNotEmpty()) TodayWidget.draw(context, m, ids)
        val done = m.getAppWidgetIds(ComponentName(context, CompletedWidget::class.java))
        if (done.isNotEmpty()) CompletedWidget.draw(context, m, done)
        val upcoming = m.getAppWidgetIds(ComponentName(context, UpcomingWidget::class.java))
        if (upcoming.isNotEmpty()) UpcomingWidget.draw(context, m, upcoming)
        val calendar = m.getAppWidgetIds(ComponentName(context, CalendarWidget::class.java))
        if (calendar.isNotEmpty()) CalendarWidget.draw(context, m, calendar)
        // Day headings and the calendar's ring move at the start of the app's next day (D7).
        if (upcoming.isNotEmpty() || calendar.isNotEmpty()) CalendarWidget.scheduleNextDay(context)
    }

    /**
     * The completion circle (android-widget-list D2): hide the row now, and let the web app
     * complete the task in a background run, as its own op. Never written here. [date] is the
     * day of an Upcoming row, null for a Today row (android-upcoming-calendar-widgets D3).
     */
    fun complete(context: Context, taskId: String, date: String? = null) {
        val prefs = Prefs(context)
        val model = WidgetModel.parse(prefs.widget) ?: return
        val row = model.row(taskId, date)
        if (!model.canComplete || row == null) return
        prefs.widgetPending = WidgetPending.toJson(WidgetPending.add(WidgetPending.parse(prefs.widgetPending), WidgetPending.key(taskId, date), System.currentTimeMillis()))
        // `<id>@<due>` where the web app reads it, so a repeating task is advanced once (D6).
        prefs.queueWidgetCompletion(model.completion(row))
        redraw(context)
        HiddenRun.enqueueWidgetRun(context)
    }

    /**
     * The address one background run completes every queued task at (shared fixture
     * bridge/actions.json `completePaths`), and empties the queue so each is sent once;
     * null when nothing is queued (an earlier run of the chain took them).
     */
    fun takeCompletePath(context: Context): String? = Prefs(context).takeWidgetQueue().takeIf { it.isNotEmpty() }?.let { completePath(it) }

    fun completePath(taskIds: List<String>): String =
        "/?" + taskIds.joinToString("&") { "complete=" + java.net.URLEncoder.encode(it, "UTF-8") }

    /** The completions hidden now. */
    fun pending(context: Context): Set<String> =
        WidgetPending.active(WidgetPending.parse(Prefs(context).widgetPending), System.currentTimeMillis())

    fun open(context: Context, path: String, code: Int): PendingIntent =
        PendingIntent.getActivity(context, code, openIntent(context, path), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun openIntent(context: Context, path: String): Intent =
        Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("opentodo-open:" + Uri.encode(path)))
}

class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    companion object {
        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = WidgetModel.parse(Prefs(context).widget)
            val pending = WidgetStore.pending(context)
            val message = when {
                model == null -> context.getString(R.string.widget_open_app)
                model.locked -> context.getString(R.string.widget_locked, model.count, model.overdue)
                else -> context.getString(R.string.widget_empty)
            }
            for (id in ids) {
                val v = RemoteViews(context.packageName, R.layout.widget_today)
                v.setOnClickPendingIntent(R.id.header, WidgetStore.open(context, "/today", 100))
                v.setOnClickPendingIntent(R.id.add, WidgetStore.open(context, ReminderSchedule.QUICK_ADD_PATH, 200))
                v.setTextViewText(R.id.count, model?.visibleCount(pending)?.toString() ?: "")
                v.setTextViewText(R.id.updated, model?.let { context.getString(R.string.widget_updated, DateFormat.getTimeFormat(context).format(it.updatedAt)) } ?: "")
                v.setTextViewText(R.id.message, message)
                // One adapter per widget: the data URI keeps the service intents apart.
                val service = Intent(context, TodayListService::class.java)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                    .setData(Uri.parse("opentodo-widget:$id"))
                @Suppress("DEPRECATION")
                v.setRemoteAdapter(R.id.list, service)
                v.setEmptyView(R.id.list, R.id.message)
                v.setPendingIntentTemplate(R.id.list, WidgetAction.template(context))
                manager.updateAppWidget(id, v)
            }
            @Suppress("DEPRECATION")
            manager.notifyAppWidgetViewDataChanged(ids, R.id.list)
        }

        /** The phone's own month-and-day pattern ("MMM d" in English, "d. MMM" in German). */
        fun monthDay(locale: Locale = Locale.getDefault()): String = DateFormat.getBestDateTimePattern(locale, "MMMd")

        /** "Oct 20" from the web app's `YYYY-MM-DD`, in [pattern]; the text itself when it is not a date. */
        fun shortDate(date: String, pattern: String, locale: Locale = Locale.getDefault()): String {
            val parse = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }
            val at = try { parse.parse(date) } catch (e: Exception) { null } ?: return date
            return SimpleDateFormat(pattern, locale).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(at)
        }

        /** The muted details line: the time and the project, whichever are set. */
        fun details(row: WidgetModel.Row): String = listOfNotNull(row.time, row.project).joinToString(" · ")

        /** The phone's own weekday, month and day pattern ("EEE, MMM d" in English). */
        fun weekdayMonthDay(locale: Locale = Locale.getDefault()): String = DateFormat.getBestDateTimePattern(locale, "EEEMMMd")

        /**
         * An Upcoming day heading (android-upcoming-calendar-widgets D3): [tomorrow] for the day
         * after [today], else the date in [pattern]; the text itself when it is not a date.
         */
        fun dayHeading(date: String, today: LocalDate, tomorrow: String, pattern: String, locale: Locale = Locale.getDefault()): String {
            val day = try { LocalDate.parse(date) } catch (e: Exception) { return date }
            return if (day == today.plusDays(1)) tomorrow else shortDate(date, pattern, locale)
        }
    }
}

/**
 * The Upcoming widget (android-upcoming-calendar-widgets D3): the Today widget's list with a
 * heading per day, the header opening Upcoming. Rows, circles and taps are the Today widget's.
 */
class UpcomingWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    companion object {
        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = WidgetModel.parse(Prefs(context).widget)
            val pending = WidgetStore.pending(context)
            val message = when {
                model == null -> context.getString(R.string.widget_open_app)
                model.locked -> context.getString(R.string.widget_upcoming_locked, model.upcoming?.count ?: 0)
                model.upcoming == null -> context.getString(R.string.widget_open_app)
                else -> context.getString(R.string.widget_upcoming_empty)
            }
            for (id in ids) {
                val v = RemoteViews(context.packageName, R.layout.widget_upcoming)
                v.setOnClickPendingIntent(R.id.header, WidgetStore.open(context, "/upcoming", 110))
                v.setOnClickPendingIntent(R.id.add, WidgetStore.open(context, ReminderSchedule.QUICK_ADD_PATH, 200))
                v.setTextViewText(R.id.count, model?.upcoming?.let { model.upcomingCount(pending).toString() } ?: "")
                v.setTextViewText(R.id.updated, model?.let { context.getString(R.string.widget_updated, DateFormat.getTimeFormat(context).format(it.updatedAt)) } ?: "")
                v.setTextViewText(R.id.message, message)
                val service = Intent(context, UpcomingListService::class.java)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                    .setData(Uri.parse("opentodo-widget-upcoming:$id"))
                @Suppress("DEPRECATION")
                v.setRemoteAdapter(R.id.list, service)
                v.setEmptyView(R.id.list, R.id.message)
                v.setPendingIntentTemplate(R.id.list, WidgetAction.template(context))
                manager.updateAppWidget(id, v)
            }
            @Suppress("DEPRECATION")
            manager.notifyAppWidgetViewDataChanged(ids, R.id.list)
        }
    }
}

/** Fills the Upcoming widget's list from the stored publication; reads private storage only. */
class UpcomingListService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = UpcomingListFactory(applicationContext)
}

/** The Upcoming list's lines from [WidgetModel.upcomingItems]. */
internal class UpcomingListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    private var items: List<WidgetModel.Item> = emptyList()
    private var canComplete = false
    private var pattern = "EEE, MMM d"
    private var today: LocalDate = LocalDate.now()

    override fun onCreate() {}
    override fun onDestroy() {}

    override fun onDataSetChanged() {
        val model = WidgetModel.parse(Prefs(context).widget)
        items = model?.upcomingItems(WidgetStore.pending(context)) ?: emptyList()
        canComplete = model?.canComplete == true
        pattern = TodayWidget.weekdayMonthDay()
        today = model?.logicalToday() ?: LocalDate.now()
    }

    override fun getCount(): Int = items.size
    override fun getViewTypeCount(): Int = 2
    override fun hasStableIds(): Boolean = true
    override fun getLoadingView(): RemoteViews? = null

    override fun getItemId(position: Int): Long = WidgetRows.itemId(items.getOrNull(position))

    override fun getViewAt(position: Int): RemoteViews = when (val item = items.getOrNull(position)) {
        is WidgetModel.Item.Task -> WidgetRows.row(context, item.row, canComplete, null, item.row.date)
        is WidgetModel.Item.Day -> WidgetRows.heading(context, TodayWidget.dayHeading(item.date, today, context.getString(R.string.widget_tomorrow), pattern), null)
        is WidgetModel.Item.More -> WidgetRows.heading(context, context.getString(R.string.widget_more, item.count), WidgetAction.fillOpenUpcoming())
        is WidgetModel.Item.Heading, null -> WidgetRows.heading(context, "", null)
    }
}

/** A list line of the Today and Upcoming widgets: a heading, or a task with its circle (android-widget-list D1, D4). */
internal object WidgetRows {
    fun itemId(item: WidgetModel.Item?): Long = when (item) {
        is WidgetModel.Item.Task -> (item.row.id + "@" + item.row.date).hashCode().toLong() shl 2
        is WidgetModel.Item.Heading -> item.group.ordinal.toLong() * 4 + 1
        is WidgetModel.Item.Day -> (item.date.hashCode().toLong() shl 2) + 2
        is WidgetModel.Item.More -> 3L
        null -> -1L
    }

    fun heading(context: Context, text: String, fill: Intent?): RemoteViews =
        RemoteViews(context.packageName, R.layout.widget_today_heading).apply {
            setTextViewText(R.id.heading, text)
            if (fill != null) setOnClickFillInIntent(R.id.heading, fill)
        }

    /**
     * A task row: the title, then the overdue [shownDate] (Today only) and `time · project`. A tap
     * opens the task; the circle completes it, [day] telling which Upcoming day it was ticked under.
     */
    fun row(context: Context, row: WidgetModel.Row, canComplete: Boolean, shownDate: String?, day: String?): RemoteViews = RemoteViews(context.packageName, R.layout.widget_today_row).apply {
        val title = row.title ?: context.getString(R.string.widget_untitled)
        setTextViewText(R.id.title, title)
        setTextViewText(R.id.date, shownDate ?: "")
        setViewVisibility(R.id.date, if (shownDate == null) View.GONE else View.VISIBLE)
        val details = TodayWidget.details(row)
        setTextViewText(R.id.meta, details)
        setViewVisibility(R.id.meta, if (details.isEmpty()) View.GONE else View.VISIBLE)
        setViewVisibility(R.id.details, if (shownDate == null && details.isEmpty()) View.GONE else View.VISIBLE)
        setOnClickFillInIntent(R.id.body, WidgetAction.fillOpen(row.id))
        if (canComplete) {
            setViewVisibility(R.id.check, View.VISIBLE)
            setContentDescription(R.id.check, context.getString(R.string.widget_complete, title))
            setOnClickFillInIntent(R.id.check, WidgetAction.fillComplete(row.id, day))
        } else {
            // Without completing, the circle's room stays as a margin so titles keep their place.
            setViewVisibility(R.id.check, View.INVISIBLE)
        }
    }
}

/** Fills the Today widget's list from the stored publication (android-widget-list D1); reads private storage only. */
class TodayListService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TodayListFactory(applicationContext)
}

/** The list's lines from [WidgetModel.items]; its own class so the emulator test can draw it without a launcher. */
internal class TodayListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
    private var items: List<WidgetModel.Item> = emptyList()
    private var canComplete = false
    private var monthDay = "MMM d"

    override fun onCreate() {}
    override fun onDestroy() {}

    override fun onDataSetChanged() {
        val model = WidgetModel.parse(Prefs(context).widget)
        items = model?.items(WidgetStore.pending(context)) ?: emptyList()
        canComplete = model?.canComplete == true
        monthDay = TodayWidget.monthDay()
    }

    override fun getCount(): Int = items.size
    override fun getViewTypeCount(): Int = 2
    override fun hasStableIds(): Boolean = true
    override fun getLoadingView(): RemoteViews? = null

    override fun getItemId(position: Int): Long = WidgetRows.itemId(items.getOrNull(position))

    override fun getViewAt(position: Int): RemoteViews = when (val item = items.getOrNull(position)) {
        is WidgetModel.Item.Task -> WidgetRows.row(context, item.row, canComplete, item.row.date?.let { TodayWidget.shortDate(it, monthDay) }, null)
        is WidgetModel.Item.Heading -> WidgetRows.heading(context, context.getString(if (item.group == WidgetModel.Group.EARLIER) R.string.widget_earlier else R.string.widget_today), null)
        is WidgetModel.Item.More -> WidgetRows.heading(context, context.getString(R.string.widget_more, item.count), WidgetAction.fillOpenToday())
        is WidgetModel.Item.Day, null -> WidgetRows.heading(context, "", null)
    }
}

/** What a row tap asks for (android-widget-list D2). Pure for tests. */
sealed interface WidgetAction {
    data class Open(val path: String) : WidgetAction
    /** [date]: the Upcoming day the row was ticked under, null in Today (android-upcoming-calendar-widgets D3). */
    data class Complete(val taskId: String, val date: String? = null) : WidgetAction

    companion object {
        const val EXTRA_KIND = "kind"
        const val EXTRA_ID = "id"
        const val EXTRA_DATE = "date"
        const val KIND_OPEN = "open"
        const val KIND_OPEN_UPCOMING = "upcoming"
        const val KIND_COMPLETE = "complete"
        private val DATE = Regex("""\d{4}-\d\d-\d\d""")

        /** `open` opens the task, or Today without one; `upcoming` opens Upcoming; `complete` needs a task; anything else is nothing. */
        fun route(kind: String?, id: String?, date: String? = null): WidgetAction? = when (kind) {
            KIND_OPEN -> Open(if (id.isNullOrEmpty()) "/today" else ReminderSchedule.taskPath(id))
            KIND_OPEN_UPCOMING -> Open("/upcoming")
            KIND_COMPLETE -> if (id.isNullOrEmpty()) null else Complete(id, date?.takeIf { DATE.matches(it) })
            else -> null
        }

        /**
         * The list's template: an activity intent, so a tap may start the app (a broadcast that
         * starts an activity is a background start, which Android 10 and later block). Mutable
         * so each row's fill-in adds its extras; the component is explicit and fixed.
         */
        fun template(context: Context): PendingIntent {
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            return PendingIntent.getActivity(context, 400, Intent(context, WidgetActionActivity::class.java), flags)
        }

        fun fillOpen(taskId: String): Intent = Intent().putExtra(EXTRA_KIND, KIND_OPEN).putExtra(EXTRA_ID, taskId)
        fun fillOpenToday(): Intent = Intent().putExtra(EXTRA_KIND, KIND_OPEN)
        fun fillOpenUpcoming(): Intent = Intent().putExtra(EXTRA_KIND, KIND_OPEN_UPCOMING)
        fun fillComplete(taskId: String, date: String? = null): Intent =
            Intent().putExtra(EXTRA_KIND, KIND_COMPLETE).putExtra(EXTRA_ID, taskId).apply { if (date != null) putExtra(EXTRA_DATE, date) }
    }
}

/**
 * The Today and Upcoming widgets' row taps, with no window of its own (Theme.NoDisplay): `open` forwards to the
 * app at the task, `complete` hides the row and queues the completion for the web app, and the
 * activity finishes before it would draw. Not exported; only the widget's template reaches it.
 */
class WidgetActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (val action = WidgetAction.route(intent?.getStringExtra(WidgetAction.EXTRA_KIND), intent?.getStringExtra(WidgetAction.EXTRA_ID), intent?.getStringExtra(WidgetAction.EXTRA_DATE))) {
            is WidgetAction.Open -> startActivity(WidgetStore.openIntent(this, action.path))
            is WidgetAction.Complete -> WidgetStore.complete(this, action.taskId, action.date)
            null -> {}
        }
        finish()
    }
}

/** Android widgets hold no text field: the button opens quick add (`/?add=`). */
class QuickAddWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val v = RemoteViews(context.packageName, R.layout.widget_quick_add)
        v.setOnClickPendingIntent(R.id.quick_add, WidgetStore.open(context, ReminderSchedule.QUICK_ADD_PATH, 200))
        manager.updateAppWidget(ids, v)
    }
}
