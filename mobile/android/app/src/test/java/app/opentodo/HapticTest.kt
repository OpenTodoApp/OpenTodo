package app.opentodo

import android.view.HapticFeedbackConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** shell-repairs D5: a kind of feedback becomes the platform's own constant; an unknown kind nothing. */
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

    @Test fun anUnknownKindIsIgnored() {
        for (kind in listOf("warning", "", "Tick", "SUCCESS", "tick ")) for (sdk in listOf(26, 36)) assertNull(kind, Haptic.constant(kind, sdk))
    }
}
