package app.opentodo

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Arms one alarm per handed-over reminder (exact when allowed, inexact otherwise). */
object Scheduler {
    private fun alarmIntent(context: Context, id: String): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).setData(Uri.parse("opentodo-reminder:" + Uri.encode(id)))
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun canExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    fun notificationsAllowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Replaces the stored schedule and the armed alarms with [json]. */
    fun replace(context: Context, json: String) {
        val prefs = Prefs(context)
        val now = System.currentTimeMillis()
        cancelAll(context, prefs)
        val list = ReminderSchedule.parse(json, now)
        prefs.reminders = ReminderSchedule.toJson(list)
        // android-urgent-alarms D4: the channel exists before the first alarm, also for one marked urgent on another device.
        if (list.any { it.urgent }) Notifier.ensureUrgentChannel(context)
        arm(context, list)
    }

    /** Re-arms the stored schedule (after a reboot or a change of the exact-alarm permission). */
    fun rearm(context: Context) {
        val prefs = Prefs(context)
        val list = ReminderSchedule.parse(prefs.reminders, System.currentTimeMillis())
        arm(context, list)
    }

    fun clear(context: Context) {
        val prefs = Prefs(context)
        cancelAll(context, prefs)
        prefs.reminders = "[]"
    }

    private fun cancelAll(context: Context, prefs: Prefs) {
        val am = context.getSystemService(AlarmManager::class.java)
        for (r in ReminderSchedule.parse(prefs.reminders, null)) am.cancel(alarmIntent(context, r.id))
    }

    /**
     * [exact] is the permission's state; the instrumented tests pass false to take the inexact
     * fallback. An urgent reminder is an alarm clock when exact (android-urgent-alarms D3): on
     * time in Doze and shown as the phone's next alarm, whose tap opens the task.
     */
    internal fun arm(context: Context, list: List<ShellReminder>, exact: Boolean = canExact(context)) {
        val am = context.getSystemService(AlarmManager::class.java)
        for (r in list) {
            val pi = alarmIntent(context, r.id)
            if (UrgentAlarms.armAsAlarmClock(r, exact)) {
                val show = Notifier.open(context, ReminderSchedule.taskPath(r.taskId), Notifier.notificationId(r.id))
                am.setAlarmClock(AlarmManager.AlarmClockInfo(r.fireAt, show), pi)
            } else if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
        }
    }

    /** One reminder leaves the schedule and its alarm goes (shell-push D4: a push showed it). */
    fun cancel(context: Context, id: String) {
        val prefs = Prefs(context)
        context.getSystemService(AlarmManager::class.java).cancel(alarmIntent(context, id))
        val list = ReminderSchedule.parse(prefs.reminders, null)
        if (list.any { it.id == id }) prefs.reminders = ReminderSchedule.toJson(list.filter { it.id != id })
    }

    fun find(context: Context, id: String): ShellReminder? =
        ReminderSchedule.parse(Prefs(context).reminders, null).firstOrNull { it.id == id }
}

/** Shows the notifications: the reminder itself and the settings test. */
object Notifier {
    const val CHANNEL = "reminders"
    /** android-urgent-alarms D1: a channel of its own, because Android fixes a channel's sound when it is created. */
    const val URGENT_CHANNEL = "urgent"

    private fun channel(context: Context) = ensureChannel(context)

    /** The reminders channel, which the Focus session-end notification shares (focus-live-activity D3). */
    internal fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH))
    }

    /** Opens the app at [path] (MainActivity reads `opentodo-open:`). */
    internal fun open(context: Context, path: String, code: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("opentodo-open:" + Uri.encode(path)))
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun alarmSound(): Uri? =
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    /**
     * The Urgent reminders channel. Also created when the user turns Urgent on (D4), so its
     * Do Not Disturb override can be set in Android's settings before the first alarm.
     */
    internal fun ensureUrgentChannel(context: Context) {
        val channel = NotificationChannel(URGENT_CHANNEL, context.getString(R.string.channel_urgent), NotificationManager.IMPORTANCE_HIGH).apply {
            // Built here, not in the object's initializer, which runs wherever Notifier is first used.
            val alarmAudio = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
            setSound(alarmSound(), alarmAudio)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 800, 800)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** D2: the full-screen alarm; the reminder travels in the extras (a push may have taken it out of the schedule). */
    private fun alarmScreen(context: Context, reminderId: String, title: String?, fireAt: Long): PendingIntent {
        val intent = Intent(context, AlarmActivity::class.java)
            .setData(Uri.parse("opentodo-alarm:" + Uri.encode(reminderId)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            .putExtra(AlarmActivity.EXTRA_ID, reminderId)
            .putExtra(AlarmActivity.EXTRA_TITLE, title)
            .putExtra(AlarmActivity.EXTRA_AT, fireAt)
        return PendingIntent.getActivity(context, notificationId(reminderId), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** [fireAt] names the firing the button answers (android-urgent-alarms D2: once); 0 for a location reminder. */
    private fun action(context: Context, id: String, action: String, fireAt: Long): PendingIntent {
        val intent = Intent(context, NotificationActionReceiver::class.java)
            .setData(Uri.parse("opentodo-action:" + Uri.encode(id) + "?" + action))
            .putExtra("id", id).putExtra("action", action).putExtra("fireAt", fireAt)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun label(action: String): Int = when (action) {
        "done" -> R.string.action_done
        "snooze" -> R.string.action_snooze
        else -> R.string.action_dismiss
    }

    private fun NotificationCompat.Builder.actions(context: Context, id: String, actions: List<String>, fireAt: Long = 0): NotificationCompat.Builder {
        for (a in actions) addAction(0, context.getString(label(a)), action(context, id, a, fireAt))
        return this
    }

    fun notificationId(id: String): Int = id.hashCode()

    /** A reminder of the phone's schedule, when its alarm fires. */
    fun reminder(context: Context, r: ShellReminder): Boolean = show(context, r.id, r.taskId, r.title, r.fireAt, r.due, r.urgent)

    /**
     * The one notification of a reminder, for its alarm and for a push alike (shell-push D4):
     * the id comes from the reminder's id, so whichever arrives second replaces the first, and
     * without another sound. A firing already shown is not shown again (a notification the
     * user dismissed stays away). [due] is the body ("Today 14:00", push-due-date), else "Reminder".
     * False when notifications are not allowed. An [urgent] reminder rings as an alarm
     * (android-urgent-alarms D1); a push reads the flag from the schedule.
     */
    fun show(
        context: Context, reminderId: String, taskId: String, title: String?, fireAt: Long, due: String? = null,
        urgent: Boolean = Scheduler.find(context, reminderId)?.urgent == true,
    ): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        val prefs = Prefs(context)
        if (ReminderSchedule.wasShown(prefs.remindersShown, reminderId, fireAt)) return true
        val n = if (urgent) alarmNotification(context, reminderId, title, fireAt, due) else reminderNotification(context, reminderId, taskId, title, fireAt, due)
        return try {
            NotificationManagerCompat.from(context).notify(notificationId(reminderId), n)
            prefs.remindersShown = ReminderSchedule.markShown(prefs.remindersShown, reminderId, fireAt, System.currentTimeMillis())
            true
        } catch (e: SecurityException) {
            false
        }
    }

    private fun reminderNotification(context: Context, reminderId: String, taskId: String, title: String?, fireAt: Long, due: String?): Notification {
        channel(context)
        return NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title ?: context.getString(R.string.reminder_generic))
            .setContentText(due ?: context.getString(R.string.reminder_text))
            .setWhen(fireAt).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open(context, ReminderSchedule.taskPath(taskId), notificationId(reminderId)))
            .actions(context, reminderId, ReminderSchedule.REMINDER_ACTIONS, fireAt)
            .build()
    }

    /**
     * D1, D2: the alarm sound on the alarm stream, repeated until the notification goes
     * (FLAG_INSISTENT), and the full-screen alarm where Android allows it; without that
     * permission Android shows it as a heads-up notification (D5). Swiping it away or opening
     * the notification shade silences it. A tap opens the alarm screen and keeps the
     * notification (no auto-cancel), so the screen stays until it is answered. On a lock screen
     * that hides private content it reads "Reminder".
     */
    private fun alarmNotification(context: Context, reminderId: String, title: String?, fireAt: Long, due: String?): Notification {
        ensureUrgentChannel(context)
        val screen = alarmScreen(context, reminderId, title, fireAt)
        @Suppress("DEPRECATION") // the stream is read only before channels; the channel's alarm audio applies from Android 8.
        val n = NotificationCompat.Builder(context, URGENT_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title ?: context.getString(R.string.reminder_generic))
            .setContentText(due ?: context.getString(R.string.reminder_text))
            .setWhen(fireAt).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setSound(alarmSound(), AudioManager.STREAM_ALARM)
            .setFullScreenIntent(screen, true)
            .setContentIntent(screen)
            .setPublicVersion(NotificationCompat.Builder(context, URGENT_CHANNEL).setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.reminder_generic)).setWhen(fireAt).setShowWhen(true).build())
            .actions(context, reminderId, ReminderSchedule.REMINDER_ACTIONS, fireAt)
            .build()
        n.flags = n.flags or Notification.FLAG_INSISTENT
        return n
    }

    /** A location reminder crossed in its direction (location-reminders): Done and Dismiss, a tap opens the task. */
    fun location(context: Context, r: ShellGeofence): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        channel(context)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(r.title ?: context.getString(R.string.reminder_generic))
            .setContentText(context.getString(if (r.on == "arrive") R.string.location_arrived else R.string.location_left))
            .setWhen(System.currentTimeMillis()).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open(context, ReminderSchedule.taskPath(r.taskId), notificationId(r.id)))
            .actions(context, r.id, ReminderSchedule.LOCATION_ACTIONS)
            .build()
        return try { NotificationManagerCompat.from(context).notify(notificationId(r.id), n); true } catch (e: SecurityException) { false }
    }

    fun test(context: Context): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        channel(context)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.test_title))
            .setContentText(context.getString(R.string.test_text))
            .setAutoCancel(true)
            .setContentIntent(open(context, "/settings/notifications/push", 1))
            .build()
        return try { NotificationManagerCompat.from(context).notify(1, n); true } catch (e: SecurityException) { false }
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.data?.schemeSpecificPart ?: return
        val r = Scheduler.find(context, id) ?: return
        Notifier.reminder(context, r)
    }
}

/**
 * Done, Snooze 10 min and Dismiss: the web app applies them in a hidden web view, as ordinary
 * ops (Done through the app's completion, so a repeating task moves to its next occurrence).
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        ReminderActions.run(context, id, intent.getStringExtra("action") ?: return, intent.getLongExtra("fireAt", 0))
    }
}

/**
 * A reminder's Done, Snooze 10 min or Dismiss, from its notification or its full-screen alarm
 * (android-urgent-alarms D2): the notification goes, which silences an alarm, an alarm screen
 * showing it closes, and the hidden web view applies the action, once per firing ([fireAt]).
 */
object ReminderActions {
    @Synchronized
    fun run(context: Context, id: String, action: String, fireAt: Long) {
        if (!ReminderSchedule.isAction(action)) return
        NotificationManagerCompat.from(context).cancel(Notifier.notificationId(id))
        AlarmActivity.answered(id)
        val prefs = Prefs(context)
        val acted = UrgentAlarms.firstAnswer(prefs.remindersActed, id, fireAt, System.currentTimeMillis()) ?: return
        prefs.remindersActed = acted
        HiddenRun.enqueueOnce(context, ReminderSchedule.actionPath(id, action))
    }
}

/**
 * Alarms do not survive a reboot or a change of the exact-alarm permission, and proximity
 * alerts not a reboot or an app update: arm them again.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                Scheduler.rearm(context)
                Focus.rearm(context)
                Geofences.rearm(context)
                HiddenRun.schedulePeriodic(context)
            }
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
                Scheduler.rearm(context)
                Focus.rearm(context)
                HiddenRun.schedulePeriodic(context)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> Geofences.rearm(context)
        }
    }
}
