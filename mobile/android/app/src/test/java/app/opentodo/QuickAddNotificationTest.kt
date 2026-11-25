package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * android-quick-add-notification D2 to D4: the requests the web app hands over, the answers,
 * and the background run's address of a reply, from the shared fixture
 * bridge/quick-add-notification.json (written by web/src/lib/shellBridge.fixture.test.ts).
 */
class QuickAddNotificationTest {
    private val fixture = JSONObject(javaClass.classLoader!!.getResource("bridge/quick-add-notification.json")!!.readText())

    @Test fun readsEveryRequestOfTheWebApp() {
        assertEquals("quickAddNotification", fixture.getString("method"))
        val calls = fixture.getJSONArray("calls")
        assertTrue(calls.length() > 0)
        for (i in 0 until calls.length()) {
            val c = calls.getJSONObject(i)
            val want = QuickAddNotification.Request(if (c.has("on")) c.getBoolean("on") else null, c.getBoolean("reply"))
            assertEquals(c.getString("json"), want, QuickAddNotification.parse(c.getString("json")))
        }
        // A malformed request changes nothing and offers no inline field.
        assertEquals(QuickAddNotification.Request(null, false), QuickAddNotification.parse("not json"))
    }

    @Test fun answersAreTheOnesTheWebAppReads() {
        val answers = fixture.getJSONArray("answers").let { a -> (0 until a.length()).map { a.getString(it) } }
        assertEquals("off", QuickAddNotification.answer(on = false, allowed = true))
        assertEquals("off", QuickAddNotification.answer(on = false, allowed = false))
        assertEquals("on", QuickAddNotification.answer(on = true, allowed = true))
        assertEquals("denied", QuickAddNotification.answer(on = true, allowed = false))
        for (on in listOf(true, false)) for (allowed in listOf(true, false)) assertTrue(answers.contains(QuickAddNotification.answer(on, allowed)))
    }

    @Test fun aReplyOpensTheAddressTheWebAppSaves() {
        val replies = fixture.getJSONArray("replies")
        for (i in 0 until replies.length()) {
            val r = replies.getJSONObject(i)
            val want = if (r.isNull("path")) null else r.getString("path")
            assertEquals(r.getString("text"), want, QuickAddNotification.replyPath(r.getString("text")))
        }
        assertNull(QuickAddNotification.replyPath(null))
    }

    @Test fun aLongReplyIsCutAtTheAddressLimitWithoutSplittingACharacter() {
        val path = QuickAddNotification.replyPath("a".repeat(499) + "😀" + "b")!!
        val text = java.net.URLDecoder.decode(path.removePrefix(ReminderSchedule.QUICK_ADD_PATH), "UTF-8")
        assertEquals("a".repeat(499), text)
        assertEquals(500, QuickAddNotification.replyPath("c".repeat(600))!!.removePrefix(ReminderSchedule.QUICK_ADD_PATH).length)
    }

    @Test fun onlyTheVisibleAppListsTheCapability() {
        assertTrue(Bridge.capabilityList(play = true, hasScreen = true, background = false, sdkInt = 26, biometric = false).contains("quick-add-notification"))
        assertFalse(Bridge.capabilityList(play = false, hasScreen = false, background = true, sdkInt = 36, biometric = false).contains("quick-add-notification"))
        assertTrue(Bridge.script("1.0.0", listOf("quick-add-notification")).contains("quickAddNotification: function (json) { return call('quickAddNotification', [String(json)]) }"))
    }
}
