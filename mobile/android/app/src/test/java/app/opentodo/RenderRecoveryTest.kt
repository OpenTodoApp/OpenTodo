package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Test

class RenderRecoveryTest {
    private val origin = "https://todo.example.com"

    @Test fun reopensTheServerPageItShowed() {
        assertEquals("$origin/project/p1", RenderRecovery.reloadUrl("$origin/project/p1", origin))
    }

    @Test fun anotherOriginOrNothingOpensTheStartPage() {
        assertEquals("$origin/", RenderRecovery.reloadUrl("https://accounts.example.org/login", origin))
        assertEquals("$origin/", RenderRecovery.reloadUrl("about:blank", origin))
        assertEquals("$origin/", RenderRecovery.reloadUrl(null, origin))
    }

    @Test fun neverTheSharedCaptureAddressOfAnotherServer() {
        assertEquals("$origin/", RenderRecovery.reloadUrl("https://todo.example.com.evil.test/capture", origin))
    }
}
