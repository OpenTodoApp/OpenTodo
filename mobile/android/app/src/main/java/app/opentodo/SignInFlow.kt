package app.opentodo

import java.net.URI

/**
 * Which main-frame navigations stay in the web view (OpenSpec change android-sign-in-flows).
 *
 * The server's own origin always stays. Another origin stays only inside a sign-in flow:
 * a flow starts when a navigation on the server's origin is answered with an HTTP redirect
 * to another origin (a login wall in front of the server, or the server's own single
 * sign-on start route), because the server itself never redirects away for anything else.
 * While the flow is active, redirects to any origin, pages of origins the flow already
 * visited (the identity provider's own forms and pages) and navigations no person started
 * (a provider's script or auto-submitted form) stay too; a link the person taps to a site
 * the flow has not visited opens in the system browser. The flow ends when a navigation
 * reaches the server's origin again or the person leaves it; [TIMEOUT_MS] after its last
 * navigation it stops leading anywhere new (only the origins it visited still stay).
 *
 * Pure Kotlin (no Android types) so the rule is unit tested on the JVM.
 */
class SignInFlow(private val server: String, private val clock: () -> Long = System::currentTimeMillis) {
    enum class Decision { STAY, BROWSER }

    /** The origin of the page the next navigation starts from (or the one being redirected). */
    private var current: String = server
    private var active = false
    private var lastAt = 0L
    private val visited = mutableSetOf<String>()

    /** True while a sign-in flow is running (a foreign page that belongs to it may be showing). */
    val inSignIn: Boolean get() { expire(); return active }

    /**
     * A main-frame navigation to [url]. [isRedirect]: an HTTP redirect of the navigation in
     * progress; [hasGesture]: the person started it (a tap on a link or a button).
     */
    fun decide(url: String, isRedirect: Boolean, hasGesture: Boolean): Decision {
        val to = originOf(url) ?: return Decision.BROWSER
        expire()
        if (to == server) {
            end()
            current = server
            return Decision.STAY
        }
        // After the timeout, a person still on the flow's pages can keep using them (a form sent
        // late), but nothing leads to a new origin any more.
        val withinVisited = current in visited && to in visited
        val stays = when {
            isRedirect -> current == server || active || withinVisited
            active -> !hasGesture || to in visited
            else -> withinVisited
        }
        if (!stays) return Decision.BROWSER
        if (active || current == server) {
            active = true
            lastAt = clock()
        }
        visited += to
        current = to
        return Decision.STAY
    }

    /** A page of [url] started loading in the main frame (also after back and loadUrl). */
    fun started(url: String) {
        val o = originOf(url) ?: return
        current = o
        if (o == server) end() else if (active) lastAt = clock()
    }

    /** The person left the flow (the bar's close button, back): the next foreign page needs a new flow. */
    fun end() {
        active = false
        visited.clear()
    }

    /** Past the timeout the flow is no longer active; its visited origins stay until it ends. */
    private fun expire() {
        if (active && clock() - lastAt > timeoutMs) active = false
    }

    companion object {
        /** A sign-in flow with no navigation for this long is over (typing a password and a code fits). */
        const val TIMEOUT_MS = 15 * 60 * 1000L

        /** [TIMEOUT_MS]; instrumented tests shorten it. */
        @Volatile var timeoutMs = TIMEOUT_MS

        /** The hidden background run never leaves the server: a login wall's redirect is simply not followed. */
        fun hiddenRunStays(url: String, server: String): Boolean = originOf(url) == server

        /** `scheme://host[:port]` like [Bridge.originOf], for http(s) only; null for anything else. */
        fun originOf(url: String): String? {
            val u = try { URI(url.trim()) } catch (e: Exception) { return null }
            val scheme = u.scheme?.lowercase() ?: return null
            if (scheme != "https" && scheme != "http") return null
            val host = u.host?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            val h = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
            val def = if (scheme == "https") 443 else 80
            return "$scheme://$h" + if (u.port == -1 || u.port == def) "" else ":${u.port}"
        }

        /** The host to show for [url] (no scheme, path or default port). */
        fun hostOf(url: String): String = originOf(url)?.substringAfter("://") ?: ""
    }
}
