package app.opentodo

/**
 * How long the launch screen stays (shell-first-paint): until the shell has something to
 * show (the page ready to be drawn, an error screen, a dialog), and never longer than the
 * cap, so a slow server still gets the screens it had. Once the page has loaded, the web
 * view gets a moment to say it is ready to draw and no more. Times are milliseconds of one
 * monotonic clock.
 */
class LaunchHold(startedAt: Long, capMs: Long = CAP_MS) {
    private var until = startedAt + capMs

    /** The shell has something to show: the launch screen goes now. */
    fun show() {
        until = Long.MIN_VALUE
    }

    /** The page finished loading at [now]; a second call cannot make the wait longer. */
    fun loaded(now: Long) {
        until = minOf(until, now + AFTER_LOAD_MS)
    }

    /** True while the launch screen stays up at [now]. */
    fun holds(now: Long): Boolean = now < until

    /** How long from [now] until it goes by itself; 0 when it is due. */
    fun remaining(now: Long): Long = if (holds(now)) until - now else 0

    companion object {
        /** The longest wait for a page: after it the web view shows whatever it has. */
        const val CAP_MS = 5_000L

        /** The longest wait for a loaded page to be ready to draw. */
        const val AFTER_LOAD_MS = 500L
    }
}
