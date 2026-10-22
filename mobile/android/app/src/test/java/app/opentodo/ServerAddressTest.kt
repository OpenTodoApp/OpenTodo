package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerAddressTest {
    private fun ok(input: String) = ServerAddress.parse(input) as ServerAddress.Result.Ok

    @Test fun httpsByDefault() {
        assertEquals(ServerAddress.Result.Ok("https://todo.example.com", false), ServerAddress.parse("todo.example.com"))
        assertEquals("https://todo.example.com", ok(" https://Todo.Example.com/ ").origin)
        assertEquals("https://todo.example.com:8443", ok("https://todo.example.com:8443").origin)
        assertEquals("https://todo.example.com", ok("https://todo.example.com:443").origin)
    }

    @Test fun publicHttpIsRefusedWithTheHttpsOffer() {
        assertEquals(ServerAddress.Result.NeedsHttps("https://todo.example.com"), ServerAddress.parse("http://todo.example.com"))
        assertEquals(ServerAddress.Result.NeedsHttps("https://todo.example.com:8080"), ServerAddress.parse("http://todo.example.com:8080"))
        assertEquals(ServerAddress.Result.NeedsHttps("https://8.8.8.8"), ServerAddress.parse("http://8.8.8.8"))
    }

    @Test fun localHttpIsAcceptedWithAWarning() {
        for (a in listOf("http://192.168.1.4:8080", "http://10.0.0.2", "http://172.20.1.1", "http://127.0.0.1:8080", "http://localhost:8080", "http://nas.local", "http://[::1]:8080", "http://[fd00::1]")) {
            val r = ServerAddress.parse(a)
            assertTrue("$a -> $r", r is ServerAddress.Result.Ok && r.insecure)
        }
        assertEquals("http://192.168.1.4:8080", ok("http://192.168.1.4:8080").origin)
        assertEquals("http://[::1]:8080", ok("http://[::1]:8080").origin)
    }

    @Test fun notLocal() {
        for (h in listOf("172.32.0.1", "192.169.0.1", "11.0.0.1", "example.com", "local.example.com", "fe00::1", "256.1.1.1")) assertFalse(h, ServerAddress.isLocal(h))
    }

    @Test fun invalid() {
        for (a in listOf("", "   ", "ftp://todo.example.com", "https://todo.example.com/app", "https://user@todo.example.com", "https://todo.example.com/?x=1", "https://todo.example.com/#a", "https://", "todo example.com", "javascript:alert(1)")) {
            assertEquals(a, ServerAddress.Result.Invalid, ServerAddress.parse(a))
        }
    }
}
