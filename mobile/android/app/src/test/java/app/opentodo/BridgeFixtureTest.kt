package app.opentodo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The bridge contract with the web app (native-shells "The bridge is optional"): the
 * files in src/test/resources/bridge are the exact strings web/src/lib/shell.ts hands
 * over, written by web/src/lib/shellBridge.fixture.test.ts from the web app's own
 * builders, with what this shell must read from them. Neither side builds its own JSON.
 */
class BridgeFixtureTest {
    private fun fixture(name: String): JSONObject {
        val url = javaClass.classLoader!!.getResource("bridge/$name")
        assertNotNull("missing bridge fixture $name (web: UPDATE_BRIDGE_FIXTURES=1)", url)
        return JSONObject(url!!.readText())
    }

    private fun nullableString(o: JSONObject, key: String): String? = if (o.isNull(key)) null else o.getString(key)

    private fun checkReminders(name: String) {
        val f = fixture(name)
        assertEquals(name, "scheduleReminders", f.getString("method"))
        val want = f.getJSONArray("expect")
        val got = ReminderSchedule.parse(f.getString("payload"), f.getLong("now"))
        assertEquals(name, (0 until want.length()).map { i ->
            val o = want.getJSONObject(i)
            ShellReminder(o.getString("id"), o.getString("taskId"), o.getLong("fireAt"), nullableString(o, "title"))
        }, got)
    }

    private fun checkWidget(name: String) {
        val f = fixture(name)
        assertEquals(name, "publishWidget", f.getString("method"))
        val want = f.getJSONObject("expect")
        val rows: JSONArray = want.getJSONArray("rows")
        val expected = WidgetModel(
            updatedAt = want.getLong("updatedAt"),
            locked = want.getBoolean("locked"),
            count = want.getInt("count"),
            overdue = want.getInt("overdue"),
            rows = (0 until rows.length()).map { i ->
                val r = rows.getJSONObject(i)
                WidgetModel.Row(r.getString("id"), nullableString(r, "title"), nullableString(r, "time"), r.getInt("priority"), r.getBoolean("overdue"))
            },
            more = want.getInt("more"),
        )
        assertEquals(name, expected, WidgetModel.parse(f.getString("payload")))
    }

    @Test fun reminders() = checkReminders("reminders.json")

    @Test fun remindersOfAnEncryptedAccountCarryNoTitles() = checkReminders("reminders-encrypted.json")

    @Test fun signOutEmptiesTheSchedule() = checkReminders("reminders-signed-out.json")

    @Test fun widget() = checkWidget("widget.json")

    @Test fun lockedWidget() = checkWidget("widget-locked.json")

    @Test fun signOutEmptiesTheWidget() = checkWidget("widget-signed-out.json")

    /** obsidian-origin: the note link the web app hands openExternal is accepted, and only the D2 shape is. */
    @Test fun obsidianNoteLinks() {
        val f = fixture("external-links.json")
        val handed = f.getJSONArray("handed")
        assertEquals(1, handed.length())
        for (i in 0 until handed.length()) assertTrue(handed.getString(i), ObsidianLink.valid(handed.getString(i)))
        val accepted = f.getJSONArray("accepted")
        for (i in 0 until accepted.length()) assertTrue(accepted.getString(i), ObsidianLink.valid(accepted.getString(i)))
        val refused = f.getJSONArray("refused")
        for (i in 0 until refused.length()) assertFalse(refused.getString(i), ObsidianLink.valid(refused.getString(i)))
    }

    @Test fun addressesTheWebAppReads() {
        val f = fixture("actions.json")
        val actions = f.getJSONArray("reminderActions")
        for (i in 0 until actions.length()) {
            val a = actions.getJSONObject(i)
            assertEquals(a.getString("path"), ReminderSchedule.actionPath(a.getString("id"), a.getString("action")))
        }
        val tasks = f.getJSONArray("taskPaths")
        for (i in 0 until tasks.length()) {
            val t = tasks.getJSONObject(i)
            assertEquals(t.getString("path"), ReminderSchedule.taskPath(t.getString("taskId")))
        }
        assertEquals(f.getJSONObject("quickAdd").getString("path"), ReminderSchedule.QUICK_ADD_PATH)
    }
}
