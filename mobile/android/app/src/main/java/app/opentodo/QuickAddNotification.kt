package app.opentodo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import org.json.JSONObject

/**
 * Quick add from the notification shade (android-quick-add-notification): an ongoing, silent
 * notification on its own channel of minimum importance. A tap opens the app's quick add
 * (`/?add=`, as the widget does); Add task takes a title inline, which the web app saves in a
 * background run (D4), or opens quick add for an encrypted account (`reply` false, D3). The
 * switch lives in [Prefs] (D1), so it comes back after a reboot and goes with Change server.
 */
object QuickAddNotification {
    const val CHANNEL = "quick-add"
    const val ID = 7302
    const val KEY_TEXT = "text"
    /** The address's own limit (the web app reads at most 500 characters of `add`). */
    const val MAX_TEXT = 500
    private const val CODE_OPEN = 7303
    private const val CODE_REPLY = 7304

    /** What `quickAddNotification(json)` asks (D2): `on` absent only reads the state and takes `reply`. */
    data class Request(val on: Boolean?, val reply: Boolean)

    fun parse(json: String): Request = try {
        val o = JSONObject(json)
        Request(if (o.has("on") && !o.isNull("on")) o.optBoolean("on") else null, o.optBoolean("reply", false))
    } catch (e: Exception) {
        Request(null, false)
    }

    /** The bridge's answer: `off`, `on`, or `denied` when it is on but Android shows no notification. */
    fun answer(on: Boolean, allowed: Boolean): String = if (!on) "off" else if (allowed) "on" else "denied"

    /** The background run's address for a reply, or null for an empty one (D4). */
    fun replyPath(text: CharSequence?): String? {
        var t = text?.toString()?.trim() ?: return null
        if (t.length > MAX_TEXT) t = t.take(MAX_TEXT).let { if (it.last().isHighSurrogate()) it.dropLast(1) else it }
        if (t.isEmpty()) return null
        return ReminderSchedule.QUICK_ADD_PATH + java.net.URLEncoder.encode(t, "UTF-8")
    }

    /**
     * Applies a request: turning on without the permission asks through [ask] (the visible app,
     * Android 13+) and stays off on a refusal. Answers the state after it.
     */
    fun handle(context: Context, req: Request, ask: ((Boolean) -> Unit) -> Unit, done: (String) -> Unit) {
        val prefs = Prefs(context)
        val replyChanged = prefs.quickAddReply != req.reply
        prefs.quickAddReply = req.reply
        when (req.on) {
            false -> { prefs.quickAddNotification = false; cancel(context); done("off") }
            true -> if (Scheduler.notificationsAllowed(context)) { prefs.quickAddNotification = true; show(context); done("on") }
                else ask { granted ->
                    val allowed = granted && Scheduler.notificationsAllowed(context)
                    prefs.quickAddNotification = allowed
                    if (allowed) show(context)
                    done(answer(true, allowed))
                }
            null -> {
                if (prefs.quickAddNotification && replyChanged) show(context)
                done(answer(prefs.quickAddNotification, Scheduler.notificationsAllowed(context)))
            }
        }
    }

    /** At boot, after an update and at app start (D6): shown again while the switch is on. */
    fun restore(context: Context) {
        if (Prefs(context).quickAddNotification) show(context)
    }

    fun cancel(context: Context) = NotificationManagerCompat.from(context).cancel(ID)

    private fun channel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.widget_quick_add), NotificationManager.IMPORTANCE_MIN).apply {
            setShowBadge(false)
            setSound(null, null)
            enableVibration(false)
        })
    }

    fun show(context: Context): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        channel(context)
        val open = Notifier.open(context, ReminderSchedule.QUICK_ADD_PATH, CODE_OPEN)
        val label = context.getString(R.string.widget_quick_add_label)
        val action = if (Prefs(context).quickAddReply) {
            val input = RemoteInput.Builder(KEY_TEXT).setLabel(label).build()
            // RemoteInput fills the intent in, so it is mutable; it is explicit, to a receiver that is not exported.
            val reply = PendingIntent.getBroadcast(context, CODE_REPLY, Intent(context, QuickAddReceiver::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            NotificationCompat.Action.Builder(0, label, reply).addRemoteInput(input).setAllowGeneratedReplies(false).build()
        } else {
            NotificationCompat.Action.Builder(0, label, open).build()
        }
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.widget_quick_add))
            .setContentIntent(open)
            .addAction(action)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .build()
        return try { NotificationManagerCompat.from(context).notify(ID, n); true } catch (e: SecurityException) { false }
    }
}

/**
 * The inline reply (D4): the text goes to a background run at `/?add=<text>`, where the web app
 * saves it as a task; the notification is posted again, which ends the field's progress state.
 */
class QuickAddReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(QuickAddNotification.KEY_TEXT)
        QuickAddNotification.replyPath(text)?.let { HiddenRun.enqueueOnce(context, it) }
        if (Prefs(context).quickAddNotification) QuickAddNotification.show(context) else QuickAddNotification.cancel(context)
    }
}
