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
import java.util.Locale
import java.util.TimeZone

/** Stores the web app's publication and redraws the widgets; the widgets never request anything themselves. */
object WidgetStore {
    fun publish(context: Context, json: String) {
        if (json.length > 512 * 1024) return
        val model = WidgetModel.parse(json) ?: return
        val prefs = Prefs(context)
        prefs.widget = json
        // android-widget-list D2: a completion the publication confirms (the row is gone) is done.
        prefs.widgetPending = WidgetPending.toJson(WidgetPending.prune(WidgetPending.parse(prefs.widgetPending), model, System.currentTimeMillis()))
        redraw(context)
    }

    fun clear(context: Context) {
        val prefs = Prefs(context)
        prefs.widget = null
        prefs.widgetPending = null
        redraw(context)
    }

    fun redraw(context: Context) {
        val m = AppWidgetManager.getInstance(context)
        val ids = m.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
        if (ids.isNotEmpty()) TodayWidget.draw(context, m, ids)
        val done = m.getAppWidgetIds(ComponentName(context, CompletedWidget::class.java))
        if (done.isNotEmpty()) CompletedWidget.draw(context, m, done)
    }

    /**
     * The completion circle (android-widget-list D2): hide the row now, and let the web app
     * complete the task in a background run, as its own op. Never written here.
     */
    fun complete(context: Context, taskId: String) {
        val prefs = Prefs(context)
        val model = WidgetModel.parse(prefs.widget) ?: return
        if (!model.canComplete || model.rows.none { it.id == taskId }) return
        prefs.widgetPending = WidgetPending.toJson(WidgetPending.add(WidgetPending.parse(prefs.widgetPending), taskId, System.currentTimeMillis()))
        prefs.queueWidgetCompletion(taskId)
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

    override fun getItemId(position: Int): Long = when (val item = items.getOrNull(position)) {
        is WidgetModel.Item.Task -> item.row.id.hashCode().toLong() shl 2
        is WidgetModel.Item.Heading -> item.group.ordinal.toLong() * 4 + 1
        is WidgetModel.Item.More -> 3L
        null -> -1L
    }

    override fun getViewAt(position: Int): RemoteViews = when (val item = items.getOrNull(position)) {
        is WidgetModel.Item.Task -> row(item.row)
        is WidgetModel.Item.Heading -> heading(context.getString(if (item.group == WidgetModel.Group.EARLIER) R.string.widget_earlier else R.string.widget_today), null)
        is WidgetModel.Item.More -> heading(context.getString(R.string.widget_more, item.count), WidgetAction.fillOpenToday())
        null -> heading("", null)
    }

    private fun heading(text: String, fill: Intent?): RemoteViews =
        RemoteViews(context.packageName, R.layout.widget_today_heading).apply {
            setTextViewText(R.id.heading, text)
            if (fill != null) setOnClickFillInIntent(R.id.heading, fill)
        }

    private fun row(row: WidgetModel.Row): RemoteViews = RemoteViews(context.packageName, R.layout.widget_today_row).apply {
        val title = row.title ?: context.getString(R.string.widget_untitled)
        setTextViewText(R.id.title, title)
        val date = row.date?.let { TodayWidget.shortDate(it, monthDay) }
        setTextViewText(R.id.date, date ?: "")
        setViewVisibility(R.id.date, if (date == null) View.GONE else View.VISIBLE)
        val details = TodayWidget.details(row)
        setTextViewText(R.id.meta, details)
        setViewVisibility(R.id.meta, if (details.isEmpty()) View.GONE else View.VISIBLE)
        setViewVisibility(R.id.details, if (date == null && details.isEmpty()) View.GONE else View.VISIBLE)
        setOnClickFillInIntent(R.id.body, WidgetAction.fillOpen(row.id))
        if (canComplete) {
            setViewVisibility(R.id.check, View.VISIBLE)
            setContentDescription(R.id.check, context.getString(R.string.widget_complete, title))
            setOnClickFillInIntent(R.id.check, WidgetAction.fillComplete(row.id))
        } else {
            // Without completing, the circle's room stays as a margin so titles keep their place.
            setViewVisibility(R.id.check, View.INVISIBLE)
        }
    }
}

/** What a row tap asks for (android-widget-list D2). Pure for tests. */
sealed interface WidgetAction {
    data class Open(val path: String) : WidgetAction
    data class Complete(val taskId: String) : WidgetAction

    companion object {
        const val EXTRA_KIND = "kind"
        const val EXTRA_ID = "id"
        const val KIND_OPEN = "open"
        const val KIND_COMPLETE = "complete"

        /** `open` opens the task, or Today without one; `complete` needs a task; anything else is nothing. */
        fun route(kind: String?, id: String?): WidgetAction? = when (kind) {
            KIND_OPEN -> Open(if (id.isNullOrEmpty()) "/today" else ReminderSchedule.taskPath(id))
            KIND_COMPLETE -> if (id.isNullOrEmpty()) null else Complete(id)
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
        fun fillComplete(taskId: String): Intent = Intent().putExtra(EXTRA_KIND, KIND_COMPLETE).putExtra(EXTRA_ID, taskId)
    }
}

/**
 * The Today widget's row taps, with no window of its own (Theme.NoDisplay): `open` forwards to the
 * app at the task, `complete` hides the row and queues the completion for the web app, and the
 * activity finishes before it would draw. Not exported; only the widget's template reaches it.
 */
class WidgetActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        when (val action = WidgetAction.route(intent?.getStringExtra(WidgetAction.EXTRA_KIND), intent?.getStringExtra(WidgetAction.EXTRA_ID))) {
            is WidgetAction.Open -> startActivity(WidgetStore.openIntent(this, action.path))
            is WidgetAction.Complete -> WidgetStore.complete(this, action.taskId)
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
