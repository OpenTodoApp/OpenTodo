package app.opentodo

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/**
 * The Completed widget (completed-widget D2): today's completions large, and a bar per day
 * of the last 7, scaled to the busiest day. The bars are progress bars drawn in the theme's
 * accent, so the launcher resolves light and dark itself. A tap opens Statistics.
 */
class CompletedWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    companion object {
        private val BAR_IDS = intArrayOf(R.id.bar0, R.id.bar1, R.id.bar2, R.id.bar3, R.id.bar4, R.id.bar5, R.id.bar6)
        private val LABEL_IDS = intArrayOf(R.id.day0, R.id.day1, R.id.day2, R.id.day3, R.id.day4, R.id.day5, R.id.day6)

        /** A day's one-letter weekday in the phone's language ("M" for a Monday in English). */
        fun weekdayLetter(day: String, locale: Locale = Locale.getDefault()): String =
            LocalDate.parse(day).dayOfWeek.getDisplayName(TextStyle.NARROW, locale)

        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = CompletedModel.parse(Prefs(context).widget)
            val v = RemoteViews(context.packageName, R.layout.widget_completed)
            v.setOnClickPendingIntent(R.id.completed_root, WidgetStore.open(context, "/stats", 300))
            v.setTextViewText(R.id.completed_count, model?.today?.toString() ?: "")
            v.setTextViewText(R.id.completed_updated, model?.let { context.getString(R.string.widget_updated, DateFormat.getTimeFormat(context).format(it.updatedAt)) } ?: "")
            val message = when {
                model == null -> context.getString(R.string.widget_open_app)
                model.locked -> context.getString(R.string.widget_completed_locked)
                else -> null
            }
            v.setTextViewText(R.id.completed_message, message ?: "")
            v.setViewVisibility(R.id.completed_message, if (message == null) View.GONE else View.VISIBLE)
            val days = model?.days.orEmpty()
            v.setViewVisibility(R.id.bars, if (days.size == CompletedModel.DAYS) View.VISIBLE else View.GONE)
            if (days.size == CompletedModel.DAYS) {
                val max = days.maxOf { it.done }
                for (i in 0 until CompletedModel.DAYS) {
                    v.setProgressBar(BAR_IDS[i], 100, CompletedModel.barLevel(days[i].done, max), false)
                    v.setTextViewText(LABEL_IDS[i], weekdayLetter(days[i].day))
                }
                val spoken = days.joinToString(", ") { "${LocalDate.parse(it.day).dayOfWeek.getDisplayName(TextStyle.FULL, Locale.getDefault())} ${it.done}" }
                v.setContentDescription(R.id.bars, context.getString(R.string.widget_completed_days, spoken))
            }
            manager.updateAppWidget(ids, v)
        }
    }
}
