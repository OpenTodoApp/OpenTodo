package app.opentodo

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * The phone's copy of the web app, used when the server can't be reached
 * (native-shells, Offline start).
 *
 * A service worker exists only on a secure origin. A server at
 * `http://192.168.x.x` never precaches, and a WebView's first navigation in a
 * new process often fails before a worker that does exist can answer. After a
 * page has loaded, the shell stores the same files the worker would and serves
 * them for the next open. Requests under `/api/`, `/healthz` and `/t/` are
 * never stored: those stay the server's, or the task page's own document.
 */
object ShellCache {
    const val MAX_FILE = 8 * 1024 * 1024
    internal const val MAX_TOTAL = 64L * 1024 * 1024
    private const val MAX_FILES = 2000
    private const val DEADLINE_MS = 90_000L
    private val META = setOf("manifest.tsv", "csp.txt")
    private val OBJECT = Regex("""\{[^{}]{0,500}\}""")
    private val URL_FIELD = Regex(""""url"\s*:\s*"((?:\\.|[^"\\])*)"""")
    private val REV_FIELD = Regex(""""revision"\s*:\s*(?:"([^"]*)"|null)""")

    enum class Serve { PASS, SHELL, FILE }

    data class Entry(val path: String, val revision: String)
    data class Fetched(val status: Int, val body: ByteArray, val contentType: String?, val csp: String?)

    /** No network, and a copy from an earlier successful open. */
    fun openFromCache(offline: Boolean, hasShell: Boolean) = offline && hasShell

    /**
     * WebViewClient codes for a failed connection: UNKNOWN, HOST_LOOKUP, CONNECT, IO, TIMEOUT.
     * A certificate failure has its own callback and is not one of these.
     */
    fun networkError(code: Int) = code == -1 || code == -2 || code == -6 || code == -7 || code == -8

    /** https, and http on localhost: the origins where a service worker can install. */
    fun serviceWorkerOrigin(origin: String): Boolean {
        val uri = try { URI(origin) } catch (e: Exception) { return false }
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme == "https") return true
        if (scheme != "http") return false
        val host = uri.host?.lowercase()?.trim('[', ']') ?: return false
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    /** What to answer from the copy. Anything else goes to the network as usual. */
    fun serve(method: String, path: String, cached: Set<String>): Serve {
        if (!method.equals("GET", true) && !method.equals("HEAD", true)) return Serve.PASS
        val rel = relative(path) ?: return Serve.PASS
        if (denied(rel)) return Serve.PASS
        if (rel.isEmpty()) return if ("index.html" in cached) Serve.SHELL else Serve.PASS
        if (rel in cached) return Serve.FILE
        val name = rel.substringAfterLast('/')
        if ('.' !in name && "index.html" in cached) return Serve.SHELL
        return Serve.PASS
    }

    /** The path inside the copy, or null when it could leave the directory. */
    fun relative(path: String): String? {
        val raw = path.substringBefore('?').substringBefore('#')
        val withSlash = if (raw.startsWith("/")) raw else "/$raw"
        val decoded = try { URI("http://local$withSlash").path } catch (e: Exception) { return null } ?: return null
        val rel = decoded.trimStart('/')
        if (rel.isEmpty()) return ""
        if (!safeRelative(rel)) return null
        return rel
    }

    fun safeRelative(path: String): Boolean {
        if (path.isEmpty() || path.length > 300 || path in META) return false
        if (path.startsWith("/") || path.contains('\\') || path.contains('\u0000')) return false
        return path.split('/').none { it.isEmpty() || it == "." || it == ".." }
    }

    fun precacheEntries(swJs: String): List<Entry> {
        val byPath = LinkedHashMap<String, Entry>()
        for (m in OBJECT.findAll(swJs)) {
            val body = m.value
            val raw = URL_FIELD.find(body)?.groupValues?.get(1) ?: continue
            val rev = REV_FIELD.find(body)?.groupValues?.get(1)?.ifEmpty { "null" } ?: continue
            if (rev.contains('\t') || rev.contains('\n')) continue
            val path = precachePath(jsonUnescape(raw)) ?: continue
            byPath[path] = Entry(path, rev)
        }
        return byPath.values.toList()
    }

    fun mime(path: String) = when (ext(path)) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "ico" -> "image/x-icon"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "json" -> "application/json"
        "webmanifest" -> "application/manifest+json"
        "md" -> "text/markdown"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    fun charset(path: String): String? = when (ext(path)) {
        "png", "jpg", "jpeg", "webp", "gif", "ico", "woff", "woff2" -> null
        else -> "utf-8"
    }

    /**
     * Downloads the precache into [store]. Unchanged files stay. A failure leaves
     * the previous copy in place. Blocking; call off the main thread.
     */
    fun refresh(origin: String, cookies: String?, store: ShellStore): Boolean =
        refresh(store) { path -> httpGet(origin, path, cookies) }

    fun refresh(store: ShellStore, get: (String) -> Fetched?): Boolean {
        val gen = store.generation()
        val sw = get("/sw.js") ?: return false
        if (sw.status != 200 || sw.body.size > MAX_FILE || html(sw.contentType)) return false
        val entries = precacheEntries(sw.body.toString(Charsets.UTF_8))
        if (entries.none { it.path == "index.html" } || entries.size > MAX_FILES) return false
        val manifest = entries.sortedBy { it.path }.joinToString("\n") { "${it.revision}\t${it.path}" }
        if (store.sameManifest(manifest)) {
            val page = get("/")
            if (page != null && page.status == 200 && acceptable("index.html", page.contentType)) store.setCsp(page.csp, gen)
            return store.hasShell()
        }
        val have = store.revisions()
        val needed = entries.filter { have[it.path] != it.revision || !store.hasFile(it.path) }
        val fresh = HashMap<String, ByteArray>()
        var csp: String? = null
        val started = System.currentTimeMillis()
        val pool = Executors.newFixedThreadPool(4)
        try {
            val jobs = needed.map { entry ->
                entry to pool.submit<Fetched?> {
                    if (System.currentTimeMillis() - started > DEADLINE_MS) return@submit null
                    val urlPath = if (entry.path == "index.html") "/" else "/${entry.path}"
                    val res = get(urlPath) ?: return@submit null
                    if (res.status != 200 || res.body.size > MAX_FILE || !acceptable(entry.path, res.contentType)) return@submit null
                    if (entry.path == "index.html" && !appShell(res.body)) return@submit null
                    res
                }
            }
            for ((entry, job) in jobs) {
                val res = try { job.get() } catch (e: Exception) { null } ?: return false
                fresh[entry.path] = res.body
                if (entry.path == "index.html") csp = res.csp
            }
        } finally {
            pool.shutdownNow()
            pool.awaitTermination(5, TimeUnit.SECONDS)
        }
        return store.replace(gen, manifest, entries, fresh, csp ?: store.csp())
    }

    /** One GET. Redirects are not followed: another origin is another server. */
    fun httpGet(origin: String, path: String, cookies: String?): Fetched? {
        if (!path.startsWith("/") || path.startsWith("//")) return null
        val url = try {
            val base = URI(origin)
            val target = base.resolve(path)
            if (!target.scheme.equals(base.scheme, true) || target.host == null || !target.host.equals(base.host, true)) return null
            if (target.port != base.port) return null
            target.toURL()
        } catch (e: Exception) { return null }
        val conn = try { url.openConnection() as HttpURLConnection } catch (e: IOException) { return null }
        return try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "*/*")
            if (!cookies.isNullOrEmpty()) conn.setRequestProperty("Cookie", cookies)
            val status = conn.responseCode
            val body = if (status == 200) readAtMost(conn.inputStream, MAX_FILE + 1) else ByteArray(0)
            Fetched(status, body, conn.contentType, conn.getHeaderField("Content-Security-Policy"))
        } catch (e: IOException) {
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun precachePath(url: String): String? {
        val bare = if (url.startsWith("http://") || url.startsWith("https://")) {
            val slash = url.indexOf('/', url.indexOf("://") + 3)
            if (slash < 0) return null else url.substring(slash)
        } else url
        val rel = bare.substringBefore('?').substringBefore('#').trimStart('/')
        if (rel.isEmpty()) return "index.html"
        if (!safeRelative(rel) || denied(rel)) return null
        return rel
    }

    private fun denied(rel: String): Boolean {
        if (rel.isEmpty()) return false
        return rel == "api" || rel.startsWith("api/") || rel == "healthz" || rel.startsWith("healthz/") || rel == "t" || rel.startsWith("t/")
    }

    /** The app's document, not a login wall that happens to be HTML. */
    internal fun appShell(body: ByteArray): Boolean {
        val text = body.toString(Charsets.UTF_8)
        return "id=\"root\"" in text || "id='root'" in text
    }

    private fun acceptable(path: String, contentType: String?): Boolean {
        val isHtml = path.endsWith(".html")
        if (isHtml) return html(contentType)
        return !html(contentType)
    }

    private fun html(contentType: String?) =
        contentType?.substringBefore(';')?.trim()?.equals("text/html", true) == true

    private fun jsonUnescape(s: String) = s.replace("\\/", "/").replace("\\\"", "\"").replace("\\\\", "\\")

    private fun ext(path: String) = path.substringAfterLast('.', "").lowercase()

    internal fun readAtMost(input: InputStream, max: Int): ByteArray {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8192)
        var total = 0
        while (total < max) {
            val n = input.read(buf, 0, minOf(buf.size, max - total))
            if (n < 0) break
            out.write(buf, 0, n)
            total += n
        }
        return out.toByteArray()
    }
}

/**
 * The copy on disk, one directory per server. [replace] swaps the directory
 * only after every file is present, so a failed refresh keeps the old copy.
 */
class ShellStore(private val root: File) {
    private val lock = Any()
    private var generation = 0
    private var paths: Set<String> = emptySet()
    private var revisions: Map<String, String> = emptyMap()
    private var manifest: String? = null
    private var cspText: String? = null

    fun load() = synchronized(lock) { readIndex() }

    fun generation(): Int = synchronized(lock) { generation }

    fun hasShell(): Boolean = synchronized(lock) { "index.html" in paths && File(root, "index.html").isFile }

    fun paths(): Set<String> = synchronized(lock) { paths }

    fun revisions(): Map<String, String> = synchronized(lock) { revisions }

    fun sameManifest(text: String): Boolean = synchronized(lock) { manifest == text && "index.html" in paths }

    fun hasFile(path: String): Boolean = synchronized(lock) { ShellCache.safeRelative(path) && path in paths && File(root, path).isFile }

    fun csp(): String? = synchronized(lock) { cspText }

    fun read(path: String): ByteArray? {
        synchronized(lock) {
            if (path !in paths || !ShellCache.safeRelative(path)) return null
            val f = File(root, path)
            if (!f.isFile) return null
            return f.readBytes()
        }
    }

    fun setCsp(csp: String?, gen: Int) {
        synchronized(lock) {
            if (gen != generation || !root.isDirectory) return
            cspText = csp?.takeIf { it.isNotEmpty() }
            val f = File(root, "csp.txt")
            if (cspText == null) f.delete() else f.writeText(cspText!!)
        }
    }

    fun clear() = synchronized(lock) {
        generation++
        root.deleteRecursively()
        paths = emptySet()
        revisions = emptyMap()
        manifest = null
        cspText = null
    }

    fun replace(gen: Int, manifestText: String, entries: List<ShellCache.Entry>, fresh: Map<String, ByteArray>, csp: String?): Boolean {
        synchronized(lock) { if (gen != generation) return false }
        val parent = root.parentFile ?: return false
        parent.mkdirs()
        val tmp = File(parent, root.name + ".next")
        tmp.deleteRecursively()
        if (!tmp.mkdirs()) return false
        var total = 0L
        for (e in entries) {
            val out = fileUnder(tmp, e.path) ?: return abandon(tmp)
            val bytes = fresh[e.path]
            if (bytes != null) {
                if (bytes.size > ShellCache.MAX_FILE) return abandon(tmp)
                out.writeBytes(bytes)
                total += bytes.size
            } else {
                val old = fileUnder(root, e.path)?.takeIf { it.isFile } ?: return abandon(tmp)
                old.copyTo(out, overwrite = true)
                total += out.length()
            }
            if (total > ShellCache.MAX_TOTAL) return abandon(tmp)
        }
        File(tmp, "manifest.tsv").writeText(manifestText)
        if (!csp.isNullOrEmpty()) File(tmp, "csp.txt").writeText(csp)
        synchronized(lock) {
            if (gen != generation) return abandon(tmp)
            val prev = File(parent, root.name + ".prev")
            prev.deleteRecursively()
            if (root.exists() && !root.renameTo(prev)) root.deleteRecursively()
            if (!tmp.renameTo(root)) {
                tmp.copyRecursively(root, overwrite = true)
                tmp.deleteRecursively()
            }
            prev.deleteRecursively()
            readIndex()
        }
        return hasShell()
    }

    private fun abandon(tmp: File): Boolean {
        tmp.deleteRecursively()
        return false
    }

    private fun readIndex() {
        val file = File(root, "manifest.tsv")
        if (!file.isFile) {
            paths = emptySet()
            revisions = emptyMap()
            manifest = null
            cspText = null
            return
        }
        val text = file.readText().trimEnd('\n')
        val map = LinkedHashMap<String, String>()
        for (line in text.split('\n')) {
            if (line.isEmpty()) continue
            val tab = line.indexOf('\t')
            if (tab <= 0) continue
            val path = line.substring(tab + 1)
            if (ShellCache.safeRelative(path)) map[path] = line.substring(0, tab)
        }
        revisions = map
        paths = map.keys
        manifest = map.entries.sortedBy { it.key }.joinToString("\n") { "${it.value}\t${it.key}" }
        cspText = File(root, "csp.txt").takeIf { it.isFile }?.readText()
    }

    private fun fileUnder(dir: File, rel: String): File? {
        if (!ShellCache.safeRelative(rel)) return null
        val dirPath = dir.canonicalFile
        val f = File(dirPath, rel)
        f.parentFile?.mkdirs()
        val filePath = f.canonicalFile
        val prefix = dirPath.path + File.separator
        if (!filePath.path.startsWith(prefix)) return null
        return f
    }

    companion object {
        fun open(parent: File, origin: String): ShellStore {
            val digest = MessageDigest.getInstance("SHA-256").digest(origin.toByteArray(Charsets.UTF_8))
            val name = digest.take(8).joinToString("") { "%02x".format(it) }
            return ShellStore(File(parent, name)).also { it.load() }
        }

        fun clearAll(parent: File) { parent.deleteRecursively() }
    }
}
