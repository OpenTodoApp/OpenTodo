package app.opentodo

import android.webkit.WebChromeClient.FileChooserParams

/**
 * The picker the web view opens for an `<input type="file">`. We build the intent
 * ourselves instead of [FileChooserParams.createIntent], whose type filter (derived
 * from the input's `accept` list) greys out `.csv` and `.sqlite` on devices that do
 * not map those extensions to a MIME type, so an import cannot reach them. Offering
 * every openable file keeps it reachable; the web page validates what it accepts.
 */
object FilePick {
    /** Any openable file, so no extension is greyed out. */
    const val TYPE = "*/*"

    /** Whether the input allows choosing several files at once. */
    fun allowMultiple(mode: Int): Boolean = mode == FileChooserParams.MODE_OPEN_MULTIPLE
}
