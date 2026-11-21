package app.opentodo

import android.webkit.WebChromeClient.FileChooserParams
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FilePickTest {
    @Test fun offersEveryOpenableFile() {
        // Not narrowed to the input's accept list, so .csv/.sqlite are never greyed out.
        assertEquals("*/*", FilePick.TYPE)
    }

    @Test fun multipleFollowsTheInputMode() {
        assertTrue(FilePick.allowMultiple(FileChooserParams.MODE_OPEN_MULTIPLE))
        assertFalse(FilePick.allowMultiple(FileChooserParams.MODE_OPEN))
    }
}
