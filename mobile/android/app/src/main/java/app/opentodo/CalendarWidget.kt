package app.opentodo

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

/**
 * The Calendar widget (android-upcoming-calendar-widgets D4): a month of six weeks from the last
 * publication, a dot under each day with open tasks, today ringed. A day opens that day in the app
 * (or Upcoming while the workspace has Calendar off); the arrows move this widget's own month.
 * Cells are drawn from three layouts, so every colour comes from a layout (#966).
 */
class CalendarWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    override fun onReceive(context: Context, intent: Intent) {
        // The app's next day began: day headings and the ring move (D7); redraw re-arms the next one.
        if (intent.action == ACTION_DAY) {
            WidgetStore.redraw(context)
            return
        }
        if (intent.action == ACTION_MONTH) {
            val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
            val prefs = Prefs(context)
            prefs.setCalendarOffset(id, CalendarModel.clampOffset(prefs.calendarOffset(id) + intent.getIntExtra(EXTRA_STEP, 0).coerceIn(-1, 1)))
            draw(context, AppWidgetManager.getInstance(context), intArrayOf(id))
            return
        }
        super.onReceive(context, intent)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val prefs = Prefs(context)
        for (id in ids) prefs.setCalendarOffset(id, 0)
    }

    companion object {
        const val ACTION_MONTH = "app.opentodo.CALENDAR_MONTH"
        const val ACTION_DAY = "app.opentodo.WIDGET_DAY"
        const val EXTRA_STEP = "step"
        private val WEEKDAY_IDS = intArrayOf(R.id.wd0, R.id.wd1, R.id.wd2, R.id.wd3, R.id.wd4, R.id.wd5, R.id.wd6)

        /** "November 2026" in the phone's language. */
        fun monthTitle(month: YearMonth, locale: Locale = Locale.getDefault()): String =
            DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "MMMMyyyy"), locale).format(month)

        /** The one-letter weekdays of a week starting on [weekStart] (0 = Sunday). */
        fun weekdayLetters(weekStart: Int, locale: Locale = Locale.getDefault()): List<String> =
            CalendarModel.grid(YearMonth.of(2026, 11), weekStart)[0].map { it.dayOfWeek.getDisplayName(TextStyle.NARROW, locale) }

        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = CalendarModel.parse(Prefs(context).widget)
            // The app's logical today (a day that starts after midnight), not the phone's date (D7).
            val today = model?.logicalToday() ?: WidgetModel.parse(Prefs(context).widget)?.logicalToday() ?: LocalDate.now()
            val weekStart = model?.weekStart ?: CalendarModel.localeWeekStart()
            val letters = weekdayLetters(weekStart)
            val spoken = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(Locale.getDefault())
            val status = when {
                model == null -> context.getString(R.string.widget_open_app)
                model.locked -> context.getString(R.string.widget_calendar_locked)
                else -> context.getString(R.string.widget_updated, DateFormat.getTimeFormat(context).format(model.updatedAt))
            }
            val prefs = Prefs(context)
            for (id in ids) {
                val offset = CalendarModel.clampOffset(prefs.calendarOffset(id))
                val month = YearMonth.from(today).plusMonths(offset.toLong())
                val v = RemoteViews(context.packageName, R.layout.widget_calendar)
                v.setTextViewText(R.id.month, monthTitle(month))
                v.setTextViewText(R.id.updated, status)
                v.setOnClickPendingIntent(R.id.month_header, WidgetStore.open(context, model?.monthPath(month) ?: "/upcoming", 120))
                v.setViewVisibility(R.id.previous, if (offset > 0) View.VISIBLE else View.INVISIBLE)
                v.setViewVisibility(R.id.next, if (offset < CalendarModel.MONTHS - 1) View.VISIBLE else View.INVISIBLE)
                v.setOnClickPendingIntent(R.id.previous, step(context, id, -1))
                v.setOnClickPendingIntent(R.id.next, step(context, id, 1))
                for (i in 0 until 7) v.setTextViewText(WEEKDAY_IDS[i], letters[i])
                v.removeAllViews(R.id.grid)
                for (week in CalendarModel.grid(month, weekStart)) {
                    val row = RemoteViews(context.packageName, R.layout.widget_calendar_week)
                    for (date in week) {
                        val layout = when {
                            date == today -> R.layout.widget_calendar_today
                            YearMonth.from(date) == month -> R.layout.widget_calendar_day
                            else -> R.layout.widget_calendar_other
                        }
                        val n = model?.count(date) ?: 0
                        val cell = RemoteViews(context.packageName, layout)
                        cell.setTextViewText(R.id.day_number, date.dayOfMonth.toString())
                        cell.setViewVisibility(R.id.day_dot, if (n > 0) View.VISIBLE else View.INVISIBLE)
                        val label = if (date == today) context.getString(R.string.widget_today) + ", " + spoken.format(date) else spoken.format(date)
                        cell.setContentDescription(R.id.cell, if (n > 0) context.getString(R.string.widget_calendar_day, label, n) else label)
                        // Distinct by its address, so each cell keeps its own day.
                        cell.setOnClickPendingIntent(R.id.cell, WidgetStore.open(context, model?.dayPath(date) ?: "/upcoming", 130))
                        row.addView(R.id.week, cell)
                    }
                    v.addView(R.id.grid, row)
                }
                manager.updateAppWidget(id, v)
            }
        }

        /**
         * One inexact wake-up at the start of the app's next day (D7), so day headings and the ring
         * move without waiting for the next publication. Replaces the one set before.
         */
        fun scheduleNextDay(context: Context, now: LocalDateTime = LocalDateTime.now()) {
            val prefs = Prefs(context)
            val dayStart = WidgetModel.parse(prefs.widget)?.dayStart ?: 0
            val at = nextDayStart(now, dayStart).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            val intent = Intent(context, CalendarWidget::class.java).setAction(ACTION_DAY)
            val pi = PendingIntent.getBroadcast(context, 150, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            (context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.set(AlarmManager.RTC, at + 60_000, pi)
        }

        /** When the app's next day begins after [now]: the next [dayStart] minutes past a midnight. */
        fun nextDayStart(now: LocalDateTime, dayStart: Int): LocalDateTime {
            val start = now.toLocalDate().atStartOfDay().plusMinutes(dayStart.toLong())
            return if (start.isAfter(now)) start else start.plusDays(1)
        }

        /** An arrow: a broadcast to this provider, distinct per widget and direction. */
        private fun step(context: Context, id: Int, step: Int): PendingIntent {
            val intent = Intent(context, CalendarWidget::class.java)
                .setAction(ACTION_MONTH)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                .putExtra(EXTRA_STEP, step)
                .setData(Uri.parse("opentodo-calendar:$id/$step"))
            return PendingIntent.getBroadcast(context, 140, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }
}
