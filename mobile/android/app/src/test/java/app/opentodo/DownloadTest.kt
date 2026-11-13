package app.opentodo

import app.opentodo.Download.Decision
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

/** shell-repairs D2: which downloads the shell fetches itself, and the name it proposes. */
class DownloadTest {
    private val server = "https://todo.example.com"
    private val dir: File = Files.createTempDirectory("opentodo-download").toFile()

    @After fun tearDown() { dir.deleteRecursively() }

    @Test fun onlyTheServersOwnAddressesAreFetched() {
        assertEquals(Decision.FETCH, Download.decide("https://todo.example.com/api/v1/export?format=json", server))
        assertEquals(Decision.FETCH, Download.decide("https://TODO.example.com:443/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("https://example.org/file.zip", server))
        assertEquals(Decision.FOREIGN, Download.decide("http://todo.example.com/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("https://todo.example.com:8443/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("https://todo.example.com.evil.test/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("https://todo.example.com@evil.test/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("ftp://todo.example.com/a", server))
        assertEquals(Decision.FOREIGN, Download.decide("file:///data/data/app.opentodo/x", server))
        assertEquals(Decision.FOREIGN, Download.decide("", server))
        assertEquals(Decision.FOREIGN, Download.decide("https://todo.example.com/a", null))
    }

    @Test fun blobAndDataAreLeftToTheBridge() {
        assertEquals(Decision.IGNORE, Download.decide("blob:https://todo.example.com/7d1c", server))
        assertEquals(Decision.IGNORE, Download.decide("BLOB:https://example.org/7d1c", server))
        assertEquals(Decision.IGNORE, Download.decide("data:text/plain;base64,QQ==", server))
    }

    @Test fun theNameOfAContentDisposition() {
        assertEquals("opentodo-export.json", Download.dispositionName("""attachment; filename="opentodo-export.json""""))
        assertEquals("export.csv", Download.dispositionName("attachment; filename=export.csv"))
        assertEquals("export.csv", Download.dispositionName("attachment; FileName = export.csv ; size=3"))
        assertEquals("a \"b\".txt", Download.dispositionName("""attachment; filename="a \"b\".txt""""))
        assertEquals("a;b.txt", Download.dispositionName("""attachment; filename="a;b.txt""""))
        // filename* wins, whatever the order.
        assertEquals("März €.txt", Download.dispositionName("""attachment; filename="Marz.txt"; filename*=UTF-8''M%C3%A4rz%20%E2%82%AC.txt"""))
        assertEquals("März.txt", Download.dispositionName("""attachment; filename*=utf-8'de'M%C3%A4rz.txt; filename="Marz.txt""""))
        assertEquals("März.txt", Download.dispositionName("attachment; filename*=ISO-8859-1''M%E4rz.txt"))
        // A filename* that cannot be read falls back to filename.
        assertEquals("plain.txt", Download.dispositionName("""attachment; filename*=UTF-8''%E4%zz; filename="plain.txt""""))
        assertEquals("plain.txt", Download.dispositionName("""attachment; filename*=UTF-16''a; filename=plain.txt"""))
        for (none in listOf(null, "", "attachment", "inline; size=3", "attachment; filename=", """attachment; filename="""""")) assertNull(none, Download.dispositionName(none))
    }

    @Test fun theProposedName() {
        assertEquals("passwd", Download.fileName("""attachment; filename="../../etc/passwd"""", "$server/x"))
        assertEquals("passwd", Download.fileName("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd", "$server/x"))
        assertEquals("content", Download.fileName(null, "$server/api/v1/attachments/abc/content?download=1"))
        assertEquals("my file.pdf", Download.fileName("attachment", "$server/files/my%20file.pdf"))
        assertEquals("download", Download.fileName(null, "$server/"))
        assertEquals("download", Download.fileName(null, "not an address"))
    }

    /** One connection per response, in order; the request heads are recorded. */
    private fun serve(vararg responses: String): Pair<String, List<String>> {
        val socket = ServerSocket(0)
        val heads = CopyOnWriteArrayList<String>()
        thread(isDaemon = true) {
            socket.use { s ->
                for (response in responses) s.accept().use { c ->
                    val head = StringBuilder()
                    val r = c.getInputStream().bufferedReader()
                    while (true) { val line = r.readLine(); if (line.isNullOrEmpty()) break; head.append(line).append('\n') }
                    heads += head.toString()
                    c.getOutputStream().write(response.toByteArray(Charsets.ISO_8859_1))
                    c.getOutputStream().flush()
                }
            }
        }
        return "http://localhost:${socket.localPort}" to heads
    }

    private fun files(): List<File> = dir.listFiles()?.toList() ?: emptyList()

    @Test fun aFileOfTheServerIsFetchedWithTheCookies() {
        val (origin, heads) = serve(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Disposition: attachment; filename=\"opentodo-export.json\"\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        )
        val got = Download.fetch("$origin/api/v1/export", origin, "OpenTodoAndroid/test", dir) { "session=abc" }!!
        assertEquals("opentodo-export.json", got.name)
        assertEquals("application/json", got.type)
        assertArrayEquals("{}".toByteArray(), got.file.readBytes())
        assertEquals(listOf(got.file), files())
        assertEquals(true, heads.single().contains("Cookie: session=abc"))
        assertEquals(true, heads.single().contains("User-Agent: OpenTodoAndroid/test"))
    }

    @Test fun theWebViewsNameAndTypeWhenTheAnswerHasNone() {
        val (origin, _) = serve("HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\nx")
        val got = Download.fetch("$origin/f", origin, null, dir, "attachment; filename=seen.bin", "application/pdf") { null }!!
        assertEquals("seen.bin", got.name)
        assertEquals("application/pdf", got.type)
    }

    @Test fun aRedirectOnTheServerIsFollowed() {
        val (origin, heads) = serve(
            "HTTP/1.1 302 Found\r\nLocation: /files/a.txt\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nhi",
        )
        val got = Download.fetch("$origin/go", origin, null, dir) { null }!!
        assertEquals("a.txt", got.name)
        assertEquals("hi", got.file.readText())
        assertEquals(2, heads.size)
    }

    @Test fun aRedirectOffTheServerAndAFailureSaveNothing() {
        val (away, _) = serve("HTTP/1.1 302 Found\r\nLocation: https://example.org/file\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        assertNull(Download.fetch("$away/go", away, null, dir) { null })
        val (missing, _) = serve("HTTP/1.1 404 Not Found\r\nContent-Length: 2\r\nConnection: close\r\n\r\nno")
        assertNull(Download.fetch("$missing/f", missing, null, dir) { null })
        val (refused, _) = serve("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        assertNull(Download.fetch("$refused/f", refused, null, dir) { null })
        // A transfer that breaks before its announced length leaves no partial file.
        val (broken, _) = serve("HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort")
        assertNull(Download.fetch("$broken/f", broken, null, dir) { null })
        // Another origin is never asked.
        assertNull(Download.fetch("https://example.org/f", broken, null, dir) { null })
        val closed = ServerSocket(0).use { it.localPort }
        assertNull(Download.fetch("http://localhost:$closed/f", "http://localhost:$closed", null, dir) { null })
        assertEquals(emptyList<File>(), files())
    }
}
