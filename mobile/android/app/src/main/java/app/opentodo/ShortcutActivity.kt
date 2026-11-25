package app.opentodo

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** What a quick action on the app icon (res/xml/shortcuts.xml) may hand to MainActivity. */
object Shortcut {
    /** `opentodo-open:<path>` (Add task, Today) and Change server; anything else is dropped. */
    fun forwards(action: String?, scheme: String?): Boolean =
        (action == Intent.ACTION_VIEW && scheme == "opentodo-open") || action == MainActivity.ACTION_CHANGE_SERVER
}

/**
 * The icon's quick actions, with no window of its own (Theme.NoDisplay). The system starts a
 * static shortcut with a cleared task, which would recreate a running app and lose an open sheet
 * or a sign-in in progress; this activity takes that start in its own task and hands the action
 * to the singleTask MainActivity, which gets it in onNewIntent when it runs. Not exported: the
 * launcher starts shortcuts as this app.
 */
class ShortcutActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val i = intent
        if (Shortcut.forwards(i?.action, i?.data?.scheme)) {
            startActivity(Intent(this, MainActivity::class.java).setAction(i?.action).setData(i?.data).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        finish()
    }
}
