package app.opentodokmp.connection

import java.net.HttpURLConnection
import java.net.IDN
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

actual suspend fun platformRequest(method: String, url: String, body: String?): PlatformResponse = withContext(Dispatchers.IO) {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = 10_000
        readTimeout = 10_000
        instanceFollowRedirects = false
        setRequestProperty("Accept", "application/json")
        if (body != null) {
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
    }
    try {
        if (body != null) connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        val response = (if (status in 200..299) connection.inputStream else connection.errorStream)
            ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        val fields = mutableMapOf<String, String>()
        listOf("status", "app_sign_in", "access_token", "refresh_token", "token_type", "expires_in").forEach { key ->
            Regex("\\\"$key\\\"\\s*:\\s*(?:\\\"([^\\\"]*)\\\"|(true|false|[0-9]+))")
                .find(response)?.let { fields[key] = it.groupValues[1].ifEmpty { it.groupValues[2] } }
        }
        Regex("\\\"error\\\"\\s*:\\s*\\{[^}]*\\\"code\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
            .find(response)?.let { fields["error.code"] = it.groupValues[1] }
        PlatformResponse(status, fields)
    } finally {
        connection.disconnect()
    }
}

actual fun platformSecureRead(key: String): String? = null
actual fun platformSecureWrite(key: String, value: String): Unit = error("Secure connection storage is only available in the Android and iOS apps.")
actual fun platformSecureDelete(key: String) = Unit
actual fun platformAsciiHost(host: String): String? = runCatching { IDN.toASCII(host) }.getOrNull()
actual fun platformDeviceName(): String = "Desktop"
actual fun platformOpenSignIn(url: String): Unit = error("System sign-in is only available in the Android and iOS apps.")

actual fun platformPkcePair(): PkcePair {
    fun token(size: Int): String = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(size).also(SecureRandom()::nextBytes))
    val verifier = token(64)
    val challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
        MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
    )
    return PkcePair(verifier, challenge, token(32))
}
