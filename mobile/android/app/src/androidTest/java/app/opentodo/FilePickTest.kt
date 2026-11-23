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
import androidx.test.rule.GrantPermissionRule
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * #1606: an import picks a file through Android's picker, which hands the web view a
 * `content://` address. The web view keeps `allowContentAccess = false`, so this checks that
 * the page can still read the picked file, as the import does before it sends it.
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

    @Test fun aPickedFileCanBeReadByThePage() {
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
        Intents.init()
        try {
            intending(hasAction(Intent.ACTION_GET_CONTENT))
                .respondWith(Instrumentation.ActivityResult(Activity.RESULT_OK, Intent().setData(PickedFileProvider.uri())))
            // The input covers the page: a real tap, which a file input needs to open its picker.
            onView(withId(R.id.web)).perform(click())
            web.waitForJs("window.picked", "\"${PickedFileProvider.NAME}: ${PickedFileProvider.BODY}\"")
        } finally {
            Intents.release()
        }
    }
}
