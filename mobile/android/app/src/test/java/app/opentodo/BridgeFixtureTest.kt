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
            canComplete = want.getBoolean("canComplete"),
            rows = (0 until rows.length()).map { i ->
                val r = rows.getJSONObject(i)
                WidgetModel.Row(r.getString("id"), nullableString(r, "title"), nullableString(r, "time"), nullableString(r, "date"), nullableString(r, "project"), r.getInt("priority"), r.getBoolean("overdue"))
            },
            more = want.getInt("more"),
        )
        assertEquals(name, expected, WidgetModel.parse(f.getString("payload")))
    }

    @Test fun reminders() = checkReminders("reminders.json")

    @Test fun remindersOfAnEncryptedAccountCarryNoTitles() = checkReminders("reminders-encrypted.json")

    @Test fun signOutEmptiesTheSchedule() = checkReminders("reminders-signed-out.json")

    /** ios-urgent-alarms D2: Android reads an urgent reminder as an ordinary one. */
    @Test fun urgentRemindersAreOrdinaryReminders() = checkReminders("reminders-urgent.json")

    @Test fun widget() = checkWidget("widget.json")

    @Test fun lockedWidget() = checkWidget("widget-locked.json")

    @Test fun signOutEmptiesTheWidget() = checkWidget("widget-signed-out.json")

    /** completed-widget D1: the days and today's count the web app publishes, and counts only once locked. */
    private fun checkCompleted(name: String) {
        val f = fixture(name)
        assertEquals(name, "publishWidget", f.getString("method"))
        val want = f.getJSONObject("expect")
        val days = want.getJSONArray("days")
        val expected = CompletedModel(
            updatedAt = want.getLong("updatedAt"),
            locked = want.getBoolean("locked"),
            today = want.getInt("today"),
            days = (0 until days.length()).map { i -> days.getJSONObject(i).let { CompletedModel.Day(it.getString("day"), it.getInt("done")) } },
        )
        assertEquals(name, expected, CompletedModel.parse(f.getString("payload")))
    }

    @Test fun completedWidget() = checkCompleted("widget-completed.json")

    @Test fun lockedCompletedWidget() = checkCompleted("widget-completed-locked.json")

    /** A publication without completions (an older web app) leaves the Completed widget asking to open the app. */
    @Test fun completedWidgetNeedsAPublication() {
        assertEquals(null, CompletedModel.parse(fixture("widget.json").getString("payload")))
    }

    /** app-links D6: the link the web app hands openAppLink opens with its list, and the shared vectors hold. */
    @Test fun appLinks() {
        val f = fixture("app-links.json")
        val handed = f.getJSONArray("handed")
        assertEquals(1, handed.length())
        val call = handed.getJSONObject(0)
        assertTrue(AppLink.allows(AppLink.list(call.getString("schemes")), call.getString("url")))
        val v = f.getJSONObject("vectors")
        val links = v.getJSONArray("links")
        for (i in 0 until links.length()) {
            val c = links.getJSONObject(i)
            assertEquals(c.getString("url"), if (c.isNull("scheme")) null else c.getString("scheme"), AppLink.scheme(c.getString("url")))
        }
        val entries = v.getJSONArray("entries")
        for (i in 0 until entries.length()) {
            val c = entries.getJSONObject(i)
            assertEquals(c.getString("entry"), c.getBoolean("ok"), AppLink.validEntry(c.getString("entry")))
        }
        val allows = v.getJSONArray("allows")
        for (i in 0 until allows.length()) {
            val c = allows.getJSONObject(i)
            val list = c.getJSONArray("list").let { a -> (0 until a.length()).map { a.getString(it) } }
            assertEquals("$list ${c.getString("url")}", c.getBoolean("ok"), AppLink.allows(list, c.getString("url")))
        }
    }

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
            assertEquals(5, kinds.length())
            assertEquals(Haptic.constant("tick", sdk), Haptic.constant(f.getString("unknown"), sdk))
        }
    }

    /** The page side offers both methods: saveFile answers through the promise channel, haptic is sent only. */
    @Test fun thePageScriptHasTheNewMethods() {
        val script = Bridge.script("1.0.0", listOf("reminders", "files", "haptics"))
        assertTrue(script, script.contains("saveFile: function (json) { return call('saveFile', [String(json)]) }"))
        assertTrue(script, script.contains("haptic: function (kind) { send('haptic', [String(kind)]) }"))
        assertTrue(script, script.contains("\"files\"") && script.contains("\"haptics\""))
    }

    private fun strings(f: JSONObject, key: String): List<String> = f.getJSONArray(key).let { a -> (0 until a.length()).map { a.getString(it) } }

    /**
     * shell-reminders-on: what only the visible app, only a background run and both list.
     * `biometric` and `geofences` depend on the device and the store build and are not in the fixture.
     */
    @Test fun capabilitiesOfTheVisibleAppAndOfABackgroundRun() {
        val f = fixture("capabilities.json")
        val visibleOnly = strings(f, "visibleOnly")
        val backgroundOnly = strings(f, "backgroundOnly")
        val both = strings(f, "both")
        assertTrue(visibleOnly.contains("alarm-settings") && backgroundOnly.contains("background"))
        val visible = Bridge.capabilityList(play = false, hasScreen = true, background = false, sdkInt = 34, biometric = false)
        for (c in visibleOnly + both) assertTrue("the visible app lists $c: $visible", visible.contains(c))
        for (c in backgroundOnly) assertFalse("the visible app does not list $c: $visible", visible.contains(c))
        val run = Bridge.capabilityList(play = false, hasScreen = false, background = true, sdkInt = 34, biometric = false)
        for (c in backgroundOnly + both) assertTrue("a background run lists $c: $run", run.contains(c))
        for (c in visibleOnly) assertFalse("a background run does not list $c: $run", run.contains(c))
    }

    /** Every shell's page script has the methods, whatever it lists: one without the capability does nothing. */
    @Test fun thePageScriptHasTheMethodsOfTheNewCapabilities() {
        val methods = fixture("capabilities.json").getJSONObject("methods")
        assertEquals("alarm-settings", methods.getString("openAlarmSettings"))
        assertEquals("background", methods.getString("backgroundDone"))
        assertEquals("completion-sound", methods.getString("playCompletionSound"))
        val script = Bridge.script("1.0.0", listOf("reminders", "widgets"))
        for (m in methods.keys()) assertTrue("$m in the page script", script.contains("$m: function () { send('$m', []) }"))
    }

    /**
     * shell-reveal-on-paint D2: the web app's call after its first frame. Only the visible app,
     * which holds a launch screen, lists the capability; the call has no arguments.
     */
    @Test fun firstPaintFollowsTheFixture() {
        val f = fixture("painted.json")
        assertEquals("first-paint", f.getString("capability"))
        assertEquals("painted", f.getString("method"))
        val calls = f.getJSONArray("calls")
        assertEquals(1, calls.length())
        assertEquals(0, calls.getJSONArray(0).length())
        assertTrue(Bridge.capabilityList(play = true, hasScreen = true, background = false, sdkInt = 34, biometric = false).contains("first-paint"))
        assertFalse(Bridge.capabilityList(play = false, hasScreen = false, background = true, sdkInt = 34, biometric = false).contains("first-paint"))
        assertTrue(Bridge.script("1.0.0", listOf("first-paint")).contains("painted: function () { send('painted', []) }"))
    }

    @Test fun completionSoundRespectsRingerMode() {
        assertTrue(CompletionSound.allowsSound(android.media.AudioManager.RINGER_MODE_NORMAL))
        assertFalse(CompletionSound.allowsSound(android.media.AudioManager.RINGER_MODE_SILENT))
        assertFalse(CompletionSound.allowsSound(android.media.AudioManager.RINGER_MODE_VIBRATE))
    }

    @Test fun completionSoundMatchesWebSamples() {
        val expected = fixture("completion-sound.json")
        val clip = CompletionSound.samples()
        assertEquals(expected.getInt("sampleRate"), CompletionSound.SAMPLE_RATE)
        assertEquals(expected.getInt("frames"), clip.size)
        val samples = expected.getJSONArray("samples")
        for (i in 0 until samples.length()) {
            val pair = samples.getJSONArray(i)
            val frame = pair.getInt(0)
            assertTrue("frame $frame", kotlin.math.abs(clip[frame].toInt() - pair.getInt(1)) <= 1)
        }
    }

    /** shell-reminders-on D3: `alarm-settings` needs a screen and Android 12; nothing else changes with the API level. */
    @Test fun alarmSettingsByApiLevelAndScreen() {
        assertFalse(Bridge.alarmSettings(hasScreen = true, sdkInt = 26))
        assertFalse(Bridge.alarmSettings(hasScreen = true, sdkInt = 30))
        assertTrue(Bridge.alarmSettings(hasScreen = true, sdkInt = 31))
        assertTrue(Bridge.alarmSettings(hasScreen = true, sdkInt = 36))
        assertFalse(Bridge.alarmSettings(hasScreen = false, sdkInt = 31))
        assertFalse(Bridge.alarmSettings(hasScreen = false, sdkInt = 36))
        val old = Bridge.capabilityList(play = false, hasScreen = true, background = false, sdkInt = 30, biometric = false)
        val new = Bridge.capabilityList(play = false, hasScreen = true, background = false, sdkInt = 31, biometric = false)
        assertEquals(old + "alarm-settings", new)
        assertFalse(Bridge.capabilityList(play = false, hasScreen = false, background = true, sdkInt = 36, biometric = false).contains("alarm-settings"))
    }

    /** `background` only in a run without a screen; the Play build drops geofences; biometric needs a screen. */
    @Test fun capabilityListByBuildAndRun() {
        assertEquals(listOf("reminders", "widgets", "geofences", "push"), Bridge.capabilityList(play = false, hasScreen = false, background = false, sdkInt = 36, biometric = true))
        assertEquals(listOf("reminders", "widgets", "push", "background"), Bridge.capabilityList(play = true, hasScreen = false, background = true, sdkInt = 36, biometric = false))
        val visible = Bridge.capabilityList(play = true, hasScreen = true, background = true, sdkInt = 36, biometric = true)
        assertFalse(visible.toString(), visible.contains("background") || visible.contains("geofences"))
        assertTrue(visible.toString(), visible.contains("biometric") && visible.contains("links"))
    }

    /**
     * shell-push D5: `push` in the visible app and in a background run (which reads pushState
     * to notice a new endpoint), in every build and on every Android version; the fixture
     * lists it under `both`.
     */
    @Test fun pushIsACapabilityOfEveryRun() {
        assertTrue(strings(fixture("capabilities.json"), "both").contains("push"))
        for (play in listOf(false, true)) for (sdk in listOf(26, 30, 33, 34, 36)) {
            assertTrue(Bridge.capabilityList(play = play, hasScreen = true, background = false, sdkInt = sdk, biometric = false).contains("push"))
            assertTrue(Bridge.capabilityList(play = play, hasScreen = false, background = true, sdkInt = sdk, biometric = false).contains("push"))
            assertTrue(Bridge.capabilityList(play = play, hasScreen = false, background = false, sdkInt = sdk, biometric = false).contains("push"))
        }
    }

    /** The answer of scheduleReminders: exact alarms only matter once notifications are allowed. */
    @Test fun reminderAnswers() {
        assertEquals("granted", Bridge.reminderAnswer(notifications = true, exact = true))
        assertEquals("exact-denied", Bridge.reminderAnswer(notifications = true, exact = false))
        assertEquals("denied", Bridge.reminderAnswer(notifications = false, exact = true))
        assertEquals("denied", Bridge.reminderAnswer(notifications = false, exact = false))
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
        // android-widget-list D2: the Today widget's completion circle.
        val complete = f.getJSONArray("completePaths")
        assertTrue(complete.length() > 0)
        for (i in 0 until complete.length()) {
            val c = complete.getJSONObject(i)
            assertEquals(c.getString("path"), WidgetStore.completePath(c.getString("taskId")))
        }
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
