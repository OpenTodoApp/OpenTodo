package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Focus session of focus-live-activity (task 3.1, 3.2, 3.3): the shared bridge fixtures
 * the web app writes, parsed here, with what the ongoing notification and the end alarm
 * must make of them.
 */
class FocusModelTest {
    private fun fixture(name: String): JSONObject {
        val url = javaClass.classLoader!!.getResource("bridge/$name")
        assertNotNull("missing bridge fixture $name (web: UPDATE_BRIDGE_FIXTURES=1)", url)
        return JSONObject(url!!.readText())
    }

    private fun JSONObject.longOrNull(key: String): Long? = if (isNull(key)) null else getLong(key)
    private fun JSONObject.intOrNull(key: String): Int? = if (isNull(key)) null else getInt(key)

    private fun check(name: String): FocusModel {
        val f = fixture(name)
        assertEquals(name, "publishFocus", f.getString("method"))
        val want = f.getJSONObject("expect")
        val m = FocusModel.parse(f.getString("payload"))
        assertEquals(name, want.getString("state"), m.state.name.lowercase())
        assertEquals(name, if (want.isNull("title")) null else want.getString("title"), m.title)
        assertEquals(name, want.getBoolean("countsDown"), m.countsDown)
        assertEquals(name, want.longOrNull("end"), m.end)
        assertEquals(name, want.longOrNull("countUpFrom"), m.countUpFrom)
        assertEquals(name, want.longOrNull("frozenMs"), m.frozenMs)
        assertEquals(name, want.longOrNull("notifyAt"), m.notifyAt)
        assertEquals(name, want.intOrNull("cycle"), m.cycle)
        assertEquals(name, want.intOrNull("cycleLength"), m.cycleLength)
        // `none` names no phase.
        if (!want.isNull("phase")) assertEquals(name, want.getString("phase"), m.phase.name.lowercase())
        assertEquals(name, if (want.isNull("breakKind")) null else want.getString("breakKind"), m.breakKind?.name?.lowercase())
        return m
    }

    @Test fun aRunningPomodoroCountsDownAndNotifiesAtItsEnd() {
        val m = check("focus-running.json")
        assertEquals(FocusModel.Label.Work(2, 4), m.label)
        assertEquals("/focus?action=pause", m.actionPath)
        assertTrue(m.shown)
    }

    @Test fun pausedIsFrozenWithoutTitleOrAlarm() {
        val m = check("focus-paused.json")
        assertEquals(FocusModel.Label.Paused, m.label)
        assertEquals("/focus?action=resume", m.actionPath)
        assertNull(m.notifyAt)
        assertEquals(15 * 60_000L, m.frozenMs)
    }

    @Test fun flowtimeCountsUp() {
        val m = check("focus-flowtime.json")
        assertFalse(m.countsDown)
        assertEquals(FocusModel.Label.Work(null, null), m.label)
    }

    @Test fun aBreakCountsDownToBreakOver() {
        val m = check("focus-break.json")
        assertEquals(FocusModel.Label.ShortBreak, m.label)
        assertEquals(FocusModel.Phase.BREAK, m.phase)
    }

    @Test fun noneRemovesEverything() {
        val m = check("focus-none.json")
        assertFalse(m.shown)
        assertNull(m.actionPath)
    }

    @Test fun malformedOrUnknownVersionsReadAsNone() {
        for (bad in listOf(null, "", "not json", "[]", "{}", """{"v":2,"state":"running","runningSince":1}""", """{"v":1,"state":"later"}""", """{"v":1,"state":"running"}""")) {
            assertEquals(bad, FocusModel.NONE, FocusModel.parse(bad))
        }
        assertFalse(FocusModel.parse("""{"v":1,"state":"done","phase":"work"}""").shown)
    }

    @Test fun theActionsOpenAddressesTheWebAppReads() {
        val actions = fixture("actions.json")
        assertEquals(FocusModel.OPEN_PATH, actions.getJSONObject("focusOpen").getString("path"))
        val paths = actions.getJSONArray("focusActions").let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("path") } }
        assertEquals(listOf("/focus?action=pause", "/focus?action=resume"), paths)
        assertEquals(paths[0], FocusModel.parse(fixture("focus-running.json").getString("payload")).actionPath)
        assertEquals(paths[1], FocusModel.parse(fixture("focus-paused.json").getString("payload")).actionPath)
    }

    @Test fun theFrozenClockReadsAsOnScreen() {
        assertEquals("24:59", FocusModel.clockText(24 * 60_000L + 59_000))
        assertEquals("1:05:00", FocusModel.clockText(65 * 60_000L))
        assertEquals("0:00", FocusModel.clockText(-5))
    }

    @Test fun onlyTheVisibleAppListsFocus() {
        assertTrue(Bridge.capabilityList(play = true, hasScreen = true, background = false, sdkInt = 34, biometric = false).contains("focus"))
        assertFalse(Bridge.capabilityList(play = false, hasScreen = false, background = true, sdkInt = 34, biometric = false).contains("focus"))
        assertTrue(Bridge.script("1.0.0", listOf("focus")).contains("publishFocus: function (json) { send('publishFocus', [String(json)]) }"))
    }

    @Test fun aDonePublicationAfterThePlannedEndStillOwesTheEnd() {
        // focus-live-activity D3: the web app publishes `done` on its own clock, often before an
        // inexact alarm; the stored running session's end is then still due.
        val running = check("focus-running.json")
        val end = running.notifyAt!!
        assertTrue(running.endDue(end))
        assertTrue(running.endDue(end + 60_000))
        assertTrue(running.endDue(end - 500))
        // Stopped early: nothing is owed.
        assertFalse(running.endDue(end - 60_000))
        // Paused, Flowtime and none have no planned end to announce.
        assertFalse(check("focus-paused.json").endDue(Long.MAX_VALUE / 2))
        assertFalse(check("focus-flowtime.json").endDue(Long.MAX_VALUE / 2))
        assertFalse(FocusModel.NONE.endDue(Long.MAX_VALUE / 2))
    }

    @Test fun aPhaseThatStartsOnItsOwnAfterTheEndStillAnnouncesIt() {
        // "Start breaks automatically": the work phase ends straight into a running break,
        // with no `done` in between; the work session's end is still owed.
        val work = check("focus-running.json")
        val brk = check("focus-break.json")
        val end = work.notifyAt!!
        assertTrue(work.endOwedBy(brk, end + 1_000))
        assertTrue(work.endOwedBy(FocusModel.parse("{\"v\":1,\"state\":\"done\",\"phase\":\"work\"}"), end))
        assertTrue(work.endOwedBy(FocusModel.NONE, end))
        // The same run published again (another title) is left to its alarm.
        assertFalse(work.endOwedBy(work, end + 1_000))
        // Before the end nothing is owed, whatever replaces it.
        assertFalse(work.endOwedBy(brk, end - 60_000))
    }

    @Test fun pauseAndResumeNeedTheNotificationsTokenAndTheRightState() {
        // Any installed app can open the activity: an action without this session's token, or
        // one that does not fit the state, only opens the Focus screen.
        val running = check("focus-running.json")
        val paused = check("focus-paused.json")
        assertEquals("/focus?action=pause", running.authorize("/focus?action=pause", "t", "t"))
        assertEquals("/focus", running.authorize("/focus?action=pause", null, "t"))
        assertEquals("/focus", running.authorize("/focus?action=pause", "guess", "t"))
        assertEquals("/focus", running.authorize("/focus?action=pause", "t", null))
        assertEquals("/focus", running.authorize("/focus?action=resume", "t", "t"))
        assertEquals("/focus?action=resume", paused.authorize("/focus?action=resume", "t", "t"))
        assertEquals("/focus", paused.authorize("/focus?action=pause", "t", "t"))
        assertEquals("/focus", FocusModel.NONE.authorize("/focus?action=pause", "t", "t"))
        assertEquals("/focus", running.authorize("/focus?x=1&action=pause", "t", "t"))
        // Spellings the web app still reads as `/focus` with an action: an encoded key or
        // value, dot segments, other case.
        for (forged in listOf("/focus?%61ction=pause", "/focus?%2561ction=pause", "/./focus?action=pause", "/x/../focus?action=pause",
                "/%2E/focus?action=pause", "/focus/?action=pause", "/focus?action=%70ause", "/FOCUS?ACTION=pause", "/focus#?action=pause")) {
            assertEquals(forged, "/focus", running.authorize(forged, null, "t"))
            assertEquals(forged, "/focus", running.authorize(forged, "t", "t"))
        }
        // Everything else is untouched: the Focus screen itself, and other addresses.
        assertEquals("/focus", running.authorize("/focus", null, null))
        assertEquals("/today?reminder=r1&action=done", running.authorize("/today?reminder=r1&action=done", null, null))
    }

    @Test fun theStoredSessionIsTheNormalizedOne() {
        for (name in listOf("focus-running.json", "focus-paused.json", "focus-flowtime.json", "focus-break.json")) {
            val m = check(name)
            assertEquals(name, m, FocusModel.parse(m.toJson()))
        }
        assertNull(FocusModel.NONE.toJson())
        // Unknown fields are dropped and the title is capped.
        val long = "x".repeat(500)
        val stored = FocusModel.parse("{\"v\":1,\"state\":\"paused\",\"phase\":\"work\",\"title\":\"$long\",\"extra\":\"secret\",\"elapsedMs\":1}").toJson()!!
        assertFalse(stored.contains("extra"))
        assertEquals(200, JSONObject(stored).getString("title").length)
    }
}
