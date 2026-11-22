package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// tablet-shells D3: the app runs in split view, freeform windows and on foldables, and the
// web view is never recreated by a resize, a fold, a keyboard cover or a trackpad coming and going.
class TabletWindowTest {
    private val activity = Regex("""<activity\s[^>]*android:name="\.MainActivity"[^>]*>""")
        .find(File("src/main/AndroidManifest.xml").readText())!!.value

    @Test fun theActivityIsResizeable() {
        assertTrue(activity, activity.contains("""android:resizeableActivity="true""""))
    }

    @Test fun windowAndInputChangesKeepTheActivity() {
        val changes = Regex("""android:configChanges="([^"]*)"""").find(activity)!!.groupValues[1].split('|').toSet()
        for (c in listOf("orientation", "screenSize", "screenLayout", "smallestScreenSize", "keyboard", "keyboardHidden", "navigation")) {
            assertEquals(c, true, c in changes)
        }
    }
}
