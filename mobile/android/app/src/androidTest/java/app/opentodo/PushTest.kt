package app.opentodo

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.service.notification.StatusBarNotification
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * shell-push: a message the distributor delivers shows the reminder's own notification once,
 * only for the registration's token, and the bridge answers the registration there is. The
 * message is one the server's `push.Encrypt` made for these keys (the unit tests' vector).
 */
@RunWith(AndroidJUnit4::class)
class PushTest {
    @get:Rule val notifications: GrantPermissionRule =
        if (Build.VERSION.SDK_INT >= 33) GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS) else GrantPermissionRule.grant()

    private lateinit var server: FakeServer
    private val keys = WebPush.Keys(PRIVATE, P256DH, AUTH)
    private val vapid = WebPush.encode(byteArrayOf(4) + ByteArray(64) { 7 })
    private val registered = UnifiedPush.begin("org.example.distributor", vapid, "token-1", keys).copy(endpoint = "https://ntfy.example/upAbC123")

    @Before fun setUp() {
        resetApp()
        // Cancelling is not immediate: the last test's notification may still be listed.
        waitUntil("the earlier notifications to go") { shown().isEmpty() }
        allowExactAlarms()
        server = FakeServer()
        Prefs(context).server = server.origin
        Prefs(context).push = registered.toJson()
    }

    @After fun tearDown() {
        if (::server.isInitialized) server.shutdown()
        resetApp()
    }

    private fun message(token: String?, body: ByteArray = WebPush.decode(BODY)!!): Intent =
        Intent(UnifiedPush.ACTION_MESSAGE).setPackage(context.packageName)
            .putExtra(UnifiedPush.EXTRA_TOKEN, token).putExtra(UnifiedPush.EXTRA_BYTES, body).putExtra(UnifiedPush.EXTRA_ID, "m1")

    /** As the system delivers it: on the main thread, and done when this returns. */
    private fun receive(intent: Intent) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync { PushReceiver().onReceive(context, intent) }
    }

    private fun shown(): List<StatusBarNotification> =
        context.getSystemService(NotificationManager::class.java).activeNotifications.toList()

    private fun reminderShown(): StatusBarNotification? = shown().firstOrNull { it.id == Notifier.notificationId(REMINDER_ID) }

    @Test fun aPushedReminderShowsTheAlarmsNotificationOnce() {
        // The same reminder is in the phone's schedule, an hour ahead.
        val scheduled = JSONObject().put("id", REMINDER_ID).put("taskId", "task-1").put("fireAt", System.currentTimeMillis() + 60 * 60_000)
        Scheduler.replace(context, JSONArray().put(scheduled).toString())
        // A broadcast as a distributor sends it: to the package, through the manifest's filter.
        context.sendBroadcast(message("token-1"))
        waitUntil("the pushed reminder's notification") { reminderShown() != null }
        val first = reminderShown()!!
        assertEquals("Water the plants — ☂", first.notification.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(Notifier.CHANNEL, first.notification.channelId)
        assertEquals(
            listOf(context.getString(R.string.action_done), context.getString(R.string.action_snooze), context.getString(R.string.action_dismiss)),
            first.notification.actions.map { it.title.toString() },
        )
        assertTrue("it does not alert a second time", first.notification.flags and Notification.FLAG_ONLY_ALERT_ONCE != 0)
        // Its alarm went with it.
        assertNull(Scheduler.find(context, REMINDER_ID))

        // The same message again, and the alarm's path for the same firing: still that one notification.
        receive(message("token-1"))
        assertTrue(Notifier.show(context, REMINDER_ID, "task-1", "Water the plants — ☂", FIRE_AT))
        assertEquals(1, shown().size)
        assertEquals(first.postTime, reminderShown()!!.postTime)

        // Dismissed, it stays away when the message comes once more.
        context.getSystemService(NotificationManager::class.java).cancel(Notifier.notificationId(REMINDER_ID))
        waitUntil("the notification to go") { reminderShown() == null }
        receive(message("token-1"))
        assertNull(reminderShown())
    }

    @Test fun aMessageWithAForeignTokenShowsNothing() {
        for (token in listOf(null, "", "token-2")) receive(message(token))
        assertTrue(shown().isEmpty())
        // And no registration at all accepts nothing.
        Prefs(context).push = null
        receive(message("token-1"))
        assertTrue(shown().isEmpty())
    }

    @Test fun bytesThatDoNotDecryptShowNothing() {
        val body = WebPush.decode(BODY)!!
        receive(message("token-1", body.copyOf().also { it[it.size - 1] = (it[it.size - 1].toInt() xor 1).toByte() }))
        receive(message("token-1", body.copyOf(40)))
        receive(message("token-1", ByteArray(0)))
        receive(Intent(UnifiedPush.ACTION_MESSAGE).putExtra(UnifiedPush.EXTRA_TOKEN, "token-1"))
        assertTrue(shown().isEmpty())
        // The registration is untouched: the next good message shows.
        receive(message("token-1"))
        assertEquals(1, shown().size)
    }

    @Test fun theDistributorsAnswersChangeTheRegistrationOnlyWithItsToken() {
        fun answer(action: String, token: String, endpoint: String? = null) =
            receive(Intent(action).putExtra(UnifiedPush.EXTRA_TOKEN, token).putExtra(UnifiedPush.EXTRA_ENDPOINT, endpoint))
        answer(UnifiedPush.ACTION_NEW_ENDPOINT, "token-2", "https://evil.example/up")
        answer(UnifiedPush.ACTION_UNREGISTERED, "token-2")
        assertEquals(registered, Push.state(context))
        // A rotated endpoint is kept, with the same keys.
        answer(UnifiedPush.ACTION_NEW_ENDPOINT, "token-1", "https://ntfy.example/upNew")
        assertEquals(registered.copy(endpoint = "https://ntfy.example/upNew"), Push.state(context))
        answer(UnifiedPush.ACTION_TEMP_UNAVAILABLE, "token-1")
        assertTrue(Push.state(context).registered)
        // Unregistered by the distributor: the token, the endpoint and the keys go, and a later message shows nothing.
        answer(UnifiedPush.ACTION_UNREGISTERED, "token-1")
        assertEquals(UnifiedPush.State(), Push.state(context))
        assertNull(Prefs(context).push)
        receive(message("token-1"))
        assertTrue(shown().isEmpty())
    }

    private fun open(): WebView {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        lateinit var web: WebView
        scenario.onActivity { web = it.findViewById(R.id.web) }
        server.waitForPath("/")
        web.waitForJs("location.origin + location.pathname", "\"${server.origin}/\"")
        web.waitForJs("typeof window.opentodoShell", "\"object\"")
        return web
    }

    @Test fun theBridgeAnswersTheRegistrationWithoutThePrivateKey() {
        val web = open()
        assertTrue(web.js("window.opentodoShell.capabilities.join(',')").contains("push"))
        web.js("window.__p = null; window.opentodoShell.pushState().then(function (r) { window.__p = r }); 0")
        web.waitForJs("typeof window.__p", "\"string\"")
        val state = JSONObject(JSONArray("[" + web.js("window.__p") + "]").getString(0))
        assertTrue(state.getBoolean("registered"))
        assertEquals("https://ntfy.example/upAbC123", state.getString("endpoint"))
        assertEquals(P256DH, state.getString("p256dh"))
        assertEquals(AUTH, state.getString("auth"))
        assertFalse(state.toString().contains(PRIVATE))
        // The same server key: the subscription there is, without asking a distributor again.
        web.js("window.__s = null; window.opentodoShell.pushSubscribe('$vapid').then(function (r) { window.__s = r }); 0")
        web.waitForJs("typeof window.__s", "\"string\"")
        val subscription = JSONObject(JSONArray("[" + web.js("window.__s") + "]").getString(0))
        assertEquals("https://ntfy.example/upAbC123", subscription.getString("endpoint"))
        assertEquals(P256DH, subscription.getString("p256dh"))
        assertFalse(subscription.toString().contains(PRIVATE))
        // Sign-out: the registration and its keys go.
        web.js("window.opentodoShell.pushUnsubscribe(); 0")
        waitUntil("the registration to be forgotten") { Prefs(context).push == null }
        web.js("window.__p = null; window.opentodoShell.pushState().then(function (r) { window.__p = r }); 0")
        web.waitForJs("typeof window.__p === 'string' && JSON.parse(window.__p).registered === false", "true")
        web.waitForJs("typeof window.__p === 'string' && !('endpoint' in JSON.parse(window.__p))", "true")
    }

    private companion object {
        const val REMINDER_ID = "rem-1"
        const val FIRE_AT = 1_800_000_000_000L
        const val PRIVATE = "SJyogOj5zQgsV6uheXqPo7zU1dxEWMAmFS3D0Av7lBc"
        const val P256DH = "BARJlBsdQ-P7N7vdnb891WmPbnWUtj-frkJ-hLqN52YRmHv_yylAcdoNFyl2o-9HFb7eOXZwxqUI6y6t9aTZmmE"
        const val AUTH = "fHEktviKrgip5lbeq5W5Pg"
        /** `{"type":"reminder","reminderId":"rem-1","taskId":"task-1","fireAt":1800000000000,"title":"Water the plants — ☂"}` */
        const val BODY = "FMkvbllWt1QpdeU1E6dhjQAAEABBBJ-gONrjr-3YAYSK5OJeL1wLSJxEhKDY1GddV8MMffvaswc1PnVqO32ecvsD32we2u-LId3bMS3yCCsDMQK2DZCY4rVwdu2y8FzrfHfns6qs2I496s0c7B6ttWJ_fnucu8pupRrLwxk2zoiKerM7xZcZ_Es1A8CJYMo9igE1J_tSs_g8n6FlTgI0w3CvRe9jFfEDSYNukq7v61pYiQl5KZYuFYpak6ojC0CX8eD0EHkjFvgOx9TEq4eyTEn_gyPnzUTBM010"
    }
}
