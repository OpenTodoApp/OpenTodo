package app.opentodo

import android.annotation.SuppressLint
import android.view.HapticFeedbackConstants

/**
 * Haptic feedback the web app asks for (shell-repairs D5, haptic-kinds D1, capability
 * `haptics`): a kind (`tick`, `success`, `warning`, `error`, `selection`) becomes the
 * platform's own feedback on the web view. It needs no permission and follows the phone's
 * touch-feedback setting. A kind this shell does not know plays `tick`, so a newer page
 * never fails. The kinds are pinned by the shared bridge fixture haptics.json.
 */
object Haptic {
    /** The `HapticFeedbackConstants` value for [kind] on API level [sdk]; `tick`'s for an unknown kind. */
    @SuppressLint("InlinedApi")
    fun constant(kind: String, sdk: Int): Int = when (kind) {
        // CONFIRM and REJECT exist from Android 11 (API 30).
        "success" -> if (sdk >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
        "error" -> if (sdk >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
        "warning" -> HapticFeedbackConstants.LONG_PRESS
        "selection" -> HapticFeedbackConstants.CLOCK_TICK
        else -> HapticFeedbackConstants.CONTEXT_CLICK
    }
}
