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
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(200, "<html>Example Domain</html>").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(200, """{"status":"ok"}""").outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(404, null).outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(301, null).outcome)
        assertEquals(Outcome.NOT_OPENTODO, HealthCheck.classify(503, null).outcome)
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
        val closed = ServerSocket(0).let { val p = it.localPort; it.close(); p }
        assertEquals(Outcome.NO_NETWORK, HealthCheck.check("http://127.0.0.1:$closed").outcome)
    }
}
