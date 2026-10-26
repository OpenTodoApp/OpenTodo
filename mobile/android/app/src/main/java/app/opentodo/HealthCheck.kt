package app.opentodo

import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URL
import java.net.UnknownHostException
import java.security.cert.CertificateException
import javax.net.ssl.SSLException
import javax.net.ssl.SSLHandshakeException

/**
 * The first-run check: `GET <origin>/healthz` must answer `{"status":"ok","version":…}`.
 * A login wall in front of the server (Pangolin, Authelia, Authentik, Cloudflare Access,
 * oauth2-proxy…) answers with a redirect to its sign-in page or with a sign-in page itself;
 * that is told apart from an address that is simply not OpenTodo (android-sign-in-flows).
 */
object HealthCheck {
    /**
     * [LOGIN_WALL]: a redirect to a sign-in page, or a page refusing access (401/403);
     * [WEB_PAGE]: an ordinary web page, which may be a login wall's or simply another site.
     */
    enum class Outcome { OK, NO_NETWORK, NOT_OPENTODO, UNTRUSTED, LOGIN_WALL, WEB_PAGE }

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

    /**
     * Classifies a response to `GET <origin>/healthz`. [location] is the redirect target as
     * sent, [contentType] the response's type. A redirect to a health route elsewhere (another
     * host, http to https) is a moved server, not a login wall: "not an OpenTodo server".
     */
    fun classify(status: Int, body: String?, location: String? = null, contentType: String? = null, origin: String? = null): Answer {
        val html = contentType?.lowercase()?.contains("text/html") == true || body?.trimStart()?.startsWith("<") == true
        if (status in 300..399) return Answer(if (location != null && redirectsToLogin(location, origin)) Outcome.LOGIN_WALL else Outcome.NOT_OPENTODO)
        if ((status == 401 || status == 403) && html) return Answer(Outcome.LOGIN_WALL)
        if (status != 200 || body == null) return Answer(Outcome.NOT_OPENTODO)
        return try {
            val json = JSONObject(body)
            if (json.optString("status") == "ok" && json.has("version")) Answer(Outcome.OK, json.optString("version"))
            else Answer(Outcome.NOT_OPENTODO)
        } catch (e: Exception) {
            Answer(if (html) Outcome.WEB_PAGE else Outcome.NOT_OPENTODO)
        }
    }

    /** True when a redirect leads anywhere but a `/healthz` (a sign-in page, the wall's portal). */
    private fun redirectsToLogin(location: String, origin: String?): Boolean {
        val target = try {
            if (origin != null) URI("$origin/healthz").resolve(location.trim()) else URI(location.trim())
        } catch (e: Exception) {
            return false
        }
        return target.path?.trimEnd('/') != "/healthz"
    }

    /**
     * Blocking; call off the main thread. Redirects are not followed (another origin is another
     * server). [cookies]: the web view's cookies for the server, so a login wall the person got
     * through in the app lets the check through too.
     */
    fun check(origin: String, cookies: String? = null): Answer {
        val conn = try { URL("$origin/healthz").openConnection() as HttpURLConnection } catch (e: IOException) { return Answer(classify(e)) }
        return try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            // text/html too: some login walls answer a client that takes no page with a bare 401.
            conn.setRequestProperty("Accept", "application/json, text/html;q=0.5")
            if (!cookies.isNullOrEmpty()) conn.setRequestProperty("Cookie", cookies)
            val status = conn.responseCode
            val body = if (status == 200) conn.inputStream.use { s -> s.readBytes().take(64 * 1024).toByteArray().toString(Charsets.UTF_8) } else null
            classify(status, body, conn.getHeaderField("Location"), conn.contentType, origin)
        } catch (e: IOException) {
            Answer(classify(e))
        } finally {
            conn.disconnect()
        }
    }
}
