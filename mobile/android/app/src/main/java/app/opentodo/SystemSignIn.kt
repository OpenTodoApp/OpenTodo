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
        /** This sign-in's state with neither a code nor an error: the person tapped Cancel. */
        object Cancelled : Outcome()
        object Invalid : Outcome()
    }

    /** What the app does when the browser comes back with an [Outcome]. */
    sealed class Finish {
        /** Run the redeem script on the server's page showing now. */
        data class Redeem(val code: String) : Finish()
        /** Load the server first, then run the redeem script there (no page of the server shows). */
        data class RedeemAfterLoad(val code: String) : Finish()
        /** The sign-in screen with this error code. */
        data class ShowError(val code: String) : Finish()
        /** The screen stays as it was. */
        object Stay : Finish()
    }

    private val random = SecureRandom()

    /**
     * Where the start route opens: the browser when the server's health answer (its status
     * and body) announces app flows and a browser can take the sign-in; the web view otherwise,
     * as before app flows.
     */
    fun opensBrowser(healthStatus: Int?, healthBody: String?, browser: String?): Boolean =
        healthStatus == 200 && supported(healthBody) && browser != null

    /**
     * The step after the browser came back: a code is redeemed only from a page of the server
     * ([onServer], or after loading one), an error code shows on the sign-in screen, and Cancel or
     * an answer to another sign-in changes nothing.
     */
    fun finish(outcome: Outcome, onServer: Boolean): Finish = when (outcome) {
        is Outcome.Code -> if (onServer) Finish.Redeem(outcome.code) else Finish.RedeemAfterLoad(outcome.code)
        is Outcome.Error -> Finish.ShowError(outcome.code)
        Outcome.Cancelled, Outcome.Invalid -> Finish.Stay
    }

    /** Whether the [Outcome] ends the pending sign-in: only an answer with its state does. */
    fun ends(outcome: Outcome): Boolean = outcome != Outcome.Invalid

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

    /**
     * Whether the web app asked to link an identity to its signed-in account (Settings, a
     * re-authentication: `mode=link` on the start route) rather than to sign in.
     */
    fun isLink(url: String): Boolean = try { params(URI(url).rawQuery)["mode"] == "link" } catch (e: Exception) { false }

    /** The start route with the app's challenge, state and mode, opened in the browser. */
    fun startUrl(server: String, p: Pending, link: Boolean = false): String =
        "$server$START_PATH?app_challenge=${p.challenge}&app_state=${p.state}&app_mode=${if (link) "link" else "login"}"

    /** The service a browser offers when it supports Custom Tabs. */
    const val CUSTOM_TABS_SERVICE = "android.support.customtabs.action.CustomTabsService"

    /**
     * The browser the sign-in opens in, by package name, so no other app that handles https
     * links can take the start address with this sign-in's state and challenge. The default
     * browser when it supports Custom Tabs, else the first browser that does (the rule of
     * CustomTabsClient.getPackageName), else the default browser as it is. Null when there is no
     * default browser either: never the chooser. [browsers] keeps the system's order.
     */
    fun browserFor(defaultBrowser: String?, browsers: List<String>, customTabs: Set<String>): String? = when {
        defaultBrowser != null && defaultBrowser in customTabs -> defaultBrowser
        browsers.any { it in customTabs } -> browsers.first { it in customTabs }
        else -> defaultBrowser
    }

    /**
     * Reads `opentodo://sso?state=…&code=…` (or `&error=…`, or the state alone after Cancel);
     * anything else, or another state, is invalid. Codes and error codes are plain tokens, so they go into the page's script and
     * address as they are.
     */
    fun outcome(url: String, state: String): Outcome {
        val uri = try { URI(url) } catch (e: Exception) { return Outcome.Invalid }
        if (!uri.scheme.equals(CALLBACK_SCHEME, true) || !uri.host.equals(CALLBACK_HOST, true)) return Outcome.Invalid
        // Any app can send this address: an escape that does not decode is refused, never thrown.
        val (names, q) = try {
            uri.rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.map { java.net.URLDecoder.decode(it.substringBefore('='), "UTF-8") } to params(uri.rawQuery)
        } catch (e: IllegalArgumentException) {
            return Outcome.Invalid
        }
        // A key named twice (after decoding) would leave the choice of value to the parser: never accepted.
        if (listOf("state", "code", "error").any { k -> names.count { it == k } > 1 }) return Outcome.Invalid
        if (q["state"] != state) return Outcome.Invalid
        q["code"]?.let { if (isToken(it)) return Outcome.Code(it) }
        q["error"]?.let { if (isToken(it)) return Outcome.Error(it) }
        if (!q.containsKey("code") && !q.containsKey("error")) return Outcome.Cancelled
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

    /** The server's health answer (on a background thread): its status and body, or nulls when there is none. */
    fun askServer(server: String): Pair<Int?, String?> = try {
        val conn = URL("$server/api/v1/health").openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 10_000
        conn.useCaches = false
        try {
            val status = conn.responseCode
            status to (if (status == 200) conn.inputStream.bufferedReader().readText() else null)
        } finally { conn.disconnect() }
    } catch (e: Exception) { null to null }

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
