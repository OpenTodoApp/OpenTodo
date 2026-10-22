package app.opentodo

import android.app.Activity
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.closeSoftKeyboard
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.net.ServerSocket

/** Task 4.2: the first-run screen against a real local server (native-shells "First run"). */
@RunWith(AndroidJUnit4::class)
class SetupActivityTest {
    private val servers = mutableListOf<FakeServer>()

    @Before fun setUp() = resetApp()

    @After fun tearDown() {
        servers.forEach { it.shutdown() }
        resetApp()
    }

    private fun type(address: String) {
        onView(withId(R.id.address)).perform(replaceText(address), closeSoftKeyboard())
        onView(withId(R.id.connect)).perform(click())
    }

    private fun waitForMessage(res: Int) {
        val text = context.getString(res)
        waitUntil("the message \"$text\"") {
            try { onView(withId(R.id.message)).check(matches(withText(text))); true } catch (e: Throwable) { false }
        }
    }

    @Test fun localHttpServerIsAcceptedAfterTheWarning() {
        val server = FakeServer().also { servers += it }
        val scenario = ActivityScenario.launchActivityForResult(SetupActivity::class.java)
        type(server.origin)
        // Plain http on this device: a warning first, the check only after "Connect anyway".
        onView(withId(R.id.message)).check(matches(withText(R.string.setup_insecure)))
        onView(withId(R.id.connect)).check(matches(withText(R.string.setup_connect_anyway))).perform(click())
        server.waitForPath("/healthz")
        // Blocks until the screen closes.
        assertEquals(Activity.RESULT_OK, scenario.result.resultCode)
        assertEquals(server.origin, Prefs(context).server)
    }

    @Test fun publicHttpIsRefusedWithTheHttpsAlternative() {
        ActivityScenario.launch(SetupActivity::class.java)
        type("http://todo.example.com")
        onView(withId(R.id.message)).check(matches(withText(R.string.setup_needs_https)))
        onView(withId(R.id.alternative)).check(matches(isDisplayed())).check(matches(withText(context.getString(R.string.setup_try, "https://todo.example.com"))))
    }

    @Test fun invalidAddressIsRefused() {
        ActivityScenario.launch(SetupActivity::class.java)
        type("ftp://todo.example.com/path")
        onView(withId(R.id.message)).check(matches(withText(R.string.setup_refused)))
        assertNull(Prefs(context).server)
    }

    @Test fun serverThatIsNotOpenTodo() {
        val other = okhttp3.mockwebserver.MockWebServer().apply {
            dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
                override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest) = okhttp3.mockwebserver.MockResponse().setResponseCode(404)
            }
            start()
        }
        try {
            ActivityScenario.launch(SetupActivity::class.java)
            type(other.url("/").toString().removeSuffix("/"))
            onView(withId(R.id.connect)).perform(click())
            waitForMessage(R.string.setup_not_opentodo)
            assertNull(Prefs(context).server)
        } finally {
            other.shutdown()
        }
    }

    @Test fun nothingListening() {
        val port = ServerSocket(0).use { it.localPort }
        ActivityScenario.launch(SetupActivity::class.java)
        type("http://localhost:$port")
        onView(withId(R.id.connect)).perform(click())
        waitForMessage(R.string.setup_no_network)
        assertNull(Prefs(context).server)
    }

    @Test fun untrustedCertificate() {
        val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val server = FakeServer(HandshakeCertificates.Builder().heldCertificate(cert).build()).also { servers += it }
        ActivityScenario.launch(SetupActivity::class.java)
        type(server.origin)
        waitForMessage(R.string.setup_untrusted)
        assertNull(Prefs(context).server)
    }
}
