package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.CompletableFuture
import kotlin.concurrent.thread

/** The phone's offline copy of the web app (native-shells, Offline start). */
class ShellCacheTest {
    private val sw = """
        precacheAndRoute([{"revision":"aaa","url":"index.html"},{"revision":"bbb","url":"assets/app.js"},{"revision":null,"url":"api/secret"},{"revision":"ccc","url":"../etc/passwd"}])
    """.trimIndent()

    @Test fun aServiceWorkerExistsOnlyOnASecureOrigin() {
        assertTrue(ShellCache.serviceWorkerOrigin("https://todo.example.com"))
        assertTrue(ShellCache.serviceWorkerOrigin("http://localhost:8080"))
        assertTrue(ShellCache.serviceWorkerOrigin("http://127.0.0.1:8080"))
        assertFalse(ShellCache.serviceWorkerOrigin("http://192.168.1.4:8080"))
        assertFalse(ShellCache.serviceWorkerOrigin("http://nas.local:8080"))
    }

    @Test fun thePrecacheDropsApiPathsAndPathsThatLeaveTheDirectory() {
        val paths = ShellCache.precacheEntries(sw).map { it.path }
        assertEquals(listOf("index.html", "assets/app.js"), paths)
        assertEquals("null", ShellCache.precacheEntries("""{"revision":null,"url":"favicon.svg"}""").single().revision)
    }

    @Test fun clientRoutesUseTheShellAndApiStaysOnTheNetwork() {
        val cached = setOf("index.html", "assets/app.js")
        assertEquals(ShellCache.Serve.SHELL, ShellCache.serve("GET", "/", cached))
        assertEquals(ShellCache.Serve.SHELL, ShellCache.serve("GET", "/today", cached))
        assertEquals(ShellCache.Serve.FILE, ShellCache.serve("GET", "/assets/app.js", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("GET", "/assets/missing.js", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("GET", "/api/v1/sync", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("GET", "/healthz", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("GET", "/t/abc", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("POST", "/share", cached))
        assertEquals(ShellCache.Serve.PASS, ShellCache.serve("GET", "/assets/%2e%2e/secret", cached))
        assertNull(ShellCache.relative("/assets/%2e%2e/secret"))
    }

    @Test fun onlyALostConnectionIsRetried() {
        assertTrue(ShellCache.networkError(-1))
        assertTrue(ShellCache.networkError(-6))
        assertFalse(ShellCache.networkError(-11))
        assertTrue(ShellCache.openFromCache(offline = true, hasShell = true))
        assertFalse(ShellCache.openFromCache(offline = false, hasShell = true))
        assertFalse(ShellCache.openFromCache(offline = true, hasShell = false))
    }

    @Test fun refreshStoresTheCopyAndSkipsFilesThatDidNotChange() {
        val store = tempStore()
        var calls = 0
        val get = getter(sw) { calls++ }
        assertTrue(ShellCache.refresh(store, get))
        assertEquals(setOf("index.html", "assets/app.js"), store.paths())
        assertEquals("<html><div id=\"root\"></div></html>", store.read("index.html")!!.decodeToString())
        assertEquals("default-src 'self'", store.csp())
        val after = calls
        assertTrue(ShellCache.refresh(store, get))
        assertEquals(2, calls - after)
        store.clear()
        assertFalse(store.hasShell())
    }

    @Test fun aFailedDownloadKeepsThePreviousCopy() {
        val store = tempStore()
        assertTrue(ShellCache.refresh(store, getter(sw)))
        val changed = sw.replace("bbb", "ddd")
        assertFalse(ShellCache.refresh(store) { path ->
            when (path) {
                "/sw.js" -> ShellCache.Fetched(200, changed.toByteArray(), "text/javascript", null)
                "/" -> ShellCache.Fetched(200, "<html><div id=\"root\"></div></html>".toByteArray(), "text/html", "default-src 'self'")
                "/assets/app.js" -> ShellCache.Fetched(500, ByteArray(0), "text/plain", null)
                else -> null
            }
        })
        assertEquals("console.log(1)", store.read("assets/app.js")!!.decodeToString())
    }

    @Test fun aLoginPageIsNotStoredAsTheApp() {
        val store = tempStore()
        assertFalse(ShellCache.refresh(store) { path ->
            when (path) {
                "/sw.js" -> ShellCache.Fetched(200, "<html>sign in</html>".toByteArray(), "text/html", null)
                else -> ShellCache.Fetched(200, "<html></html>".toByteArray(), "text/html", null)
            }
        })
        assertFalse(store.hasShell())
        assertFalse(ShellCache.refresh(store) { path ->
            val body = if (path == "/sw.js") sw else "<html>wall</html>"
            val type = if (path == "/assets/app.js") "text/html" else "text/javascript"
            val html = if (path == "/" || path == "/assets/app.js") "text/html" else type
            ShellCache.Fetched(200, body.toByteArray(), if (path == "/sw.js") "text/javascript" else html, null)
        })
        assertFalse(store.hasShell())
    }

    @Test fun httpGetSendsTheCookieAndStopsAtARedirect() {
        val seen = CompletableFuture<List<String>>()
        val port = once { seen.complete(it) }
        val got = ShellCache.httpGet("http://127.0.0.1:$port", "/sw.js", "session=1")
        assertEquals(200, got!!.status)
        assertEquals("ok", got.body.decodeToString())
        assertTrue(seen.get().any { it.equals("Cookie: session=1", true) })

        val redirected = once(response = "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/other\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        val stop = ShellCache.httpGet("http://127.0.0.1:$redirected", "/sw.js", null)
        assertEquals(302, stop!!.status)
        assertEquals(0, stop.body.size)
    }

    private fun tempStore(): ShellStore {
        val dir = File.createTempFile("shell", "").also { it.delete(); it.mkdirs() }
        return ShellStore(File(dir, "origin"))
    }

    private fun getter(worker: String, onCall: () -> Unit = {}): (String) -> ShellCache.Fetched? = { path ->
        onCall()
        when (path) {
            "/sw.js" -> ShellCache.Fetched(200, worker.toByteArray(), "text/javascript", null)
            "/" -> ShellCache.Fetched(200, "<html><div id=\"root\"></div></html>".toByteArray(), "text/html", "default-src 'self'")
            "/assets/app.js" -> ShellCache.Fetched(200, "console.log(1)".toByteArray(), "text/javascript", null)
            else -> null
        }
    }

    private fun once(response: String = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok", onRequest: (List<String>) -> Unit = {}): Int {
        val socket = ServerSocket(0)
        thread {
            socket.use { s ->
                s.accept().use { c ->
                    val lines = ArrayList<String>()
                    // `let`, not `use`: closing the reader would close the socket before the response is written.
                    c.getInputStream().bufferedReader().let { r ->
                        while (true) {
                            val line = r.readLine() ?: break
                            if (line.isEmpty()) break
                            lines.add(line)
                        }
                    }
                    onRequest(lines)
                    c.getOutputStream().write(response.toByteArray())
                }
            }
        }
        return socket.localPort
    }
}
