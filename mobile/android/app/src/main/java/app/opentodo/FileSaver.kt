package app.opentodo

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.webkit.CookieManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * The save dialog of the visible app (shell-repairs D2): a whole file from the app's cache,
 * made in the page ([FileSave]) or fetched from the server ([Download]), is offered through
 * `ACTION_CREATE_DOCUMENT`, copied to the document the user chooses and deleted from the
 * cache in every outcome. A copy that breaks removes the document again, so nothing partial
 * stays. No permission is needed. Created with the activity (it registers for a result);
 * its one background thread keeps the chunks of a file in order.
 */
class FileSaver(private val activity: AppCompatActivity) {
    private class Pending(val file: File, val done: (String) -> Unit)

    private val io = Executors.newSingleThreadExecutor()
    /** Lazy: the activity has no cache directory yet when its fields are made. */
    private val chunks by lazy { FileSave(dir(activity)) }
    private var pending: Pending? = null
    private val picker = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        chosen(if (r.resultCode == Activity.RESULT_OK) r.data?.data else null)
    }

    /** At app start: nothing of an earlier save is kept. */
    fun clearStale() {
        val d = dir(activity)
        background { FileSave.clear(d) }
    }

    /** With the activity: no thread stays, and an unfinished file goes. */
    fun close() {
        background { chunks.discard() }
        io.shutdown()
    }

    /**
     * The bridge's `saveFile`: one chunk of a file made in the page. [done] gets `more` for
     * an accepted chunk that is not the last, `failed` for a malformed one, and after the
     * last chunk the save dialog's outcome. [done] may run on any thread.
     */
    fun chunk(json: String, done: (String) -> Unit) {
        val ran = background {
            when (val step = chunks.accept(json)) {
                FileSave.Step.More -> done(FileSave.MORE)
                FileSave.Step.Failed -> done(FileSave.FAILED)
                is FileSave.Step.Whole -> activity.runOnUiThread { save(step.file, step.name, step.type, done) }
            }
        }
        if (!ran) done(FileSave.FAILED)
    }

    /** Main thread. Opens the save dialog for [file]; [done] gets `saved`, `cancelled` or `failed`. */
    fun save(file: File, name: String, type: String, done: (String) -> Unit) {
        if (pending != null || activity.isFinishing || activity.isDestroyed) { file.delete(); done(FileSave.FAILED); return }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(type)
            .putExtra(Intent.EXTRA_TITLE, name)
        pending = Pending(file, done)
        try {
            picker.launch(intent)
        } catch (e: ActivityNotFoundException) {
            pending = null
            file.delete()
            done(FileSave.FAILED)
        }
    }

    /**
     * Main thread. A download the web view starts: an address of the server is fetched with
     * the web view's cookies and saved; `blob:` and `data:` are left to the bridge; anything
     * else goes to [foreign], as a link to another site does.
     */
    fun download(url: String, origin: String?, userAgent: String?, disposition: String?, mimeType: String?, foreign: (String) -> Unit) {
        when (Download.decide(url, origin)) {
            Download.Decision.IGNORE -> return
            Download.Decision.FOREIGN -> foreign(url)
            Download.Decision.FETCH -> {
                val server = origin ?: return
                val d = dir(activity)
                background {
                    val fetched = Download.fetch(url, server, userAgent, d, disposition, mimeType) { CookieManager.getInstance().getCookie(it) }
                    // The page cannot know how a download it only linked to ended, so the shell says it.
                    activity.runOnUiThread {
                        if (fetched == null) failed()
                        else save(fetched.file, fetched.name, fetched.type) { if (it == FileSave.FAILED) failed() }
                    }
                }
            }
        }
    }

    private fun failed() {
        if (!activity.isFinishing && !activity.isDestroyed) Toast.makeText(activity, R.string.save_failed, Toast.LENGTH_LONG).show()
    }

    private fun chosen(target: Uri?) {
        val p = pending ?: return
        pending = null
        if (target == null) { p.file.delete(); p.done(FileSave.CANCELLED); return }
        val ran = background {
            val ok = copy(p.file, target)
            p.file.delete()
            if (!ok) remove(target)
            activity.runOnUiThread { p.done(if (ok) FileSave.SAVED else FileSave.FAILED) }
        }
        if (!ran) { p.file.delete(); remove(target); p.done(FileSave.FAILED) }
    }

    private fun copy(file: File, target: Uri): Boolean = try {
        val out = activity.contentResolver.openOutputStream(target, "w")
        if (out == null) false else { out.use { o -> file.inputStream().use { it.copyTo(o) } }; true }
    } catch (e: Exception) {
        false
    }

    /** A document whose copy broke is removed again: a file is written whole or not at all. */
    private fun remove(target: Uri) {
        try { DocumentsContract.deleteDocument(activity.contentResolver, target) } catch (e: Exception) { /* the provider keeps it */ }
    }

    /** False when the thread is already shut down (the activity is going away). */
    private fun background(work: () -> Unit): Boolean = try {
        io.execute(work)
        true
    } catch (e: RejectedExecutionException) {
        false
    }

    companion object {
        fun dir(context: android.content.Context): File = File(context.cacheDir, "save")
    }
}
