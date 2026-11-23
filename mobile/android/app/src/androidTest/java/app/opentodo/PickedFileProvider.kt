package app.opentodo

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/**
 * The test APK's stand-in for a document provider: whatever the file picker hands back, the
 * app gets a `content://` address like this one, which it can only read through a resolver.
 */
class PickedFileProvider : ContentProvider() {
    override fun onCreate() = true

    override fun getType(uri: Uri) = "application/zip"

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns).apply {
            addRow(columns.map { when (it) { OpenableColumns.DISPLAY_NAME -> NAME; OpenableColumns.SIZE -> BODY.length.toLong(); else -> null } })
        }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val file = File(context!!.cacheDir, NAME)
        file.writeText(BODY)
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

    companion object {
        const val NAME = "todoist-backup.zip"
        const val BODY = "picked through the file picker"

        /** The address the picker returns, in the test APK's own authority. */
        fun uri(): Uri = Uri.parse("content://${androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context.packageName}.picked/$NAME")
    }
}
