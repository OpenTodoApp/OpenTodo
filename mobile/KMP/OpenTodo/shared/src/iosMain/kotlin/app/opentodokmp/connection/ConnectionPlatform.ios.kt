package app.opentodokmp.connection

import kotlinx.cinterop.CFTypeRefVar
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.AuthenticationServices.ASWebAuthenticationPresentationContextProvidingProtocol
import platform.AuthenticationServices.ASWebAuthenticationSession
import platform.CoreFoundation.CFDictionary
import platform.Foundation.NSData
import platform.Foundation.NSHTTPURLResponse
import platform.Foundation.NSMutableURLRequest
import platform.Foundation.NSObject
import platform.Foundation.NSString
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.Foundation.NSURLSession
import platform.Foundation.NSURLSessionConfiguration
import platform.Foundation.NSURLSessionTask
import platform.Foundation.NSURLSessionTaskDelegateProtocol
import platform.Foundation.create
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.SecItemUpdate
import platform.Security.SecRandomCopyBytes
import platform.Security.errSecDuplicateItem
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData
import platform.Security.kSecRandomDefault
import platform.UIKit.ASPresentationAnchor
import platform.UIKit.UIApplication
import platform.UIKit.UIWindow
import platform.CommonCrypto.CC_SHA256
import platform.CommonCrypto.CC_SHA256_DIGEST_LENGTH
import platform.Foundation.NSJSONSerialization
import platform.Foundation.NSUTF8StringEncoding
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.cinterop.convert

private const val KEYCHAIN_SERVICE = "app.opentodokmp.connection"
private var authSession: ASWebAuthenticationSession? = null
private val presentationProvider = AuthPresentationProvider()
private val noRedirects = NoRedirects()
private val session: NSURLSession by lazy {
    NSURLSession.sessionWithConfiguration(NSURLSessionConfiguration.ephemeralSessionConfiguration(), noRedirects, null)
}

actual suspend fun platformRequest(method: String, url: String, body: String?): PlatformResponse = suspendCancellableCoroutine { continuation ->
    val requestUrl = NSURL.URLWithString(url) ?: run {
        continuation.resumeWithException(IllegalArgumentException("Invalid server address."))
        return@suspendCancellableCoroutine
    }
    val request = NSMutableURLRequest(requestUrl).apply {
        HTTPMethod = method
        timeoutInterval = 10.0
        setValue("application/json", forHTTPHeaderField = "Accept")
        if (body != null) {
            setValue("application/json", forHTTPHeaderField = "Content-Type")
            HTTPBody = body.encodeToByteArray().toNSData()
        }
    }
    val task = session.dataTaskWithRequest(request) { data, response, error ->
        if (error != null) {
            continuation.resumeWithException(IllegalStateException(error.localizedDescription))
        } else if (response !is NSHTTPURLResponse) {
            continuation.resumeWithException(IllegalStateException("The server returned an invalid response."))
        } else {
            continuation.resume(PlatformResponse(response.statusCode.toInt(), data?.jsonFields().orEmpty()))
        }
    }
    continuation.invokeOnCancellation { task.cancel() }
    task.resume()
}

actual fun platformSecureRead(key: String): String? = memScoped {
    val result = alloc<CFTypeRefVar>()
    val status = SecItemCopyMatching((keyQuery(key) + (platform.Security.kSecReturnData to true) +
        (platform.Security.kSecMatchLimit to kSecMatchLimitOne)) as CFDictionary, result.ptr)
    if (status != errSecSuccess) return null
    (result.value as? NSData)?.utf8String()
}

actual fun platformSecureWrite(key: String, value: String) {
    val query = keyQuery(key) as CFDictionary
    val data = value.encodeToByteArray().toNSData()
    val add = keyQuery(key) + (kSecValueData to data)
    val status = SecItemAdd(add as CFDictionary, null)
    if (status == errSecDuplicateItem) {
        SecItemUpdate(query, mapOf(kSecValueData to data) as CFDictionary)
    } else if (status != errSecSuccess) {
        error("Could not save secure connection data.")
    }
}

actual fun platformSecureDelete(key: String) {
    SecItemDelete(keyQuery(key) as CFDictionary)
}

actual fun platformPkcePair(): PkcePair {
    fun randomToken(size: Int): String {
        val bytes = ByteArray(size)
        val status = bytes.usePinned { SecRandomCopyBytes(kSecRandomDefault, size.convert(), it.addressOf(0)) }
        check(status == errSecSuccess) { "Could not create secure sign-in state." }
        return bytes.toNSData().base64EncodedStringWithOptions(0u)
            .replace('+', '-').replace('/', '_').trimEnd('=')
    }
    val verifier = randomToken(64)
    val input = verifier.encodeToByteArray()
    val digest = ByteArray(CC_SHA256_DIGEST_LENGTH.toInt())
    input.usePinned { inputPin ->
        digest.usePinned { digestPin -> CC_SHA256(inputPin.addressOf(0), input.size.convert(), digestPin.addressOf(0)) }
    }
    val challenge = digest.toNSData().base64EncodedStringWithOptions(0u)
        .replace('+', '-').replace('/', '_').trimEnd('=')
    return PkcePair(verifier, challenge, randomToken(32))
}

actual fun platformAsciiHost(host: String): String? = host
actual fun platformDeviceName(): String = "iOS"

actual fun platformOpenSignIn(url: String) {
    val startUrl = NSURL.URLWithString(url) ?: error("Invalid sign-in address.")
    val session = ASWebAuthenticationSession(startUrl, "opentodo") { callback, error ->
        authSession = null
        if (callback != null) ConnectionManager.handleAuthCallback(callback.absoluteString.orEmpty())
        else if (error != null) ConnectionManager.handleAuthCancelled()
    }
    session.presentationContextProvider = presentationProvider
    session.prefersEphemeralWebBrowserSession = false
    authSession = session
    if (!session.start()) {
        authSession = null
        error("Could not open system sign-in.")
    }
}

private fun keyQuery(key: String) = mapOf(
    kSecClass to kSecClassGenericPassword,
    kSecAttrService to KEYCHAIN_SERVICE,
    kSecAttrAccount to key,
)

private fun ByteArray.toNSData(): NSData = usePinned { NSData.create(it.addressOf(0), size.convert()) }

private fun NSData.utf8String(): String? = NSString.create(this, NSUTF8StringEncoding) as? String

private fun NSData.jsonFields(): Map<String, String> {
    val root = runCatching { NSJSONSerialization.JSONObjectWithData(this, 0u, null) as? Map<*, *> }.getOrNull() ?: return emptyMap()
    val fields = mutableMapOf<String, String>()
    listOf("status", "app_sign_in", "access_token", "refresh_token", "token_type", "expires_in").forEach { key ->
        root[key]?.let { fields[key] = it.toString() }
    }
    (root["error"] as? Map<*, *>)?.get("code")?.let { fields["error.code"] = it.toString() }
    return fields
}

private class NoRedirects : NSObject(), NSURLSessionTaskDelegateProtocol {
    override fun URLSession(
        session: NSURLSession,
        task: NSURLSessionTask,
        willPerformHTTPRedirection: NSHTTPURLResponse,
        newRequest: NSURLRequest,
        completionHandler: (NSURLRequest?) -> Unit,
    ) {
        completionHandler(null)
    }
}

private class AuthPresentationProvider : NSObject(), ASWebAuthenticationPresentationContextProvidingProtocol {
    override fun presentationAnchorForWebAuthenticationSession(session: ASWebAuthenticationSession): ASPresentationAnchor =
        UIApplication.sharedApplication.keyWindow ?: UIWindow()
}
