package app.opentodokmp.connection

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.IDN
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.lang.ref.WeakReference
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object AndroidConnectionHost {
    private var activityRef: WeakReference<Activity>? = null
    fun attach(activity: Activity) { activityRef = WeakReference(activity) }
    internal fun context(): Context? = activityRef?.get()?.applicationContext
    internal fun activity(): Activity? = activityRef?.get()
}

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
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val json = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }?.let { runCatching { JSONObject(it) }.getOrNull() }
        val fields = mutableMapOf<String, String>()
        if (json != null) {
            listOf("status", "app_sign_in", "access_token", "refresh_token", "token_type", "expires_in").forEach { key ->
                if (json.has(key)) fields[key] = json.opt(key).toString()
            }
            fields["error.code"] = json.optJSONObject("error")?.optString("code").orEmpty()
        }
        PlatformResponse(status, fields)
    } finally {
        connection.disconnect()
    }
}

actual fun platformSecureRead(key: String): String? = encryptedPreferences()?.getString(key, null)?.let { decrypt(it) }

actual fun platformSecureWrite(key: String, value: String) {
    val prefs = encryptedPreferences() ?: error("Secure storage is not ready.")
    check(prefs.edit().putString(key, encrypt(value)).commit()) { "Could not save secure connection data." }
}

actual fun platformSecureDelete(key: String) {
    encryptedPreferences()?.edit()?.remove(key)?.apply()
}

actual fun platformPkcePair(): PkcePair {
    fun token(size: Int): String = Base64.encodeToString(
        ByteArray(size).also(SecureRandom()::nextBytes), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
    )
    val verifier = token(64)
    val challenge = Base64.encodeToString(
        MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
        Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
    )
    return PkcePair(verifier, challenge, token(32))
}

actual fun platformAsciiHost(host: String): String? = try { IDN.toASCII(host, IDN.USE_STD3_ASCII_RULES) } catch (_: Exception) { null }
actual fun platformDeviceName(): String = "Android"

actual fun platformOpenSignIn(url: String) {
    val activity = AndroidConnectionHost.activity() ?: error("The app is not ready to open sign-in.")
    val view = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE)
    val browsers = activity.packageManager.queryIntentActivities(view, PackageManager.MATCH_ALL)
        .map { it.activityInfo.packageName }.distinct().filter { it != activity.packageName }
    val default = activity.packageManager.resolveActivity(view, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        ?.takeIf { it in browsers }
    val customTabs = browsers.filter { browser ->
        activity.packageManager.resolveService(Intent("android.support.customtabs.action.CustomTabsService").setPackage(browser), 0) != null
    }.toSet()
    val browser = when {
        default != null && default in customTabs -> default
        browsers.any { it in customTabs } -> browsers.first { it in customTabs }
        else -> default
    } ?: throw IllegalStateException("No browser is available to sign in.")
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        .addCategory(Intent.CATEGORY_BROWSABLE)
        .setPackage(browser)
        .putExtras(android.os.Bundle().apply { putBinder("android.support.customtabs.extra.SESSION", null) })
    try { activity.startActivity(intent) } catch (_: ActivityNotFoundException) {
        throw IllegalStateException("Could not open the browser for sign-in.")
    }
}

private fun encryptedPreferences() = AndroidConnectionHost.context()?.getSharedPreferences("shared_connection", Context.MODE_PRIVATE)

private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
}

private fun decrypt(value: String): String? = runCatching {
    val data = Base64.decode(value, Base64.NO_WRAP)
    require(data.size > 12)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, data.copyOfRange(0, 12)))
    cipher.doFinal(data.copyOfRange(12, data.size)).toString(Charsets.UTF_8)
}.getOrNull()

private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey("opentodo.shared.connection", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
        init(KeyGenParameterSpec.Builder("opentodo.shared.connection", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build())
        generateKey()
    }
}
