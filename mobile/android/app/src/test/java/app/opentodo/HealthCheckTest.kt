package app.opentodo

import app.opentodo.HealthCheck.Outcome
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.cert.CertificateException
import javax.net.ssl.SSLHandshakeException
import kotlin.concurrent.thread

class HealthCheckTest {
    /** The cases both apps read (the iOS app's HealthCheckTests too): test/resources/health-check/cases.json. */
    private val cases: JSONObject by lazy {
        val url = javaClass.classLoader!!.getResource("health-check/cases.json")
        assertNotNull("missing health-check/cases.json", url)
        JSONObject(url!!.readText())
    }

    private fun JSONObject.stringOrNull(key: String): String? = if (!has(key) || isNull(key)) null else getString(key)

    /** The cases' names ("notOpenTodo", the iOS app's) for [Outcome]'s. */
    private fun outcome(name: String): Outcome = Outcome.entries.first { it.name.replace("_", "").equals(name, ignoreCase = true) }

    /** android-sign-in-flows: a login wall is not "not an OpenTodo server". */
    @Test fun responsesFollowTheSharedCases() {
        val list = cases.getJSONArray("classify")
        for (i in 0 until list.length()) {
            val c = list.getJSONObject(i)
            val answer = HealthCheck.classify(c.getInt("status"), c.stringOrNull("body"), c.stringOrNull("location"), c.stringOrNull("contentType"), c.stringOrNull("origin"))
            assertEquals(c.getString("name"), HealthCheck.Answer(outcome(c.getString("outcome")), c.stringOrNull("version")), answer)
        }
    }

    /** health-route-alias: the second route is asked only when the first does not settle it. */
    @Test fun combineFollowsTheSharedCases() {
        val list = cases.getJSONArray("combine")
        for (i in 0 until list.length()) {
            val c = list.getJSONObject(i)
            val second = c.stringOrNull("second")
            val answer = HealthCheck.combine(HealthCheck.Answer(outcome(c.getString("first")))) {
                HealthCheck.Answer(outcome(second ?: throw AssertionError("${c.getString("name")}: the second route must not be asked")))
            }
            assertEquals(c.getString("name"), outcome(c.getString("outcome")), answer.outcome)
        }
    }

    @Test fun failures() {
        assertEquals(Outcome.NO_NETWORK, HealthCheck.classify(UnknownHostException("todo.example.com")))
        assertEquals(Outcome.NO_NETWORK, HealthCheck.classify(ConnectException("refused")))
        assertEquals(Outcome.NO_NETWORK, HealthCheck.classify(SocketTimeoutException()))
        assertEquals(Outcome.UNTRUSTED, HealthCheck.classify(SSLHandshakeException("PKIX path building failed")))
        assertEquals(Outcome.UNTRUSTED, HealthCheck.classify(IOException("wrapped", CertificateException("bad"))))
    }

    /** Against a local server: the real request, the real classification. */
    @Test fun localServer() {
        fun serve(response: String): Int {
            val socket = ServerSocket(0)
            thread {
                socket.use { s -> s.accept().use { c ->
                    c.getInputStream().bufferedReader().let { r -> while (r.readLine()?.isNotEmpty() == true) Unit }
                    c.getOutputStream().write(response.toByteArray())
                } }
            }
            return socket.localPort
        }
        val body = """{"status":"ok","version":"1.2.3"}"""
        val good = serve("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n$body")
        assertEquals(HealthCheck.Answer(Outcome.OK, "1.2.3"), HealthCheck.check("http://127.0.0.1:$good"))
        val other = serve("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.check("http://127.0.0.1:$other").outcome)
        val wall = serve("HTTP/1.1 302 Found\r\nLocation: https://auth.example.com/login\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        assertEquals(Outcome.LOGIN_WALL, HealthCheck.check("http://127.0.0.1:$wall").outcome)
        val closed = ServerSocket(0).let { val p = it.localPort; it.close(); p }
        assertEquals(Outcome.NO_NETWORK, HealthCheck.check("http://127.0.0.1:$closed").outcome)
    }

    /** health-route-alias: `/api/v1/health` first, `/healthz` for servers before 1.0.1. */
    @Test fun routes() {
        // A server that answers each path as given, recording the paths asked.
        fun serve(byPath: Map<String, String>, asked: MutableList<String>): Int {
            val socket = ServerSocket(0)
            thread {
                socket.use { s ->
                    repeat(byPath.size) {
                        s.accept().use { c ->
                            val r = c.getInputStream().bufferedReader()
                            val path = r.readLine()?.split(" ")?.getOrNull(1) ?: "/"
                            while (r.readLine()?.isNotEmpty() == true) Unit
                            synchronized(asked) { asked += path }
                            c.getOutputStream().write((byPath[path] ?: "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").toByteArray())
                        }
                    }
                }
            }
            return socket.localPort
        }
        fun ok(version: String): String {
            val body = """{"status":"ok","version":"$version"}"""
            return "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n$body"
        }
        // A current server: one request, to the new route.
        val asked = mutableListOf<String>()
        val current = serve(mapOf("/api/v1/health" to ok("1.0.1")), asked)
        assertEquals(HealthCheck.Answer(Outcome.OK, "1.0.1"), HealthCheck.check("http://127.0.0.1:$current"))
        assertEquals(listOf("/api/v1/health"), synchronized(asked) { asked.toList() })
        // An older server: the new route is unknown, /healthz answers.
        val asked2 = mutableListOf<String>()
        val older = serve(mapOf("/api/v1/health" to "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}", "/healthz" to ok("1.0.0")), asked2)
        assertEquals(HealthCheck.Answer(Outcome.OK, "1.0.0"), HealthCheck.check("http://127.0.0.1:$older"))
        assertEquals(listOf("/api/v1/health", "/healthz"), synchronized(asked2) { asked2.toList() })
    }
}
