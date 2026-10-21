package app.opentodo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews

/** Stores the web app's publication and redraws the widgets; the widgets never request anything themselves. */
object WidgetStore {
    fun publish(context: Context, json: String) {
        if (json.length > 512 * 1024 || WidgetModel.parse(json) == null) return
        Prefs(context).widget = json
        redraw(context)
    }

    fun clear(context: Context) {
        Prefs(context).widget = null
        redraw(context)
    }

    fun redraw(context: Context) {
        val m = AppWidgetManager.getInstance(context)
        val ids = m.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
        if (ids.isNotEmpty()) TodayWidget.draw(context, m, ids)
    }

    fun open(context: Context, path: String, code: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("opentodo-open:" + Uri.encode(path)))
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}

class TodayWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    companion object {
        private val ROW_IDS = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4)

        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = WidgetModel.parse(Prefs(context).widget)
            val v = RemoteViews(context.packageName, R.layout.widget_today)
            v.setOnClickPendingIntent(R.id.header, WidgetStore.open(context, "/today", 100))
            v.setTextViewText(R.id.count, model?.count?.toString() ?: "")
            v.setTextViewText(R.id.updated, model?.let { context.getString(R.string.widget_updated, DateFormat.getTimeFormat(context).format(it.updatedAt)) } ?: "")
            val message = when {
                model == null -> context.getString(R.string.widget_open_app)
                model.locked -> context.getString(R.string.widget_locked, model.count, model.overdue)
                model.count == 0 -> context.getString(R.string.widget_empty)
                else -> null
            }
            v.setTextViewText(R.id.message, message ?: "")
            v.setViewVisibility(R.id.message, if (message == null) View.GONE else View.VISIBLE)
            for ((i, rowId) in ROW_IDS.withIndex()) {
                val row = model?.rows?.getOrNull(i)
                if (row == null) { v.setViewVisibility(rowId, View.GONE); continue }
                val title = row.title ?: context.getString(R.string.widget_untitled)
                v.setTextViewText(rowId, if (row.time != null) "${row.time}  $title" else title)
                v.setTextColor(rowId, context.getColor(if (row.overdue) R.color.overdue else R.color.widget_text))
                v.setViewVisibility(rowId, View.VISIBLE)
                v.setOnClickPendingIntent(rowId, WidgetStore.open(context, ReminderSchedule.taskPath(row.id), 101 + i))
            }
            val more = model?.more ?: 0
            v.setTextViewText(R.id.more, context.getString(R.string.widget_more, more))
            v.setViewVisibility(R.id.more, if (model != null && !model.locked && more > 0) View.VISIBLE else View.GONE)
            manager.updateAppWidget(ids, v)
        }
    }
}

/** Android widgets hold no text field: the button opens quick add (`/?add=`). */
class QuickAddWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val v = RemoteViews(context.packageName, R.layout.widget_quick_add)
        v.setOnClickPendingIntent(R.id.quick_add, WidgetStore.open(context, "/?add=", 200))
        manager.updateAppWidget(ids, v)
    }
}
