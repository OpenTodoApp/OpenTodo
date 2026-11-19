package app.opentodo

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * OpenTodo's own single sign-on in the system browser (app-sso-system-browser). Providers such
 * as Google refuse sign-in in an app's web view, so the start route opens in a Custom Tab with
 * the app's own PKCE pair; the server sends back a single-use code on `opentodo://sso`, which the
 * web view redeems with the verifier from a page of the server, where the session cookie
 * belongs. A server that does not announce `app_sso` in its health answer keeps the old way: the
 * provider's pages in the web view. No Android types, so the rules are unit tested on the JVM.
 */
object SystemSignIn {
    const val START_PATH = "/api/v1/auth/oidc/start"
    const val REDEEM_PATH = "/api/v1/auth/oidc/app-session"
    const val CALLBACK_SCHEME = "opentodo"
    const val CALLBACK_HOST = "sso"

    /** What the app keeps while the browser is open. */
    data class Pending(val verifier: String, val challenge: String, val state: String)

    /** The answer the browser brought back. */
    sealed class Outcome {
        data class Code(val code: String) : Outcome()
        data class Error(val code: String) : Outcome()
        object Invalid : Outcome()
    }

    private val random = SecureRandom()

    /** A navigation of the web view to the server's start route, not yet an app flow. */
    fun isStart(url: String, server: String): Boolean {
        if (SignInFlow.originOf(url) != server) return false
        val uri = try { URI(url) } catch (e: Exception) { return false }
        return uri.path == START_PATH && params(uri.rawQuery)["app_challenge"] == null
    }

    /** A fresh verifier, its S256 challenge and a state. */
    fun pending(): Pending {
        val verifier = token()
        return Pending(verifier, challenge(verifier), token())
    }

    fun challenge(verifier: String): String =
        b64(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

    /** The start route with the app's challenge and state, opened in the browser. */
    fun startUrl(server: String, p: Pending): String = "$server$START_PATH?app_challenge=${p.challenge}&app_state=${p.state}"

    /**
     * Reads `opentodo://sso?state=…&code=…` (or `&error=…`); anything else, or another state,
     * is invalid. Codes and error codes are plain tokens, so they go into the page's script and
     * address as they are.
     */
    fun outcome(url: String, state: String): Outcome {
        val uri = try { URI(url) } catch (e: Exception) { return Outcome.Invalid }
        if (!uri.scheme.equals(CALLBACK_SCHEME, true) || !uri.host.equals(CALLBACK_HOST, true)) return Outcome.Invalid
        val q = params(uri.rawQuery)
        if (q["state"] != state) return Outcome.Invalid
        q["code"]?.let { if (isToken(it)) return Outcome.Code(it) }
        q["error"]?.let { if (isToken(it)) return Outcome.Error(it) }
        return Outcome.Invalid
    }

    /**
     * The script the web view runs on a page of the server: redeem the code, then go where the
     * server's answer leads (the app, or the sign-in screen with an error code).
     */
    fun redeemScript(code: String, verifier: String): String = """
        (async () => {
          try {
            const r = await fetch('$REDEEM_PATH', { method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: '$code', code_verifier: '$verifier' }) });
            if (r.redirected) { location.replace(r.url); return; }
            let e = 'oidc_failed';
            try { e = (await r.json()).error.code || e; } catch (_) {}
            location.replace('/?error=' + encodeURIComponent(e));
          } catch (_) { location.replace('/?error=oidc_failed'); }
        })();
    """.trimIndent()

    /** The sign-in screen showing an error code the browser brought back. */
    fun errorUrl(server: String, code: String): String = "$server/?error=" + URLEncoder.encode(code, "UTF-8")

    /** Whether a health answer announces app flows. */
    fun supported(healthBody: String?): Boolean =
        try { JSONObject(healthBody ?: "").optBoolean("app_sso", false) } catch (e: Exception) { false }

    /** Asks the server (on a background thread) whether it announces app flows. */
    fun askServer(server: String): Boolean = try {
        val conn = URL("$server/api/v1/health").openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.useCaches = false
        try { conn.responseCode == 200 && supported(conn.inputStream.bufferedReader().readText()) } finally { conn.disconnect() }
    } catch (e: Exception) { false }

    fun isToken(s: String): Boolean =
        s.isNotEmpty() && s.length <= 512 && s.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' }

    private fun params(raw: String?): Map<String, String> =
        raw.orEmpty().split('&').filter { it.isNotEmpty() }.associate {
            val (k, v) = it.split('=', limit = 2).let { p -> p[0] to p.getOrElse(1) { "" } }
            java.net.URLDecoder.decode(k, "UTF-8") to java.net.URLDecoder.decode(v, "UTF-8")
        }

    private fun token(): String = ByteArray(32).also(random::nextBytes).let(::b64)

    private fun b64(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
}
