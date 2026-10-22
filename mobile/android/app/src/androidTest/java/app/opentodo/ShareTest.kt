package app.opentodo

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.action.ViewActions.closeSoftKeyboard
import androidx.test.espresso.action.ViewActions.replaceText
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Task 4.4: Android shares reach the capture screen (native-shells "Share into the app"). */
@RunWith(AndroidJUnit4::class)
class ShareTest {
    private lateinit var server: FakeServer
    private val files = mutableListOf<Uri>()

    @Before fun setUp() {
        resetApp()
        server = FakeServer()
    }

    @After fun tearDown() {
        files.forEach { context.contentResolver.delete(it, null, null) }
        server.shutdown()
        resetApp()
    }

    private fun send(text: String, subject: String? = null) = Intent(context, MainActivity::class.java)
        .setAction(Intent.ACTION_SEND).setType("text/plain")
        .putExtra(Intent.EXTRA_TEXT, text)
        .apply { if (subject != null) putExtra(Intent.EXTRA_SUBJECT, subject) }

    @Test fun textBecomesTheCaptureScreensText() {
        Prefs(context).server = server.origin
        ActivityScenario.launch<MainActivity>(send("Buy milk", subject = "Groceries"))
        assertEquals("/share?title=Groceries&text=Buy+milk", server.waitForPath("/share"))
    }

    @Test fun aLoneLinkBecomesTheCaptureScreensLink() {
        Prefs(context).server = server.origin
        ActivityScenario.launch<MainActivity>(send("https://example.org/a?b=1"))
        assertEquals("/share?url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1", server.waitForPath("/share"))
    }

    /** A file in Downloads, written by the app's own process so it can read it back like a shared one. */
    private fun download(name: String, type: String, bytes: ByteArray): Uri {
        val r = context.contentResolver
        val uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, type)
            put(MediaStore.Downloads.IS_PENDING, 1)
        })!!
        files += uri
        r.openOutputStream(uri)!!.use { it.write(bytes) }
        r.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        waitUntil("the size of $name") {
            r.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c -> c.moveToFirst() && !c.isNull(0) && c.getLong(0) == bytes.size.toLong() } == true
        }
        return uri
    }

    @SdkSuppress(minSdkVersion = 29)
    @Test fun twoPhotosArriveAsTheFilesMessage() {
        Prefs(context).server = server.origin
        val a = download("share-test-a-${System.nanoTime()}.png", "image/png", ByteArray(2048) { 1 })
        val b = download("share-test-b-${System.nanoTime()}.png", "image/png", ByteArray(4096) { 2 })
        val intent = Intent(context, MainActivity::class.java)
            .setAction(Intent.ACTION_SEND_MULTIPLE).setType("image/png")
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(a, b))
        val scenario = ActivityScenario.launch<MainActivity>(intent)
        assertEquals("/share?files=1", server.waitForPath("/share"))
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        web.waitForJs("window.__files", "2")
        assertEquals("\"received\"", web.js("document.documentElement.dataset.opentodoFiles"))
        assertTrue(web.js("window.__names").contains("share-test-a-"))
    }

    @Test fun aShareWaitsForTheFirstRunScreen() {
        ActivityScenario.launch<MainActivity>(send("Call the plumber"))
        // No server yet: the first-run screen comes first, then the share is delivered.
        onView(withId(R.id.address)).perform(replaceText(server.origin), closeSoftKeyboard())
        onView(withId(R.id.connect)).perform(click())
        onView(withId(R.id.connect)).perform(click())
        assertEquals("/share?text=Call+the+plumber", server.waitForPath("/share"))
    }
}
