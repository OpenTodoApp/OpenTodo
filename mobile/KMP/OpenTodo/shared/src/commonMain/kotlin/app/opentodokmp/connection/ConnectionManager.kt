package app.opentodokmp.connection

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

data class ServerAddress(val baseUrl: String) {
    companion object {
        fun parse(input: String): ServerAddress {
            var text = input.trim()
            require(text.isNotEmpty() && text.none(Char::isWhitespace)) { "Enter a valid server address." }
            if ("://" !in text) text = "https://$text"
            val schemeEnd = text.indexOf("://")
            val scheme = text.substring(0, schemeEnd).lowercase()
            require(scheme == "https" || scheme == "http") { "Enter a server address starting with https:// or http://." }
            val rest = text.substring(schemeEnd + 3)
            require('?' !in rest && '#' !in rest) { "Enter only the server address, without a query or fragment." }
            val slash = rest.indexOf('/')
            val authority = if (slash < 0) rest else rest.substring(0, slash)
            val path = if (slash < 0) "" else rest.substring(slash)
            require(path.isEmpty() || path == "/") { "Enter the server address without a path." }
            require('@' !in authority && authority.isNotEmpty()) { "Enter a valid server address." }

            val host: String
            val portText: String?
            if (authority.startsWith('[')) {
                val closing = authority.indexOf(']')
                require(closing > 1) { "Enter a valid server address." }
                host = authority.substring(1, closing)
                val suffix = authority.substring(closing + 1)
                require(suffix.isEmpty() || suffix.startsWith(':')) { "Enter a valid server address." }
                portText = suffix.takeIf { it.isNotEmpty() }?.drop(1)
            } else {
                require(authority.count { it == ':' } <= 1) { "Put IPv6 addresses in brackets." }
                val colon = authority.lastIndexOf(':')
                host = if (colon < 0) authority else authority.substring(0, colon)
                portText = if (colon < 0) null else authority.substring(colon + 1)
            }
            val port = portText?.toIntOrNull()
            require(portText == null || (port != null && port in 1..65535)) { "The server port must be between 1 and 65535." }
            val asciiHost = platformAsciiHost(host)?.lowercase()?.removeSuffix(".")
                ?.takeIf { it.isNotBlank() } ?: throw IllegalArgumentException("Enter a valid server address.")
            require(scheme == "https" || isLocal(asciiHost)) {
                "Public servers must use HTTPS. Try https://$asciiHost${if (port == null || port == 80) "" else ":$port"}."
            }
            val isIpv6 = ':' in asciiHost
            val hostPart = if (isIpv6) "[$asciiHost]" else asciiHost
            val defaultPort = if (scheme == "https") 443 else 80
            return ServerAddress("$scheme://$hostPart${if (port == null || port == defaultPort) "" else ":$port"}")
        }

        private fun isLocal(host: String): Boolean {
            if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".lan")) return true
            val octets = host.split('.')
            if (octets.size == 4 && octets.all { part -> part.toIntOrNull()?.let { it in 0..255 } == true }) {
                val (first, second) = octets[0].toInt() to octets[1].toInt()
                return first == 127 || first == 10 || (first == 172 && second in 16..31) ||
                    (first == 192 && second == 168) || (first == 169 && second == 254) ||
                    (first == 100 && second in 64..127)
            }
            return host == "::1" || host.startsWith("fc") || host.startsWith("fd") ||
                host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")
        }
    }
}

sealed interface ConnectionState {
    data object Start : ConnectionState
    data class Checking(val server: String) : ConnectionState
    data class SigningIn(val server: String) : ConnectionState
    data class Exchanging(val server: String) : ConnectionState
    data class Connected(val server: String) : ConnectionState
    data class Error(val message: String) : ConnectionState
}

object ConnectionManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    var state by mutableStateOf<ConnectionState>(ConnectionState.Start)
        private set

    fun restore() {
        val server = platformSecureRead(SERVER_KEY)
        if (server != null && platformSecureRead(ACCESS_KEY) != null && platformSecureRead(REFRESH_KEY) != null) {
            state = ConnectionState.Connected(server)
        }
    }

    fun connect(input: String) {
        val server = try {
            ServerAddress.parse(input)
        } catch (e: IllegalArgumentException) {
            state = ConnectionState.Error(e.message ?: "Enter a valid server address.")
            return
        }
        state = ConnectionState.Checking(server.baseUrl)
        scope.launch {
            try {
                val first = runCatching { platformRequest("GET", "${server.baseUrl}/api/v1/health") }.getOrNull()
                val health = if (first?.let { it.status in 200..299 && it.fields["status"] == "ok" } == true) first
                else platformRequest("GET", "${server.baseUrl}/healthz")
                if (health.status !in 200..299 || health.fields["status"] != "ok") {
                    throw IllegalStateException("This server is unavailable or unhealthy.")
                }
                if (health.fields["app_sign_in"] != "true") {
                    throw IllegalStateException("This server does not support official app sign-in. Update the server and try again.")
                }
                val pkce = platformPkcePair()
                savePending(server.baseUrl, pkce)
                val url = "${server.baseUrl}/app/sign-in?code_challenge=${pkce.challenge}" +
                    "&code_challenge_method=S256&state=${pkce.state}&device=${platformDeviceName()}"
                state = ConnectionState.SigningIn(server.baseUrl)
                platformOpenSignIn(url)
            } catch (e: Exception) {
                clearPending()
                state = ConnectionState.Error(e.message ?: "Could not reach this server. Check the address and try again.")
            }
        }
    }

    fun handleAuthCallback(callback: String) {
        if (!callback.startsWith("opentodo://signed-in?")) return
        val params = parseCallback(callback.substringAfter('?')) ?: return
        scope.launch {
            val pending = platformSecureRead(PENDING_SERVER) ?: return@launch
            val expectedState = platformSecureRead(PENDING_STATE) ?: return@launch
            if (!constantTimeEquals(params["state"].orEmpty(), expectedState)) return@launch
            val verifier = platformSecureRead(PENDING_VERIFIER)
            clearPending()
            if (params["error"] != null) {
                state = ConnectionState.Error("Sign-in was cancelled.")
                return@launch
            }
            val code = params["code"] ?: run {
                state = ConnectionState.Error("The server did not complete sign-in. Please try again.")
                return@launch
            }
            state = ConnectionState.Exchanging(pending)
            try {
                val checkedVerifier = verifier ?: error("Sign-in could not be verified. Please try again.")
                val body = "{\"grant_type\":\"authorization_code\",\"code\":\"$code\",\"code_verifier\":\"$checkedVerifier\",\"state\":\"$expectedState\"}"
                val response = platformRequest("POST", "$pending/api/v1/app/token", body)
                if (response.status !in 200..299) {
                    throw IllegalStateException(when (response.fields["error.code"]) {
                        "invalid_grant" -> "The sign-in link expired. Please try again."
                        "demo_restricted" -> "This server's demo does not allow app sign-in. Use a self-hosted server."
                        else -> "The server could not complete sign-in (HTTP ${response.status})."
                    })
                }
                val access = response.fields["access_token"].orEmpty()
                val refresh = response.fields["refresh_token"].orEmpty()
                require(access.isNotBlank() && refresh.isNotBlank() && response.fields["token_type"] == "Bearer") {
                    "The server returned an invalid sign-in response."
                }
                platformSecureWrite(SERVER_KEY, pending)
                platformSecureWrite(ACCESS_KEY, access)
                platformSecureWrite(REFRESH_KEY, refresh)
                platformSecureWrite(EXPIRES_KEY, response.fields["expires_in"] ?: "3600")
                state = ConnectionState.Connected(pending)
            } catch (e: Exception) {
                state = ConnectionState.Error(e.message ?: "Could not finish sign-in. Please try again.")
            }
        }
    }

    fun handleAuthCancelled() {
        clearPending()
        state = ConnectionState.Error("Sign-in was cancelled.")
    }

    private fun savePending(server: String, pkce: PkcePair) {
        platformSecureWrite(PENDING_SERVER, server)
        platformSecureWrite(PENDING_STATE, pkce.state)
        platformSecureWrite(PENDING_VERIFIER, pkce.verifier)
        platformSecureWrite(PENDING_CHALLENGE, pkce.challenge)
    }

    private fun clearPending() {
        listOf(PENDING_SERVER, PENDING_STATE, PENDING_VERIFIER, PENDING_CHALLENGE).forEach { platformSecureDelete(it) }
    }

    private fun parseCallback(query: String): Map<String, String>? {
        val pairs = query.split('&').map { part ->
            val split = part.indexOf('=')
            if (split <= 0) return null
            part.substring(0, split) to part.substring(split + 1)
        }
        if (pairs.map { it.first }.toSet().size != pairs.size) return null
        val values = pairs.toMap()
        if (values.keys.any { it !in setOf("state", "code", "error") }) return null
        if ("state" !in values || ("code" in values) == ("error" in values)) return null
        if (values.values.any { value -> value.isEmpty() || value.any { it !in TOKEN_CHARS } }) return null
        return values
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var mismatch = 0
        for (index in a.indices) mismatch = mismatch or (a[index].code xor b[index].code)
        return mismatch == 0
    }

    private const val SERVER_KEY = "connection.server"
    private const val ACCESS_KEY = "connection.access"
    private const val REFRESH_KEY = "connection.refresh"
    private const val EXPIRES_KEY = "connection.expires"
    private const val PENDING_SERVER = "connection.pending.server"
    private const val PENDING_STATE = "connection.pending.state"
    private const val PENDING_VERIFIER = "connection.pending.verifier"
    private const val PENDING_CHALLENGE = "connection.pending.challenge"
    private const val TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
}
