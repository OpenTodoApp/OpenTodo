package app.opentodo;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * The test APK's stand-in for a document provider: whatever the file picker hands back, the
 * app gets a {@code content://} address like this one, which it can only read through a resolver.
 * Java, not Kotlin: it runs in the test APK's own process, which has no Kotlin standard library.
 */
public class PickedFileProvider extends ContentProvider {
    public static final String NAME = "todoist-backup.zip";
    public static final String BODY = "picked through the file picker";

    /** The address the picker returns, in the test APK's own authority. */
    public static Uri uri(String testPackage) {
        return Uri.parse("content://" + testPackage + ".picked/" + NAME);
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) { return "application/zip"; }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String[] columns = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = NAME;
            else if (OpenableColumns.SIZE.equals(columns[i])) row[i] = (long) BODY.getBytes(StandardCharsets.UTF_8).length;
        }
        MatrixCursor cursor = new MatrixCursor(columns);
        cursor.addRow(row);
        return cursor;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = new File(getContext().getCacheDir(), NAME);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(BODY.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new FileNotFoundException(e.toString());
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
