package app.opentodo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files
import java.util.Base64

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

    /** theme-engine D8: the bars the web app hands over are read as written; a malformed payload is ignored. */
    @Test fun systemBars() {
        val f = fixture("system-bars.json")
        assertEquals("setSystemBars", f.getString("method"))
        val handed = f.getJSONArray("handed")
        assertTrue(handed.length() >= 2)
        for (i in 0 until handed.length()) {
            val h = handed.getJSONObject(i)
            val bars = SystemBars.parse(h.getString("payload"))
            assertNotNull(h.getString("payload"), bars)
            assertEquals(h.getString("payload"), 0xFF000000.toInt() or h.getString("color").substring(1).toInt(16), bars!!.color)
            assertEquals(h.getString("payload"), h.getBoolean("lightIcons"), bars.lightIcons)
        }
        val refused = f.getJSONArray("refused")
        for (i in 0 until refused.length()) assertEquals(refused.getString(i), null, SystemBars.parse(refused.getString(i)))
    }

    /** shell-repairs D2: the chunks the web app hands saveFile make the file, with its name and type; a malformed call fails. */
    @Test fun saveFile() {
        val f = fixture("save-file.json")
        assertEquals("saveFile", f.getString("method"))
        val calls = f.getJSONArray("calls")
        val want = f.getJSONObject("expect")
        val answers = want.getJSONArray("answers")
        assertEquals(calls.length(), answers.length())
        val dir = Files.createTempDirectory("opentodo-save-fixture").toFile()
        try {
            val save = FileSave(dir)
            for (i in 0 until calls.length()) {
                val step = save.accept(calls.getString(i))
                if (i < calls.length() - 1) {
                    assertEquals("call $i", FileSave.Step.More, step)
                    assertEquals("call $i", FileSave.MORE, answers.getString(i))
                    continue
                }
                // The last answer is the save dialog's: here the file it would be given.
                assertEquals(FileSave.SAVED, answers.getString(i))
                assertTrue("call $i gives the whole file", step is FileSave.Step.Whole)
                val whole = step as FileSave.Step.Whole
                assertEquals(want.getString("name"), whole.name)
                assertEquals(want.getString("type"), whole.type)
                assertEquals(want.getString("bytes"), Base64.getEncoder().encodeToString(whole.file.readBytes()))
            }
            val refused = f.getJSONArray("refused")
            assertTrue(refused.length() >= 1)
            for (i in 0 until refused.length()) {
                assertEquals(refused.getString(i), null, FileSave.parse(refused.getString(i)))
                assertEquals(refused.getString(i), FileSave.Step.Failed, FileSave(dir).accept(refused.getString(i)))
            }
        } finally {
            dir.deleteRecursively()
        }
    }

    /** shell-repairs D5: every kind the web app hands haptic has its feedback; an unknown one has none. */
    @Test fun haptics() {
        val f = fixture("haptics.json")
        assertEquals("haptic", f.getString("method"))
        val kinds = f.getJSONArray("kinds")
        assertTrue(kinds.length() >= 2)
        for (sdk in listOf(26, 30, 36)) {
            for (i in 0 until kinds.length()) assertNotNull(kinds.getString(i), Haptic.constant(kinds.getString(i), sdk))
            assertEquals(null, Haptic.constant(f.getString("unknown"), sdk))
        }
    }

    /** The page side offers both methods: saveFile answers through the promise channel, haptic is sent only. */
    @Test fun thePageScriptHasTheNewMethods() {
        val script = Bridge.script("1.0.0", listOf("reminders", "files", "haptics"))
        assertTrue(script, script.contains("saveFile: function (json) { return call('saveFile', [String(json)]) }"))
        assertTrue(script, script.contains("haptic: function (kind) { send('haptic', [String(kind)]) }"))
        assertTrue(script, script.contains("\"files\"") && script.contains("\"haptics\""))
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

    @Test fun notificationButtonsInTheFixturesOrder() {
        val f = fixture("actions.json")
        fun order(key: String, id: String): List<String> {
            val arr = f.getJSONArray(key)
            return (0 until arr.length()).map { arr.getJSONObject(it) }.filter { it.getString("id") == id }.map { it.getString("action") }
        }
        assertEquals(order("reminderActions", "abc"), ReminderSchedule.REMINDER_ACTIONS)
        assertEquals(order("locationActions", "g-arrive"), ReminderSchedule.LOCATION_ACTIONS)
    }
}
