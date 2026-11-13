package app.opentodo

import android.annotation.SuppressLint
import android.view.HapticFeedbackConstants

/**
 * Haptic feedback the web app asks for (shell-repairs D5, capability `haptics`): a kind,
 * `tick` or `success`, becomes the platform's own feedback on the web view. It needs no
 * permission and follows the phone's touch-feedback setting. A kind this shell does not
 * know is ignored. The kinds are pinned by the shared bridge fixture haptics.json.
 */
object Haptic {
    /** The `HapticFeedbackConstants` value for [kind] on API level [sdk], or null for an unknown kind. */
    @SuppressLint("InlinedApi")
    fun constant(kind: String, sdk: Int): Int? = when (kind) {
        "tick" -> HapticFeedbackConstants.CONTEXT_CLICK
        // CONFIRM exists from Android 11 (API 30).
        "success" -> if (sdk >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
        else -> null
    }
}
