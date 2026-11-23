package app.opentodo

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.security.SecureRandom

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
    private const val ACTION_CODE = 0x0f0c07
    /** The Pause/Resume intent's proof that it comes from this session's notification. */
    const val EXTRA_TOKEN = "app.opentodo.FOCUS_TOKEN"
    private val random = SecureRandom()

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
            Prefs(context).focus = model.toJson()
            if (Prefs(context).focusToken == null) Prefs(context).focusToken = newToken()
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
        Prefs(context).focusToken = null
    }

    private fun newToken(): String = ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }

    /** What an `opentodo-open:` intent may load (FocusModel.authorize against the stored session). */
    fun authorize(context: Context, path: String, intent: Intent?): String {
        val prefs = Prefs(context)
        return FocusModel.parse(prefs.focus).authorize(path, intent?.getStringExtra(EXTRA_TOKEN), prefs.focusToken)
    }

    /** Pause or Resume: the activity at [path], carrying this session's token. */
    private fun action(context: Context, path: String, token: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("opentodo-open:" + Uri.encode(path))).putExtra(EXTRA_TOKEN, token)
        return PendingIntent.getActivity(context, ACTION_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** What the lock screen shows of a Focus notification: no task title (focus-live-activity D5). */
    internal fun publicVersion(context: Context, channel: String, title: String) =
        NotificationCompat.Builder(context, channel).setSmallIcon(R.drawable.ic_notification).setContentTitle(title).build()

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
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context, CHANNEL, context.getString(R.string.focus_generic)))
        val base = model.end ?: model.countUpFrom
        if (base != null) {
            b.setContentText(label(context, model.label)).setUsesChronometer(true).setChronometerCountDown(model.countsDown).setWhen(base).setShowWhen(true)
        } else {
            b.setContentText(label(context, model.label) + " · " + FocusModel.clockText(model.frozenMs ?: 0)).setShowWhen(false)
        }
        val token = Prefs(context).focusToken
        if (token != null) model.actionPath?.let { path ->
            val text = if (model.state == FocusModel.State.RUNNING) R.string.focus_pause else R.string.focus_resume
            b.addAction(0, context.getString(text), action(context, path, token))
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
        Prefs(context).focusToken = null
        notifyEnd(context, model, at)
    }

    /** "Session done" or "Break over", unless the app is on screen and shows the end itself. */
    private fun notifyEnd(context: Context, model: FocusModel, at: Long) {
        if (foreground || !Scheduler.notificationsAllowed(context)) return
        val n = NotificationCompat.Builder(context, Notifier.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(if (model.phase == FocusModel.Phase.BREAK) R.string.focus_break_over else R.string.focus_done))
            .apply { model.title?.let { setContentText(it) } }
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion(context, Notifier.CHANNEL, context.getString(R.string.focus_generic)))
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
