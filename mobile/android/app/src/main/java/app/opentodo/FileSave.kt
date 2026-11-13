package app.opentodo

import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Base64
import java.util.UUID

/**
 * A file the web app saves through the bridge (shell-repairs D2, capability `files`).
 * `saveFile(json)` takes `{"id","name","type","data","last"}`: the chunks of one file share
 * `id`, arrive in order and carry base64 in `data`. They are appended to one file in [dir]
 * (the app's cache), which the activity then copies to the place the user chooses and
 * deletes. The payloads are pinned by the shared bridge fixture save-file.json.
 *
 * Pure Kotlin (no Android types) so the rules are unit tested on the JVM.
 */
class FileSave(private val dir: File) {
    /** One chunk as the web app hands it over. */
    class Chunk(val id: String, val name: String, val type: String, val data: ByteArray, val last: Boolean)

    /** What a chunk leads to: more to come, a whole file to save, or nothing. */
    sealed class Step {
        object More : Step()
        object Failed : Step()
        data class Whole(val file: File, val name: String, val type: String) : Step()
    }

    private var id: String? = null
    private var file: File? = null
    /** The file whose chunk failed: its later chunks are refused, never saved as a partial file. */
    private var refused: String? = null

    /**
     * Appends one chunk. A chunk with a new id discards the unfinished file before it; a
     * malformed payload or a failed write discards the file it belongs to and answers [Step.Failed].
     */
    @Synchronized
    fun accept(json: String): Step {
        val chunk = parse(json) ?: return fail(null)
        if (chunk.id == refused) return Step.Failed
        if (chunk.id != id) {
            discard()
            id = chunk.id
            file = newFile(dir)
        }
        val target = file ?: return fail(chunk.id)
        try {
            FileOutputStream(target, true).use { it.write(chunk.data) }
        } catch (e: IOException) {
            return fail(chunk.id)
        }
        if (!chunk.last) return Step.More
        id = null
        file = null
        return Step.Whole(target, name(chunk.name), type(chunk.type))
    }

    /** Deletes the unfinished file, if any. */
    @Synchronized
    fun discard() {
        file?.delete()
        file = null
        id = null
    }

    private fun fail(failed: String?): Step {
        val unfinished = id
        discard()
        refused = failed ?: unfinished ?: refused
        return Step.Failed
    }

    companion object {
        const val MORE = "more"
        const val SAVED = "saved"
        const val CANCELLED = "cancelled"
        const val FAILED = "failed"
        const val FALLBACK_NAME = "download"
        const val FALLBACK_TYPE = "application/octet-stream"
        private const val MAX_NAME = 200
        private val MIME = Regex("^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$")

        /** The chunk of a payload, or null for a malformed one. */
        fun parse(json: String): Chunk? {
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val id = (o.opt("id") as? String)?.takeIf { it.isNotEmpty() } ?: return null
            val name = o.opt("name") as? String ?: return null
            val type = o.opt("type") as? String ?: return null
            val data = o.opt("data") as? String ?: return null
            val last = o.opt("last") as? Boolean ?: return null
            val bytes = try { Base64.getDecoder().decode(data) } catch (e: IllegalArgumentException) { return null }
            return Chunk(id, name, type, bytes, last)
        }

        /**
         * The name the save dialog proposes: the last path segment, without control characters,
         * at most [MAX_NAME] characters; [FALLBACK_NAME] when nothing is left.
         */
        fun name(raw: String?): String {
            val segment = (raw ?: "").substringAfterLast('/').substringAfterLast('\\')
            val clean = segment.filterNot { Character.isISOControl(it) }.trim()
            if (clean.isEmpty() || clean == "." || clean == "..") return FALLBACK_NAME
            if (clean.length <= MAX_NAME) return clean
            // Never half of a surrogate pair at the cut.
            val cut = if (Character.isHighSurrogate(clean[MAX_NAME - 1])) MAX_NAME - 1 else MAX_NAME
            return clean.substring(0, cut)
        }

        /** The MIME type without its parameters, or [FALLBACK_TYPE] for none or a malformed one. */
        fun type(raw: String?): String {
            val type = (raw ?: "").substringBefore(';').trim().lowercase()
            return if (MIME.matches(type)) type else FALLBACK_TYPE
        }

        /** A new, empty file in [dir] under a name of the shell's own (never the page's). */
        fun newFile(dir: File): File {
            dir.mkdirs()
            return File(dir, UUID.randomUUID().toString() + ".part")
        }

        /** Deletes every file in [dir]: at app start, nothing of an earlier save is kept. */
        fun clear(dir: File) {
            dir.listFiles()?.forEach { it.delete() }
        }
    }
}
