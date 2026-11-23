package app.opentodo

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * The running Focus session outside the app (focus-live-activity D2, D3, D7): one ongoing
 * notification on the quiet "Focus" channel with a system chronometer, so nothing needs
 * updating while the app sleeps, and one alarm at the planned end that replaces it with
 * "Session done" or "Break over". Every publication replaces both; `none`, the done state
 * and "Change server" remove them and the stored publication.
 */
object Focus {
    const val CHANNEL = "focus"
    const val ONGOING_ID = 0x0f0c05
    const val END_ID = 0x0f0c06

    /** Whether the app is on screen: then the web app shows the end itself, and the alarm stays silent. */
    @Volatile var foreground = false

    private fun channel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.channel_focus), NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
    }

    private fun endAlarm(context: Context): PendingIntent =
        PendingIntent.getBroadcast(context, 0, Intent(context, FocusEndReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Replaces what is shown with [json], and the end alarm. */
    fun publish(context: Context, json: String) {
        val model = FocusModel.parse(json)
        // The web app got past the planned end before the alarm (done, or a phase that started
        // on its own): the replaced session's end is shown now, not lost with its alarm.
        val stored = FocusModel.parse(Prefs(context).focus)
        val owed = stored.endOwedBy(model, System.currentTimeMillis())
        if (model.shown) {
            Prefs(context).focus = json
            show(context, model)
            arm(context, model)
        } else {
            clear(context)
        }
        if (owed) notifyEnd(context, stored, stored.notifyAt!!)
    }

    /** After a reboot or a change of the exact-alarm permission: the stored session is shown and armed again. */
    fun rearm(context: Context) {
        val model = FocusModel.parse(Prefs(context).focus)
        if (!model.shown) return
        show(context, model)
        arm(context, model)
    }

    /** Removes the notification, the alarm and the stored publication (none, sign-out, "Change server"). */
    fun clear(context: Context) {
        context.getSystemService(AlarmManager::class.java).cancel(endAlarm(context))
        NotificationManagerCompat.from(context).cancel(ONGOING_ID)
        Prefs(context).focus = null
    }

    fun title(context: Context, model: FocusModel): String = model.title ?: context.getString(R.string.focus_generic)

    fun label(context: Context, label: FocusModel.Label): String = when (label) {
        is FocusModel.Label.Work -> if (label.cycle != null && label.of != null) context.getString(R.string.focus_work_of, label.cycle, label.of) else context.getString(R.string.focus_work)
        FocusModel.Label.ShortBreak -> context.getString(R.string.focus_short_break)
        FocusModel.Label.LongBreak -> context.getString(R.string.focus_long_break)
        FocusModel.Label.Paused -> context.getString(R.string.focus_paused)
    }

    private fun show(context: Context, model: FocusModel) {
        if (!Scheduler.notificationsAllowed(context)) return
        channel(context)
        val b = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title(context, model))
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(Notifier.open(context, FocusModel.OPEN_PATH, ONGOING_ID))
        val base = model.end ?: model.countUpFrom
        if (base != null) {
            b.setContentText(label(context, model.label)).setUsesChronometer(true).setChronometerCountDown(model.countsDown).setWhen(base).setShowWhen(true)
        } else {
            b.setContentText(label(context, model.label) + " · " + FocusModel.clockText(model.frozenMs ?: 0)).setShowWhen(false)
        }
        model.actionPath?.let { path ->
            val text = if (model.state == FocusModel.State.RUNNING) R.string.focus_pause else R.string.focus_resume
            b.addAction(0, context.getString(text), Notifier.open(context, path, ONGOING_ID + 1))
        }
        try { NotificationManagerCompat.from(context).notify(ONGOING_ID, b.build()) } catch (e: SecurityException) { /* notifications refused */ }
    }

    /** The session-end alarm: exact when allowed, inexact otherwise; none while paused. */
    internal fun arm(context: Context, model: FocusModel, exact: Boolean = Scheduler.canExact(context)) {
        val am = context.getSystemService(AlarmManager::class.java)
        val pi = endAlarm(context)
        val at = model.notifyAt ?: return am.cancel(pi)
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }

    /** The planned end passed: the ongoing notification gives way to "Session done" or "Break over". */
    fun ended(context: Context) {
        val model = FocusModel.parse(Prefs(context).focus)
        val now = System.currentTimeMillis()
        // A publication since the alarm was armed moved the end, or nothing runs any more.
        val at = model.notifyAt ?: return
        if (!model.endDue(now)) return arm(context, model)
        NotificationManagerCompat.from(context).cancel(ONGOING_ID)
        Prefs(context).focus = null
        notifyEnd(context, model, at)
    }

    /** "Session done" or "Break over", unless the app is on screen and shows the end itself. */
    private fun notifyEnd(context: Context, model: FocusModel, at: Long) {
        if (foreground || !Scheduler.notificationsAllowed(context)) return
        val n = NotificationCompat.Builder(context, Notifier.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(if (model.phase == FocusModel.Phase.BREAK) R.string.focus_break_over else R.string.focus_done))
            .apply { model.title?.let { setContentText(it) } }
            .setWhen(at).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(Notifier.open(context, FocusModel.OPEN_PATH, END_ID))
            .build()
        Notifier.ensureChannel(context)
        try { NotificationManagerCompat.from(context).notify(END_ID, n) } catch (e: SecurityException) { /* notifications refused */ }
    }
}

class FocusEndReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = Focus.ended(context)
}
