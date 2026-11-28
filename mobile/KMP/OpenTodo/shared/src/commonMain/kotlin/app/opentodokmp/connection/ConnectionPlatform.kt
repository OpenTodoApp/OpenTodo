package app.opentodokmp.connection

data class PlatformResponse(val status: Int, val fields: Map<String, String>)
data class PkcePair(val verifier: String, val challenge: String, val state: String)

expect suspend fun platformRequest(method: String, url: String, body: String? = null): PlatformResponse
expect fun platformSecureRead(key: String): String?
expect fun platformSecureWrite(key: String, value: String)
expect fun platformSecureDelete(key: String)
expect fun platformPkcePair(): PkcePair
expect fun platformAsciiHost(host: String): String?
expect fun platformDeviceName(): String
expect fun platformOpenSignIn(url: String)

