package app.opentodo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** native-shells "Quick actions on the app icon": what the icon's trampoline hands on. */
class ShortcutTest {
    @Test fun forwardsTheIconsActions() {
        assertTrue(Shortcut.forwards("android.intent.action.VIEW", "opentodo-open"))
        assertTrue(Shortcut.forwards(MainActivity.ACTION_CHANGE_SERVER, null))
    }

    @Test fun dropsEverythingElse() {
        assertFalse(Shortcut.forwards("android.intent.action.VIEW", "https"))
        assertFalse(Shortcut.forwards("android.intent.action.VIEW", "opentodo"))
        assertFalse(Shortcut.forwards("android.intent.action.SEND", "opentodo-open"))
        assertFalse(Shortcut.forwards(null, null))
    }
}
