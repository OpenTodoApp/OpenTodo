package app.opentodo

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.util.Date

/**
 * The full-screen alarm of an urgent reminder (android-urgent-alarms D2): over the lock screen,
 * the time, the title and the notification's three actions. Each one silences the alarm and
 * applies the action like the notification's button, then the screen closes. Not exported: only
 * the reminder's own full-screen and content intents open it.
 */
class AlarmActivity : AppCompatActivity() {
    private var reminderId: String? = null

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
        for ((button, action) in listOf(R.id.alarm_done to "done", R.id.alarm_snooze to "snooze", R.id.alarm_dismiss to "dismiss")) {
            findViewById<Button>(button).setOnClickListener {
                reminderId?.let { ReminderActions.run(this, it, action) }
                finish()
            }
        }
        show(intent)
    }

    /** A second urgent reminder while this one shows: the newest is on screen, the other stays in the notifications. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        show(intent)
    }

    private fun show(intent: Intent) {
        reminderId = intent.getStringExtra(EXTRA_ID) ?: return finish()
        val at = intent.getLongExtra(EXTRA_AT, System.currentTimeMillis())
        findViewById<TextView>(R.id.alarm_time).text = android.text.format.DateFormat.getTimeFormat(this).format(Date(at))
        findViewById<TextView>(R.id.alarm_title).text = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.reminder_generic)
    }

    companion object {
        const val EXTRA_ID = "id"
        const val EXTRA_TITLE = "title"
        const val EXTRA_AT = "fireAt"
    }
}
