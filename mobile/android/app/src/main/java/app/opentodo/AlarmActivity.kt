package app.opentodo

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.lang.ref.WeakReference
import java.util.Date

/**
 * The full-screen alarm of an urgent reminder (android-urgent-alarms D2): over the lock screen,
 * the time, the title and the notification's three actions. The first tap answers it (the
 * buttons then go inert): it silences the alarm and applies the action like the notification's
 * button, then the screen closes. It also closes when the alarm is answered elsewhere (the
 * shade, a watch) or its notification is gone. Not exported: only the reminder's own
 * full-screen and content intents open it.
 */
class AlarmActivity : AppCompatActivity() {
    private var reminderId: String? = null
    private var fireAt = 0L
    private var title: String? = null
    private var answered = false
    private val buttons = listOf(R.id.alarm_done to "done", R.id.alarm_snooze to "snooze", R.id.alarm_dismiss to "dismiss")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_alarm)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.alarm_root)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        for ((button, action) in buttons) findViewById<Button>(button).setOnClickListener { answer(action) }
        current = WeakReference(this)
        show(intent)
    }

    /** A second urgent reminder while this one shows: the newest is on screen, the other stays in the notifications. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        show(intent)
    }

    /** Answered elsewhere while this screen was away, or the notification was swiped: nothing is ringing, so the screen goes. */
    override fun onResume() {
        super.onResume()
        val id = reminderId ?: return finish()
        val active = getSystemService(NotificationManager::class.java).activeNotifications.any { it.id == Notifier.notificationId(id) }
        if (!active) return finish()
        showTitle()
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        super.onDestroy()
    }

    private fun answer(action: String) {
        if (answered) return
        answered = true
        for ((button, _) in buttons) findViewById<Button>(button).isEnabled = false
        reminderId?.let { ReminderActions.run(this, it, action, fireAt) }
        finish()
    }

    private fun show(intent: Intent) {
        reminderId = intent.getStringExtra(EXTRA_ID) ?: return finish()
        fireAt = intent.getLongExtra(EXTRA_AT, 0)
        title = intent.getStringExtra(EXTRA_TITLE)
        answered = false
        for ((button, _) in buttons) findViewById<Button>(button).isEnabled = true
        val at = if (fireAt > 0) fireAt else System.currentTimeMillis()
        findViewById<TextView>(R.id.alarm_time).text = android.text.format.DateFormat.getTimeFormat(this).format(Date(at))
        showTitle()
    }

    /** "Reminder" over a locked phone whose lock screen hides private notification content. */
    private fun showTitle() {
        val locked = getSystemService(KeyguardManager::class.java).isKeyguardLocked
        val privateShown = Settings.Secure.getInt(contentResolver, "lock_screen_allow_private_notifications", 1) != 0 &&
            Settings.Secure.getInt(contentResolver, "lock_screen_show_notifications", 1) != 0
        val name = title?.takeIf { UrgentAlarms.showTitle(locked, privateShown) }
        findViewById<TextView>(R.id.alarm_title).text = name ?: getString(R.string.reminder_generic)
    }

    companion object {
        const val EXTRA_ID = "id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_AT = "fireAt"

        @Volatile private var current: WeakReference<AlarmActivity>? = null

        /** ReminderActions: the reminder [id] was answered; its alarm screen, if it shows, closes. */
        fun answered(id: String) {
            val a = current?.get() ?: return
            a.runOnUiThread { if (a.reminderId == id && !a.isFinishing) a.finish() }
        }
    }
}
