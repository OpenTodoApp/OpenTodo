package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** shell-first-paint: the launch screen stays until there is something to show, and never past the cap. */
class LaunchHoldTest {
    @Test fun itHoldsUntilTheCap() {
        val hold = LaunchHold(startedAt = 1_000)
        assertTrue(hold.holds(1_000))
        assertTrue(hold.holds(5_999))
        assertFalse(hold.holds(6_000))
        assertFalse(hold.holds(60_000))
        assertEquals(5_000L, LaunchHold.CAP_MS)
    }

    @Test fun somethingToShowEndsItAtOnce() {
        val hold = LaunchHold(startedAt = 1_000)
        hold.show()
        assertFalse(hold.holds(1_000))
        assertFalse(hold.holds(0))
        assertEquals(0L, hold.remaining(1_000))
    }

    @Test fun aLoadedPageGetsAMomentToBeReady() {
        val hold = LaunchHold(startedAt = 1_000)
        hold.loaded(1_800)
        assertTrue(hold.holds(1_800))
        assertTrue(hold.holds(2_299))
        assertFalse(hold.holds(2_300))
        assertEquals(500L, hold.remaining(1_800))
    }

    @Test fun loadingNeverExtendsTheWait() {
        val late = LaunchHold(startedAt = 1_000)
        late.loaded(5_900)
        assertFalse("the cap still ends it", late.holds(6_000))
        val twice = LaunchHold(startedAt = 1_000)
        twice.loaded(1_200)
        twice.loaded(3_000)
        assertFalse(twice.holds(1_700))
        val shown = LaunchHold(startedAt = 1_000)
        shown.show()
        shown.loaded(1_100)
        assertFalse(shown.holds(1_100))
    }

    @Test fun remainingCountsDownToZero() {
        val hold = LaunchHold(startedAt = 0, capMs = 300)
        assertEquals(300L, hold.remaining(0))
        assertEquals(1L, hold.remaining(299))
        assertEquals(0L, hold.remaining(300))
        assertEquals(0L, hold.remaining(10_000))
    }
}
