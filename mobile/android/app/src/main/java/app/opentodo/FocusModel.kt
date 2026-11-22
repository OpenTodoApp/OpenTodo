package app.opentodo

import org.json.JSONObject

/**
 * The Focus session the web app hands over (focus-live-activity D1, bridge v1
 * `publishFocus`), and what the ongoing notification shows of it. Pure, so the rules are
 * unit-tested against the shared bridge fixtures without a device.
 */
data class FocusModel(
    val state: State,
    val taskId: String?,
    val title: String?,
    val phase: Phase,
    val breakKind: BreakKind?,
    val cycle: Int?,
    val cycleLength: Int?,
    val runningSince: Long?,
    val elapsedMs: Long,
    val plannedEndAt: Long?,
    val plannedMs: Long?,
) {
    enum class State { RUNNING, PAUSED, DONE, NONE }
    enum class Phase { WORK, BREAK }
    enum class BreakKind { SHORT, LONG }

    /** The line under the title: "Work · 2 of 4", "Work", "Short break", "Long break" or "Paused". */
    sealed class Label {
        data class Work(val cycle: Int?, val of: Int?) : Label()
        object ShortBreak : Label()
        object LongBreak : Label()
        object Paused : Label()
    }

    val shown: Boolean get() = state == State.RUNNING || state == State.PAUSED

    val label: Label get() = when {
        state == State.PAUSED -> Label.Paused
        phase == Phase.BREAK -> if (breakKind == BreakKind.LONG) Label.LongBreak else Label.ShortBreak
        else -> Label.Work(cycle, cycleLength)
    }

    /** The system chronometer counts down to [end] for a running timed phase. */
    val countsDown: Boolean get() = state == State.RUNNING && plannedEndAt != null

    val end: Long? get() = if (state == State.RUNNING) plannedEndAt else null

    /** A running Flowtime session counts up from here: the time worked before the stretch included. */
    val countUpFrom: Long? get() = if (state == State.RUNNING && plannedEndAt == null && runningSince != null) runningSince - elapsedMs else null

    /** While paused the clock is frozen: the time left of a timed phase, the time worked otherwise. */
    val frozenMs: Long? get() = if (state != State.PAUSED) null else if (plannedMs != null) (plannedMs - elapsedMs).coerceAtLeast(0) else elapsedMs

    /** When the session-end notification fires: the planned end of a running timed phase only. */
    val notifyAt: Long? get() = end

    /** The address Pause or Resume opens (focus-live-activity D4); none outside a run. */
    val actionPath: String? get() = when (state) {
        State.RUNNING -> "/focus?action=pause"
        State.PAUSED -> "/focus?action=resume"
        else -> null
    }

    companion object {
        const val OPEN_PATH = "/focus"
        val NONE = FocusModel(State.NONE, null, null, Phase.WORK, null, null, null, null, 0, null, null)

        /** A publication; anything malformed or of an unknown version reads as none, so nothing stale stays shown. */
        fun parse(json: String?): FocusModel {
            val o = try { JSONObject(json ?: return NONE) } catch (e: Exception) { return NONE }
            if (o.optInt("v", 0) != 1) return NONE
            val state = when (o.optString("state")) {
                "running" -> State.RUNNING
                "paused" -> State.PAUSED
                "done" -> State.DONE
                else -> return NONE
            }
            fun long(key: String): Long? = if (o.has(key) && !o.isNull(key)) o.optLong(key, -1).takeIf { it >= 0 } else null
            fun int(key: String): Int? = if (o.has(key) && !o.isNull(key)) o.optInt(key, -1).takeIf { it in 1..99 } else null
            fun str(key: String, max: Int): String? = if (o.has(key) && !o.isNull(key)) o.optString(key).take(max).ifEmpty { null } else null
            val phase = if (o.optString("phase") == "break") Phase.BREAK else Phase.WORK
            val breakKind = when (o.optString("breakKind")) { "long" -> BreakKind.LONG; "short" -> BreakKind.SHORT; else -> null }
            val runningSince = long("runningSince")
            // A running session needs to know since when; without it nothing can be drawn.
            if (state == State.RUNNING && runningSince == null) return NONE
            return FocusModel(
                state = state,
                taskId = str("taskId", 100),
                title = str("title", 200),
                phase = phase,
                breakKind = if (phase == Phase.BREAK) breakKind ?: BreakKind.SHORT else null,
                cycle = int("cycle"),
                cycleLength = int("cycleLength"),
                runningSince = if (state == State.RUNNING) runningSince else null,
                elapsedMs = long("elapsedMs") ?: 0,
                plannedEndAt = if (state == State.RUNNING) long("plannedEndAt") else null,
                plannedMs = long("plannedMs"),
            )
        }

        /** The frozen time as the screen shows it: `24:59`, `1:05:00` from an hour. */
        fun clockText(ms: Long): String {
            val total = (ms.coerceAtLeast(0) / 1000)
            val h = total / 3600
            val m = (total % 3600) / 60
            val s = total % 60
            return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
        }
    }
}
