package app.opentodo

import android.view.HapticFeedbackConstants
import org.junit.Assert.assertEquals
import org.junit.Test

/** shell-repairs D5, haptic-kinds D1: a kind of feedback becomes the platform's own constant; an unknown kind plays tick. */
class HapticTest {
    @Test fun tickIsAContextClick() {
        for (sdk in listOf(26, 29, 30, 36)) assertEquals(HapticFeedbackConstants.CONTEXT_CLICK, Haptic.constant("tick", sdk))
    }

    @Test fun successIsConfirmFromAndroid11() {
        assertEquals(HapticFeedbackConstants.CONTEXT_CLICK, Haptic.constant("success", 26))
        assertEquals(HapticFeedbackConstants.CONTEXT_CLICK, Haptic.constant("success", 29))
        assertEquals(HapticFeedbackConstants.CONFIRM, Haptic.constant("success", 30))
        assertEquals(HapticFeedbackConstants.CONFIRM, Haptic.constant("success", 36))
        assertEquals(16, HapticFeedbackConstants.CONFIRM)
        assertEquals(6, HapticFeedbackConstants.CONTEXT_CLICK)
    }

    @Test fun errorIsRejectFromAndroid11AndWarningALongPress() {
        assertEquals(HapticFeedbackConstants.LONG_PRESS, Haptic.constant("error", 29))
        assertEquals(HapticFeedbackConstants.REJECT, Haptic.constant("error", 30))
        for (sdk in listOf(26, 36)) assertEquals(HapticFeedbackConstants.LONG_PRESS, Haptic.constant("warning", sdk))
        assertEquals(17, HapticFeedbackConstants.REJECT)
        assertEquals(0, HapticFeedbackConstants.LONG_PRESS)
    }

    @Test fun selectionIsAClockTick() {
        for (sdk in listOf(26, 36)) assertEquals(HapticFeedbackConstants.CLOCK_TICK, Haptic.constant("selection", sdk))
        assertEquals(4, HapticFeedbackConstants.CLOCK_TICK)
    }

    @Test fun anUnknownKindPlaysTick() {
        for (kind in listOf("thud", "", "Tick", "SUCCESS", "tick ")) for (sdk in listOf(26, 36)) assertEquals(kind, HapticFeedbackConstants.CONTEXT_CLICK, Haptic.constant(kind, sdk))
    }
}
