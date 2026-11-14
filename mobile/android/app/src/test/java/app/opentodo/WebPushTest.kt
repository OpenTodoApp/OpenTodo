package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * shell-push D3: the shell decrypts what the server encrypts. The fixture
 * `bridge/push-message.json` is written by the server's own `encrypt`
 * (`UPDATE_PUSH_FIXTURE=1 go test ./internal/push`); RFC 8291's example and a message made
 * by `push.Encrypt` with random keys are pinned here as well.
 */
class WebPushTest {
    private fun b64(text: String): ByteArray = WebPush.decode(text)!!

    private fun fixture(): JSONObject {
        val url = javaClass.classLoader!!.getResource("bridge/push-message.json")
        assertNotNull("missing bridge fixture push-message.json (UPDATE_PUSH_FIXTURE=1 go test ./internal/push)", url)
        return JSONObject(url!!.readText())
    }

    private fun bytes(vararg values: Int): ByteArray = ByteArray(values.size) { values[it].toByte() }

    private val hello = "hello".toByteArray()

    private fun text(bytes: ByteArray?): String? = bytes?.let { String(it, Charsets.UTF_8) }

    // ---- The sender's bytes ----

    @Test fun decryptsTheMessageTheServerEncrypted() {
        val f = fixture()
        val receiver = f.getJSONObject("receiver")
        val plain = WebPush.decrypt(b64(f.getString("body")), b64(receiver.getString("privateKey")), b64(receiver.getString("p256dh")), b64(receiver.getString("auth")))
        assertEquals(f.getString("plaintext"), text(plain))
        // The stored form of the keys decrypts the same.
        val keys = WebPush.Keys(receiver.getString("privateKey"), receiver.getString("p256dh"), receiver.getString("auth"))
        assertEquals(f.getString("plaintext"), text(WebPush.decrypt(b64(f.getString("body")), keys)))
        // And it is the reminder the shell shows.
        val message = UnifiedPush.message(plain!!, 0) as UnifiedPush.Message.Reminder
        assertTrue(message.reminder.id.isNotEmpty() && message.reminder.taskId.isNotEmpty())
        assertNotNull("the fixture's reminder has a title", message.reminder.title)
    }

    @Test fun theFixturesReceiverKeysBelongTogether() {
        val receiver = fixture().getJSONObject("receiver")
        val private = WebPush.privateKey(b64(receiver.getString("privateKey")))
        assertNotNull(private)
        assertNotNull(WebPush.publicKey(b64(receiver.getString("p256dh"))))
        assertEquals(16, b64(receiver.getString("auth")).size)
    }

    /** RFC 8291 section 5 and appendix A, from the fixture when it carries the example. */
    @Test fun decryptsTheRfcExampleOfTheFixture() {
        val f = fixture()
        if (!f.has("rfc8291")) return
        val r = f.getJSONObject("rfc8291")
        val plain = WebPush.decrypt(b64(r.getString("body")), b64(r.getString("receiverPrivateKey")), b64(r.getString("p256dh")), b64(r.getString("auth")))
        assertEquals(r.getString("plaintext"), text(plain))
    }

    /** RFC 8291 section 5, as printed in the RFC. */
    @Test fun decryptsTheRfcExample() {
        val plain = WebPush.decrypt(b64(RFC_BODY), b64(RFC_PRIVATE), b64(RFC_PUBLIC), b64(RFC_AUTH))
        assertEquals("When I grow up, I want to be a watermelon", text(plain))
    }

    /** Made by `push.Encrypt` of the server (a fresh sender key and salt) for a receiver made in Go. */
    @Test fun decryptsAMessageOfTheServersEncrypt() {
        assertEquals(GO_PLAINTEXT, text(WebPush.decrypt(b64(GO_BODY), b64(GO_PRIVATE), b64(GO_PUBLIC), b64(GO_AUTH))))
        assertEquals("", text(WebPush.decrypt(b64(GO_EMPTY_BODY), b64(GO_PRIVATE), b64(GO_PUBLIC), b64(GO_AUTH))))
        val message = UnifiedPush.message(WebPush.decrypt(b64(GO_BODY), b64(GO_PRIVATE), b64(GO_PUBLIC), b64(GO_AUTH))!!, 0)
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("rem-1", "task-1", 1_800_000_000_000L, "Water the plants — ☂")), message)
    }

    // ---- What is refused ----

    private val body = b64(GO_BODY)
    private val private = b64(GO_PRIVATE)
    private val public = b64(GO_PUBLIC)
    private val auth = b64(GO_AUTH)

    @Test fun aWrongKeyGivesNothing() {
        val other = WebPush.newKeys()!!
        assertNull(WebPush.decrypt(body, b64(other.privateKey), public, auth))
        assertNull(WebPush.decrypt(body, b64(other.privateKey), b64(other.p256dh), auth))
        assertNull(WebPush.decrypt(body, other))
        // The public key is part of the key derivation: another one does not decrypt either.
        assertNull(WebPush.decrypt(body, private, b64(other.p256dh), auth))
    }

    @Test fun aWrongSecretGivesNothing() {
        assertNull(WebPush.decrypt(body, private, public, ByteArray(16)))
        assertNull(WebPush.decrypt(body, private, public, auth.copyOf(15)))
        assertNull(WebPush.decrypt(body, private, public, auth + bytes(0)))
    }

    @Test fun aTruncatedBodyGivesNothing() {
        for (size in listOf(0, 1, 16, 20, 21, 85, 86, 87, 102, 103, body.size - 17, body.size - 1)) {
            assertNull("$size bytes", WebPush.decrypt(body.copyOf(size), private, public, auth))
        }
        assertNull(WebPush.decrypt(body + bytes(0), private, public, auth))
    }

    @Test fun aChangedByteGivesNothing() {
        for (at in listOf(0, 15, 21, 22, 60, 85, 86, body.size - 17, body.size - 1)) {
            val changed = body.copyOf().also { it[at] = (it[at].toInt() xor 1).toByte() }
            assertNull("byte $at", WebPush.decrypt(changed, private, public, auth))
        }
    }

    private fun withRecordSize(message: ByteArray, rs: Long): ByteArray = message.copyOf().also {
        it[16] = (rs shr 24).toByte(); it[17] = (rs shr 16).toByte(); it[18] = (rs shr 8).toByte(); it[19] = rs.toByte()
    }

    @Test fun anOversizedRecordGivesNothing() {
        // The record size is not part of what is authenticated: the same bytes decrypt with the server's size...
        assertEquals(GO_PLAINTEXT, text(WebPush.decrypt(withRecordSize(body, 4096), private, public, auth)))
        // ...and are refused with a larger one, with one smaller than the record, and with a senseless one.
        for (rs in listOf(4097L, 65_536L, 0x7fffffffL, 0x80000000L, 0xffffffffL, 0L, 17L, (body.size - 86 - 1).toLong())) {
            assertNull("rs $rs", WebPush.decrypt(withRecordSize(body, rs), private, public, auth))
        }
    }

    @Test fun aKeyIdThatIsNotAPublicKeyGivesNothing() {
        assertNull(WebPush.decrypt(body.copyOf().also { it[20] = 64 }, private, public, auth))
        assertNull(WebPush.decrypt(body.copyOf().also { it[20] = 0 }, private, public, auth))
        // Not an uncompressed point, and a point that is not on the curve.
        assertNull(WebPush.decrypt(body.copyOf().also { it[21] = 2 }, private, public, auth))
        assertNull(WebPush.decrypt(body.copyOf().also { for (i in 22 until 86) it[i] = 1 }, private, public, auth))
    }

    // ---- Records made here, to reach what the server never writes ----

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data)

    /** RFC 8291 encryption of one [record] (plaintext, delimiter and padding as given) for [keys]. */
    private fun seal(record: ByteArray, keys: WebPush.Keys, rs: Int = 4096): ByteArray {
        val sender = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val asPublic = WebPush.publicBytes(sender.public as ECPublicKey)
        val uaPublic = b64(keys.p256dh)
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val secret = KeyAgreement.getInstance("ECDH").apply { init(sender.private); doPhase(WebPush.publicKey(uaPublic)!!, true) }.generateSecret()
        val ikm = hmac(hmac(b64(keys.auth), secret), "WebPush: info\u0000".toByteArray() + uaPublic + asPublic + bytes(1))
        val prk = hmac(salt, ikm)
        val cek = hmac(prk, "Content-Encoding: aes128gcm\u0000".toByteArray() + bytes(1)).copyOf(16)
        val nonce = hmac(prk, "Content-Encoding: nonce\u0000".toByteArray() + bytes(1)).copyOf(12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, nonce)) }
        val header = salt + byteArrayOf((rs shr 24).toByte(), (rs shr 16).toByte(), (rs shr 8).toByte(), rs.toByte(), 65) + asPublic
        return header + cipher.doFinal(record)
    }

    @Test fun paddingIsStrippedAndBadPaddingGivesNothing() {
        val keys = WebPush.newKeys()!!
        assertEquals("hello", text(WebPush.decrypt(seal(hello + bytes(2), keys), keys)))
        assertEquals("hello", text(WebPush.decrypt(seal(hello + bytes(2) + ByteArray(40), keys), keys)))
        assertEquals("", text(WebPush.decrypt(seal(byteArrayOf(2), keys), keys)))
        // A zero inside the plaintext is content, not padding.
        assertArrayEquals(byteArrayOf(7, 0, 0, 7), WebPush.decrypt(seal(byteArrayOf(7, 0, 0, 7, 2, 0), keys), keys))
        // No delimiter, the delimiter of a record that is not the last (0x01), only padding, nothing.
        assertNull(WebPush.decrypt(seal(hello, keys), keys))
        assertNull(WebPush.decrypt(seal(hello + bytes(1), keys), keys))
        assertNull(WebPush.decrypt(seal(hello + bytes(1) + ByteArray(8), keys), keys))
        assertNull(WebPush.decrypt(seal(ByteArray(12), keys), keys))
        assertNull(WebPush.decrypt(seal(ByteArray(0), keys), keys))
    }

    @Test fun theLargestRecordDecryptsAndALargerOneDoesNot() {
        val keys = WebPush.newKeys()!!
        val largest = ByteArray(4096 - 17) { 'a'.code.toByte() }
        assertArrayEquals(largest, WebPush.decrypt(seal(largest + bytes(2), keys), keys))
        // One byte more is a record above the size the header names: a second record, never read.
        assertNull(WebPush.decrypt(seal(largest + bytes('a'.code, 2), keys), keys))
        assertNull(WebPush.decrypt(seal(largest + bytes('a'.code, 2), keys, rs = 4097), keys))
        // A smaller record size than the record is refused too.
        assertNull(WebPush.decrypt(seal(hello + bytes(2), keys, rs = 21), keys))
        assertEquals("hello", text(WebPush.decrypt(seal(hello + bytes(2), keys, rs = 22), keys)))
    }

    // ---- Keys ----

    @Test fun newKeysHaveTheSubscriptionsShapes() {
        val keys = WebPush.newKeys()!!
        val public = b64(keys.p256dh)
        assertEquals(65, public.size)
        assertEquals(4, public[0].toInt())
        assertEquals(87, keys.p256dh.length)
        assertEquals(32, b64(keys.privateKey).size)
        assertEquals(16, b64(keys.auth).size)
        assertEquals(22, keys.auth.length)
        for (s in listOf(keys.privateKey, keys.p256dh, keys.auth)) assertTrue(s, Regex("^[A-Za-z0-9_-]+$").matches(s))
        val again = WebPush.newKeys()!!
        assertNotEquals(keys.privateKey, again.privateKey)
        assertNotEquals(keys.auth, again.auth)
    }

    @Test fun keysSurviveStorage() {
        repeat(20) {
            val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
            val private = WebPush.privateBytes(pair.private as ECPrivateKey)
            val public = WebPush.publicBytes(pair.public as ECPublicKey)
            assertEquals(32, private.size)
            assertEquals(65, public.size)
            assertEquals((pair.private as ECPrivateKey).s, WebPush.privateKey(private)!!.s)
            assertEquals((pair.public as ECPublicKey).w, WebPush.publicKey(public)!!.w)
            assertArrayEquals(private, WebPush.privateBytes(WebPush.privateKey(private)!!))
            assertArrayEquals(public, WebPush.publicBytes(WebPush.publicKey(public)!!))
            assertArrayEquals(private, b64(WebPush.encode(private)))
        }
    }

    @Test fun keysThatAreNotKeysAreRefused() {
        assertNull(WebPush.privateKey(ByteArray(32)))
        assertNull(WebPush.privateKey(ByteArray(32) { 0xff.toByte() }))
        assertNull(WebPush.privateKey(ByteArray(31) { 1 }))
        assertNull(WebPush.privateKey(ByteArray(33) { 1 }))
        assertNull(WebPush.publicKey(ByteArray(65)))
        assertNull(WebPush.publicKey(byteArrayOf(4) + ByteArray(64) { 1 }))
        assertNull(WebPush.publicKey(public.copyOf(64)))
        assertNull(WebPush.publicKey(public.copyOf().also { it[0] = 3 }))
        assertNull(WebPush.publicKey(public.copyOf().also { it[64] = (it[64].toInt() xor 1).toByte() }))
        assertNotNull(WebPush.publicKey(public))
    }

    @Test fun base64urlWithoutPadding() {
        assertEquals("-_8", WebPush.encode(byteArrayOf(0xfb.toByte(), 0xff.toByte())))
        assertArrayEquals(byteArrayOf(0xfb.toByte(), 0xff.toByte()), WebPush.decode("-_8"))
        assertArrayEquals(byteArrayOf(0xfb.toByte(), 0xff.toByte()), WebPush.decode("-_8="))
        assertNull(WebPush.decode("+/8"))
        assertNull(WebPush.decode("not base64!"))
        assertNull(WebPush.decrypt(body, WebPush.Keys("not base64!", GO_PUBLIC, GO_AUTH)))
    }

    private companion object {
        const val RFC_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
        const val RFC_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
        const val RFC_AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
        const val RFC_BODY = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"

        const val GO_PRIVATE = "SJyogOj5zQgsV6uheXqPo7zU1dxEWMAmFS3D0Av7lBc"
        const val GO_PUBLIC = "BARJlBsdQ-P7N7vdnb891WmPbnWUtj-frkJ-hLqN52YRmHv_yylAcdoNFyl2o-9HFb7eOXZwxqUI6y6t9aTZmmE"
        const val GO_AUTH = "fHEktviKrgip5lbeq5W5Pg"
        const val GO_PLAINTEXT = "{\"type\":\"reminder\",\"reminderId\":\"rem-1\",\"taskId\":\"task-1\",\"fireAt\":1800000000000,\"title\":\"Water the plants — ☂\"}"
        const val GO_BODY = "FMkvbllWt1QpdeU1E6dhjQAAEABBBJ-gONrjr-3YAYSK5OJeL1wLSJxEhKDY1GddV8MMffvaswc1PnVqO32ecvsD32we2u-LId3bMS3yCCsDMQK2DZCY4rVwdu2y8FzrfHfns6qs2I496s0c7B6ttWJ_fnucu8pupRrLwxk2zoiKerM7xZcZ_Es1A8CJYMo9igE1J_tSs_g8n6FlTgI0w3CvRe9jFfEDSYNukq7v61pYiQl5KZYuFYpak6ojC0CX8eD0EHkjFvgOx9TEq4eyTEn_gyPnzUTBM010"
        const val GO_EMPTY_BODY = "jEldtJlChl0X2cvWXrsshwAAEABBBOq7doMQVnUAH9ZvLQWcy1NgFwFDKupjpV7pbuF27cQ0_TZdiy2x1PvLrn1aYPufxR6fRqhYdYHlQPf_RWDZJ2yjz1p5KlSGx-RqMJq87xnqCA"
    }
}
