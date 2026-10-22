package app.opentodo

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assume.assumeFalse
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Task 4.7: the biometric store (native-shells D7). The CI emulator has no enrolled
 * fingerprint, so these tests cover what holds without one (no capability, nothing stored,
 * everything forgotten); the prompt itself needs an enrolled finger and is skipped there.
 */
@RunWith(AndroidJUnit4::class)
class BiometricTest {
    @Before fun setUp() = resetApp()
    @After fun tearDown() = resetApp()

    @Test fun withoutAnEnrolledFingerTheCapabilityIsAbsent() {
        assumeFalse("an enrolled strong biometric on this device", BiometricKeyStore.available(context))
        assertFalse(Bridge(context, "https://todo.example.com", null).capabilities().contains("biometric"))
    }

    @Test fun storingWithoutAnEnrolledFingerAnswersFalseAndKeepsNothing() {
        assumeFalse("an enrolled strong biometric on this device", BiometricKeyStore.available(context))
        val server = FakeServer()
        try {
            Prefs(context).server = server.origin
            val scenario = ActivityScenario.launch(MainActivity::class.java)
            val done = CountDownLatch(1)
            var answer: Boolean? = null
            // A Keystore key that needs a biometric cannot be made without one: false, and nothing written.
            scenario.onActivity { it.biometricStore(ByteArray(32) { 7 }) { ok -> answer = ok; done.countDown() } }
            assert(done.await(10, TimeUnit.SECONDS))
            assertEquals(false, answer)
            assertNull(Prefs(context).wrappedKey)
            val read = CountDownLatch(1)
            var key: ByteArray? = byteArrayOf(1)
            scenario.onActivity { it.biometricRead { k -> key = k; read.countDown() } }
            assert(read.await(10, TimeUnit.SECONDS))
            assertNull(key)
        } finally {
            server.shutdown()
        }
    }

    @Test fun forgetRemovesTheWrappedKey() {
        Prefs(context).wrappedKey = "aXY=" to "Y3Q="
        BiometricKeyStore.forget(context)
        assertNull(Prefs(context).wrappedKey)
        assertNull(BiometricKeyStore.decryptCipher(context))
    }

    @Test fun aWrappedKeyWithoutItsKeystoreKeyIsForgotten() {
        // As after an enrolment change removed the Keystore key: the stored copy goes too.
        BiometricKeyStore.forget(context)
        Prefs(context).wrappedKey = "AAAAAAAAAAAAAAAA" to "Y3Q="
        assertNull(BiometricKeyStore.decryptCipher(context))
        assertNull(Prefs(context).wrappedKey)
    }

    @Test fun enrolledDevicesOfferTheCapability() {
        assumeTrue("needs an enrolled strong biometric (not on the CI emulator)", BiometricKeyStore.available(context))
        val caps = Bridge(context, "https://todo.example.com", object : Bridge.Host {
            override fun requestNotificationPermission(done: (Boolean) -> Unit) = done(false)
            override fun requestExactAlarms() {}
            override fun biometricStore(key: ByteArray, done: (Boolean) -> Unit) = done(false)
            override fun biometricRead(done: (ByteArray?) -> Unit) = done(null)
            override fun openExternal(url: String) {}
        }).capabilities()
        assert(caps.contains("biometric"))
    }
}
