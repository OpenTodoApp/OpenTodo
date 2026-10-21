package app.opentodo

import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.security.cert.CertificateException
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException

/** The first-run check: `GET <origin>/healthz` must answer `{"status":"ok","version":…}`. */
object HealthCheck {
    enum class Outcome { OK, NO_NETWORK, NOT_OPENTODO, UNTRUSTED }

    data class Answer(val outcome: Outcome, val version: String? = null)

    /** Classifies a failed connection: certificate problems apart from everything else. */
    fun classify(error: Throwable): Outcome {
        var e: Throwable? = error
        while (e != null) {
            if (e is SSLHandshakeException || e is CertificateException) return Outcome.UNTRUSTED
            if (e is SSLException) return Outcome.UNTRUSTED
            if (e is UnknownHostException || e is ConnectException || e is NoRouteToHostException || e is SocketTimeoutException) return Outcome.NO_NETWORK
            e = e.cause
        }
        return Outcome.NO_NETWORK
    }

    /** Classifies a response: anything but OpenTodo's health answer is "not an OpenTodo server". */
    fun classify(status: Int, body: String?): Answer {
        if (status != 200 || body == null) return Answer(Outcome.NOT_OPENTODO)
        return try {
            val json = JSONObject(body)
            if (json.optString("status") == "ok" && json.has("version")) Answer(Outcome.OK, json.optString("version"))
            else Answer(Outcome.NOT_OPENTODO)
        } catch (e: Exception) {
            Answer(Outcome.NOT_OPENTODO)
        }
    }

    /** Blocking; call off the main thread. Redirects are not followed (another origin is another server). */
    fun check(origin: String): Answer {
        val conn = try { URL("$origin/healthz").openConnection() as HttpURLConnection } catch (e: IOException) { return Answer(classify(e)) }
        return try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Accept", "application/json")
            val status = conn.responseCode
            val body = if (status == 200) conn.inputStream.use { s -> s.readBytes().take(64 * 1024).toByteArray().toString(Charsets.UTF_8) } else null
            classify(status, body)
        } catch (e: IOException) {
            Answer(classify(e))
        } finally {
            conn.disconnect()
        }
    }
}
