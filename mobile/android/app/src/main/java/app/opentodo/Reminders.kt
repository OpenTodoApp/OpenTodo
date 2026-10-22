package app.opentodo

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
        for (r in ReminderSchedule.parse(prefs.reminders, 0)) am.cancel(alarmIntent(context, r.id))
    }

    /** [exact] is the permission's state; the instrumented tests pass false to take the inexact fallback. */
    internal fun arm(context: Context, list: List<ShellReminder>, exact: Boolean = canExact(context)) {
        val am = context.getSystemService(AlarmManager::class.java)
        for (r in list) {
            val pi = alarmIntent(context, r.id)
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
        }
    }

    fun find(context: Context, id: String): ShellReminder? =
        ReminderSchedule.parse(Prefs(context).reminders, 0).firstOrNull { it.id == id }
}

/** Shows the notifications: the reminder itself and the settings test. */
object Notifier {
    private const val CHANNEL = "reminders"

    private fun channel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.channel_reminders), NotificationManager.IMPORTANCE_HIGH))
    }

    private fun open(context: Context, path: String, code: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("opentodo-open:" + Uri.encode(path)))
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun action(context: Context, id: String, action: String): PendingIntent {
        val intent = Intent(context, NotificationActionReceiver::class.java)
            .setData(Uri.parse("opentodo-action:" + Uri.encode(id) + "?" + action))
            .putExtra("id", id).putExtra("action", action)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun notificationId(id: String): Int = id.hashCode()

    fun reminder(context: Context, r: ShellReminder): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        channel(context)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(r.title ?: context.getString(R.string.reminder_generic))
            .setContentText(context.getString(R.string.reminder_text))
            .setWhen(r.fireAt).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open(context, ReminderSchedule.taskPath(r.taskId), notificationId(r.id)))
            .addAction(0, context.getString(R.string.action_snooze), action(context, r.id, "snooze"))
            .addAction(0, context.getString(R.string.action_dismiss), action(context, r.id, "dismiss"))
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
            .setContentIntent(open(context, "/settings/notifications", 1))
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

/** Snooze 10 min and Dismiss: the web app applies them in a hidden web view, as ordinary ops. */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val action = intent.getStringExtra("action")?.takeIf { it == "snooze" || it == "dismiss" } ?: return
        NotificationManagerCompat.from(context).cancel(Notifier.notificationId(id))
        HiddenRun.enqueueOnce(context, ReminderSchedule.actionPath(id, action))
    }
}

/** Alarms do not survive a reboot or a change of the exact-alarm permission: arm them again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> {
                Scheduler.rearm(context)
                HiddenRun.schedulePeriodic(context)
            }
        }
    }
}
