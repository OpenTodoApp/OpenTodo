package app.opentodo

import android.Manifest
import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Build
import android.view.View
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * #1606: an import picks a file through Android's picker, which hands the web view a
 * `content://` address. The web view keeps `allowContentAccess = false`, so this checks that
 * the page can still read the picked file, and send it to the server as the import does.
 */
@RunWith(AndroidJUnit4::class)
class FilePickTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    private lateinit var server: FakeServer

    @Before fun setUp() {
        resetApp()
        allowExactAlarms()
        server = FakeServer()
        Prefs(context).server = server.origin
    }

    @After fun tearDown() {
        if (::server.isInitialized) server.shutdown()
        resetApp()
    }

    /** The shell on the server's page whose file input covers the screen, ready for a tap. */
    private fun openPickPage(): WebView {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        server.waitForPath("/")
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        web.js("location.href = '/pick-file'")
        web.waitForJs("location.pathname", "\"/pick-file\"")
        web.waitForJs("typeof window.picked", "\"string\"")
        // The launch screen has gone, whichever way the shell holds it: a tap reaches the page.
        waitUntil("the web view shows") {
            var shown = false
            scenario.onActivity { shown = web.visibility == View.VISIBLE && web.alpha == 1f }
            shown
        }
        return web
    }

    private fun picked() = Instrumentation.ActivityResult(Activity.RESULT_OK,
        Intent().setData(PickedFileProvider.uri(InstrumentationRegistry.getInstrumentation().context.packageName)))

    /** From the test's thread: Espresso reads its recorded intents on the main thread itself. */
    private fun pickerOpenings(): Int = Intents.getIntents().count { it.action == Intent.ACTION_GET_CONTENT }

    /** The picked file read by the page, then sent the way the import sends it, which is where #1606 failed. */
    private fun assertTheFileWasRead(web: WebView) {
        web.waitForJs("window.picked", "\"${PickedFileProvider.NAME}: ${PickedFileProvider.BODY}\"")
        web.waitForJs("window.uploaded", "\"sent\"")
        assertEquals("one upload: ${server.uploads}", 1, server.uploads.size)
        val body = server.uploads[0]
        assertTrue("the upload names the file: $body", body.contains("filename=\"${PickedFileProvider.NAME}\""))
        assertTrue("the upload carries its bytes: $body", body.contains(PickedFileProvider.BODY))
    }

    @Test fun aPickedFileCanBeReadByThePage() {
        val web = openPickPage()
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(picked())
            // The input covers the page: a real tap, which a file input needs to open its picker.
            onView(withId(R.id.web)).perform(click())
            assertTheFileWasRead(web)
        } finally {
            Intents.release()
        }
    }

    /**
     * Backing out of Android's picker answers the page's chooser with nothing. Left unanswered,
     * the web view would never open the picker again: the next tap must open it and the file
     * picked then must reach the server.
     */
    @Test fun afterACancelledPickThePickerOpensAgain() {
        val web = openPickPage()
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null))
            onView(withId(R.id.web)).perform(click())
            waitUntil("the picker opened") { pickerOpenings() == 1 }
            // Nothing picked: no file reached the page or the server.
            assertEquals("\"\"", web.js("window.picked"))
            assertEquals(0, server.uploads.size)
            // The newest stub answers: this time a file is picked.
            intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(picked())
            onView(withId(R.id.web)).perform(click())
            waitUntil("the picker opened again") { pickerOpenings() == 2 }
            assertTheFileWasRead(web)
        } finally {
            Intents.release()
        }
    }
}
