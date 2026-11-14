package app.opentodo

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** shell-reminders-on D4: a background run ends when the web app says it is done, or at its limit. */
class HiddenRunTest {
    @Test fun theRunEndsOnTheSignal() = runBlocking {
        val done = CompletableDeferred<Unit>()
        launch { done.complete(Unit) }
        val start = System.nanoTime()
        assertTrue(awaitBackgroundDone(done, 60_000))
        assertTrue("ended on the signal, not at the limit", System.nanoTime() - start < 30_000_000_000L)
    }

    @Test fun aSignalBeforeTheWaitCounts() = runBlocking {
        assertTrue(awaitBackgroundDone(CompletableDeferred(Unit), 60_000))
    }

    @Test fun theRunEndsAtTheLimitWhenNothingIsHeard() = runBlocking {
        val done = CompletableDeferred<Unit>()
        assertFalse(awaitBackgroundDone(done, 50))
        assertFalse("the wait does not end the signal's source", done.isCancelled)
    }

    @Test fun theLimitIsNinetySeconds() {
        assertEquals(90_000L, HiddenRunWorker.LIMIT_MS)
    }
}
