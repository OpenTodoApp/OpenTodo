package app.opentodo

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The account key behind a fingerprint or face (native-shells D7): an AES-GCM Keystore key
 * that needs a strong biometric for every use and is invalidated when enrolment changes.
 * The raw account key exists only encrypted under it, in app-private storage.
 */
object BiometricKeyStore {
    private const val ALIAS = "opentodo-account-key"
    private const val TRANSFORM = "AES/GCM/NoPadding"

    fun available(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS

    private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    /** A fresh key (any earlier one is replaced) and a cipher to encrypt with after the prompt. */
    fun encryptCipher(): Cipher {
        val ks = keyStore()
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build(),
        )
        return Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, gen.generateKey()) }
    }

    /** A cipher to decrypt the stored key, or null when there is none or enrolment changed (then everything is forgotten). */
    fun decryptCipher(context: Context): Cipher? {
        val (iv, _) = Prefs(context).wrappedKey ?: return null
        val key = keyStore().getKey(ALIAS, null) as? SecretKey ?: run { forget(context); return null }
        return try {
            Cipher.getInstance(TRANSFORM).apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, b64(iv))) }
        } catch (e: KeyPermanentlyInvalidatedException) {
            forget(context)
            null
        }
    }

    fun save(context: Context, cipher: Cipher, raw: ByteArray) {
        val ct = cipher.doFinal(raw)
        Prefs(context).wrappedKey = s64(cipher.iv) to s64(ct)
    }

    fun open(context: Context, cipher: Cipher): ByteArray? {
        val (_, ct) = Prefs(context).wrappedKey ?: return null
        return try { cipher.doFinal(b64(ct)) } catch (e: Exception) { null }
    }

    fun forget(context: Context) {
        Prefs(context).wrappedKey = null
        try { keyStore().deleteEntry(ALIAS) } catch (e: Exception) { /* nothing stored */ }
    }

    private fun b64(s: String) = android.util.Base64.decode(s, android.util.Base64.NO_WRAP)
    private fun s64(b: ByteArray) = android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP)
}
