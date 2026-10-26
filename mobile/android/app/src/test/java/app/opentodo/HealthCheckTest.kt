package app.opentodo

import app.opentodo.HealthCheck.Outcome
import org.junit.Assert.assertEquals
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
    @Test fun responses() {
        assertEquals(HealthCheck.Answer(Outcome.OK, "0.10.0"), HealthCheck.classify(200, """{"status":"ok","version":"0.10.0"}"""))
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(200, """{"status":"ok"}""").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(200, "plain text").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(404, null).outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(404, null, contentType = "text/html").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(301, null).outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(503, null).outcome)
    }

    /** android-sign-in-flows: a login wall is not "not an OpenTodo server". */
    @Test fun loginWalls() {
        val o = "https://todo.example.com"
        // Pangolin, Authelia, Cloudflare Access: a redirect to the wall's sign-in page elsewhere.
        assertEquals(Outcome.LOGIN_WALL, HealthCheck.classify(302, null, "https://pangolin.example.com/auth/resource/1?redirect=x", origin = o).outcome)
        // oauth2-proxy: a redirect to its sign-in page on the same host.
        assertEquals(Outcome.LOGIN_WALL, HealthCheck.classify(302, null, "/oauth2/sign_in?rd=%2Fhealthz", origin = o).outcome)
        // A 401 or 403 with a sign-in page.
        assertEquals(Outcome.LOGIN_WALL, HealthCheck.classify(401, null, contentType = "text/html; charset=utf-8", origin = o).outcome)
        assertEquals(Outcome.LOGIN_WALL, HealthCheck.classify(403, null, contentType = "text/html", origin = o).outcome)
        // A page instead of the health answer: perhaps a wall, perhaps another site.
        assertEquals(Outcome.WEB_PAGE, HealthCheck.classify(200, "<html>Example Domain</html>").outcome)
        assertEquals(Outcome.WEB_PAGE, HealthCheck.classify(200, "", contentType = "text/html").outcome)
        // A moved server (http to https, another host) is still not OpenTodo here.
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(301, null, "https://todo.example.com/healthz", origin = "http://todo.example.com").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(308, null, "https://www.example.com/healthz/", origin = o).outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(401, null, contentType = "application/json", origin = o).outcome)
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
}
