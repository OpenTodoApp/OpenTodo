package app.opentodo

import java.net.IDN
import java.net.URI

/**
 * The address rules of the first-run screen (native-shells, "Secure addresses only"):
 * https anywhere; plain http only for this device, the local network and `.local` names,
 * accepted with a warning. Pure JVM so the rules are unit-tested.
 */
object ServerAddress {
    sealed class Result {
        /** A usable origin such as `https://todo.example.com` or `http://192.168.1.4:8080`. */
        data class Ok(val origin: String, val insecure: Boolean) : Result()
        /** Plain http to a public name: refused, with the https address to offer instead. */
        data class NeedsHttps(val suggestion: String) : Result()
        object Invalid : Result()
    }

    fun parse(input: String): Result {
        var text = input.trim()
        if (text.isEmpty() || text.any { it.isWhitespace() }) return Result.Invalid
        if (!text.contains("://")) text = "https://$text"
        text = asciiHost(text) ?: return Result.Invalid
        val uri = try { URI(text) } catch (e: Exception) { return Result.Invalid }
        val scheme = uri.scheme?.lowercase() ?: return Result.Invalid
        val host = uri.host?.lowercase()?.removeSuffix(".") ?: return Result.Invalid
        if (scheme != "https" && scheme != "http") return Result.Invalid
        if (uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null) return Result.Invalid
        val path = uri.rawPath ?: ""
        if (path.isNotEmpty() && path != "/") return Result.Invalid
        val port = uri.port
        if (port != -1 && port !in 1..65535) return Result.Invalid
        val defaultPort = if (scheme == "https") 443 else 80
        val hostPart = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
        val origin = "$scheme://$hostPart" + if (port == -1 || port == defaultPort) "" else ":$port"
        if (scheme == "https") return Result.Ok(origin, insecure = false)
        if (isLocal(host)) return Result.Ok(origin, insecure = true)
        val httpsPort = if (port == -1 || port == 80) "" else ":$port"
        return Result.NeedsHttps("https://$hostPart$httpsPort")
    }

    /**
     * The address with a host typed in Unicode (`bücher.example`) in the ASCII form the network
     * uses (`xn--bcher-kva.example`), which `URI` cannot read otherwise; `null` when the host cannot
     * be encoded. Anything else is left for `URI` to judge. Mirrors `ServerAddress.asciiHost` on iOS.
     */
    fun asciiHost(text: String): String? {
        val schemeEnd = text.indexOf("://").takeIf { it >= 0 }?.plus(3) ?: return text
        val rest = text.substring(schemeEnd)
        val end = rest.indexOfFirst { it in "/?#" }.takeIf { it >= 0 } ?: rest.length
        val authority = rest.substring(0, end)
        if (authority.all { it.code < 128 } || '@' in authority || '[' in authority) return text
        val colon = authority.lastIndexOf(':')
        val host = if (colon >= 0) authority.substring(0, colon) else authority
        val port = if (colon >= 0) authority.substring(colon) else ""
        val ascii = try { IDN.toASCII(host) } catch (e: IllegalArgumentException) { return null }
        return text.substring(0, schemeEnd) + ascii + port + rest.substring(end)
    }

    /** This device, private IPv4 ranges, IPv6 loopback, unique-local and link-local, and `.local` names. */
    fun isLocal(rawHost: String): Boolean {
        val host = rawHost.lowercase().removePrefix("[").removeSuffix("]")
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true
        val v4 = host.split('.')
        if (v4.size == 4 && v4.all { p -> p.isNotEmpty() && p.length <= 3 && p.all { it.isDigit() } && p.toInt() <= 255 }) {
            val (a, b) = v4[0].toInt() to v4[1].toInt()
            return a == 127 || a == 10 || (a == 172 && b in 16..31) || (a == 192 && b == 168) || (a == 169 && b == 254)
        }
        if (host.contains(':')) {
            return host == "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") ||
                host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")
        }
        return false
    }
}
