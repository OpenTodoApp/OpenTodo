package app.opentodo

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECFieldFp
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPrivateKeySpec
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Web Push message encryption, the receiving side (shell-push D3): the `aes128gcm` content
 * coding of RFC 8291 over RFC 8188, as the server's `internal/push` writes it (one record of
 * at most 4096 bytes). Platform crypto only and no Android class, so the unit tests run it
 * on the JVM against the bytes the server's own encryption produced. Everything that is not
 * exactly such a message gives null; nothing is thrown and nothing is logged.
 */
object WebPush {
    /** The largest record accepted (RFC 8188 `rs`): the server's `RecordSize`. */
    const val MAX_RECORD = 4096
    private const val SALT = 16
    private const val POINT = 65
    private const val HEADER = SALT + 4 + 1 + POINT
    private const val TAG = 16
    private const val SCALAR = 32

    /** What a subscription is made of, base64url without padding. Only [p256dh] and [auth] leave the phone. */
    data class Keys(val privateKey: String, val p256dh: String, val auth: String)

    /**
     * The plaintext of [body], or null. [privateKey] is the receiver's raw 32-byte scalar,
     * [publicKey] its 65-byte uncompressed point (part of the key derivation), [auth] the
     * 16-byte secret.
     */
    fun decrypt(body: ByteArray, privateKey: ByteArray, publicKey: ByteArray, auth: ByteArray): ByteArray? = try {
        open(body, privateKey, publicKey, auth)
    } catch (e: Exception) {
        null
    }

    /** [decrypt] with the stored form of the keys. */
    fun decrypt(body: ByteArray, keys: Keys): ByteArray? {
        val private = decode(keys.privateKey) ?: return null
        val public = decode(keys.p256dh) ?: return null
        val auth = decode(keys.auth) ?: return null
        return decrypt(body, private, public, auth)
    }

    private fun open(body: ByteArray, privateKey: ByteArray, uaPublic: ByteArray, auth: ByteArray): ByteArray? {
        if (auth.size != SALT || uaPublic.size != POINT || privateKey.size != SCALAR) return null
        // Header: salt(16) | rs(4, big endian) | idlen(1) | keyid(the sender's public key, 65).
        if (body.size < HEADER + TAG + 1) return null
        val salt = body.copyOfRange(0, SALT)
        val rs = ((body[16].toLong() and 0xff) shl 24) or ((body[17].toLong() and 0xff) shl 16) or
            ((body[18].toLong() and 0xff) shl 8) or (body[19].toLong() and 0xff)
        if (rs < TAG + 2 || rs > MAX_RECORD) return null
        if ((body[20].toInt() and 0xff) != POINT) return null
        val asPublic = body.copyOfRange(SALT + 5, HEADER)
        // One record, the last: a longer body would be a second record, which the server never sends.
        val record = body.size - HEADER
        if (record > rs) return null

        val receiver = privateKey(privateKey) ?: return null
        // The key the derivation names must be the key that decrypts.
        publicKey(uaPublic) ?: return null
        val sender = publicKey(asPublic) ?: return null
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(receiver)
        agreement.doPhase(sender, true)
        val secret = agreement.generateSecret()

        // RFC 8291 section 3.4: IKM from the shared secret, the auth secret and both public keys.
        val prkKey = hmac(auth, secret)
        val ikm = hmac(prkKey, "WebPush: info\u0000".toByteArray(Charsets.US_ASCII) + uaPublic + asPublic + ONE)
        // RFC 8188 section 2.2 and 2.3: the content key and the nonce of the first record.
        val prk = hmac(salt, ikm)
        val cek = hmac(prk, "Content-Encoding: aes128gcm\u0000".toByteArray(Charsets.US_ASCII) + ONE).copyOf(16)
        val nonce = hmac(prk, "Content-Encoding: nonce\u0000".toByteArray(Charsets.US_ASCII) + ONE).copyOf(12)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(TAG * 8, nonce))
        val padded = cipher.doFinal(body, HEADER, record)
        // The last record ends with the delimiter 0x02, then only zero padding.
        var end = padded.size - 1
        while (end >= 0 && padded[end].toInt() == 0) end--
        if (end < 0 || padded[end].toInt() != 2) return null
        return padded.copyOf(end)
    }

    private val ONE = byteArrayOf(1)

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    // ---- Keys ----

    /** The P-256 parameters: by name, or from a generated key where the provider has no such lookup. */
    private val curve: ECParameterSpec by lazy {
        try {
            val params = AlgorithmParameters.getInstance("EC")
            params.init(ECGenParameterSpec("secp256r1"))
            params.getParameterSpec(ECParameterSpec::class.java)
        } catch (e: Exception) {
            (generate().public as ECPublicKey).params
        }
    }

    private fun generate() = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    /** A new key pair and secret for one registration, or null on a device whose provider cannot make them. */
    fun newKeys(random: SecureRandom = SecureRandom()): Keys? = try {
        val pair = generate()
        val auth = ByteArray(SALT).also { random.nextBytes(it) }
        Keys(encode(privateBytes(pair.private as ECPrivateKey)), encode(publicBytes(pair.public as ECPublicKey)), encode(auth))
    } catch (e: Exception) {
        null
    }

    /** The 65-byte uncompressed point: 0x04, X, Y. */
    fun publicBytes(key: ECPublicKey): ByteArray =
        byteArrayOf(4) + fixed(key.w.affineX, SCALAR) + fixed(key.w.affineY, SCALAR)

    /** The key of a 65-byte uncompressed point on the curve, or null. */
    fun publicKey(bytes: ByteArray): ECPublicKey? = try {
        if (bytes.size != POINT || bytes[0].toInt() != 4) null else {
            val x = BigInteger(1, bytes.copyOfRange(1, 1 + SCALAR))
            val y = BigInteger(1, bytes.copyOfRange(1 + SCALAR, POINT))
            if (!onCurve(x, y)) null
            else KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), curve)) as ECPublicKey
        }
    } catch (e: Exception) {
        null
    }

    /** The raw 32-byte scalar, as stored. */
    fun privateBytes(key: ECPrivateKey): ByteArray = fixed(key.s, SCALAR)

    /** The key of a raw 32-byte scalar in the curve's range, or null. */
    fun privateKey(bytes: ByteArray): ECPrivateKey? = try {
        val s = BigInteger(1, bytes)
        if (bytes.size != SCALAR || s.signum() <= 0 || s >= curve.order) null
        else KeyFactory.getInstance("EC").generatePrivate(ECPrivateKeySpec(s, curve)) as ECPrivateKey
    } catch (e: Exception) {
        null
    }

    /** y² = x³ + ax + b (mod p), both coordinates in the field. */
    private fun onCurve(x: BigInteger, y: BigInteger): Boolean {
        val p = (curve.curve.field as ECFieldFp).p
        if (x >= p || y >= p) return false
        val right = x.pow(3).add(curve.curve.a.multiply(x)).add(curve.curve.b).mod(p)
        return y.multiply(y).mod(p) == right
    }

    /** Big endian, exactly [size] bytes. */
    private fun fixed(n: BigInteger, size: Int): ByteArray {
        val raw = n.toByteArray()
        val out = ByteArray(size)
        val from = maxOf(0, raw.size - size)
        raw.copyInto(out, size - (raw.size - from), from, raw.size)
        return out
    }

    /** Base64url without padding. */
    fun encode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    /** The bytes of a base64url string (padding allowed), or null. */
    fun decode(text: String): ByteArray? = try {
        Base64.getUrlDecoder().decode(text)
    } catch (e: IllegalArgumentException) {
        null
    }
}
