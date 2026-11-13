package app.opentodo

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.Base64

/** shell-repairs D2: the chunks of a file the page saves, and the name the save dialog gets. */
class FileSaveTest {
    private val dir: File = Files.createTempDirectory("opentodo-save").toFile()
    private val save = FileSave(dir)

    @After fun tearDown() { dir.deleteRecursively() }

    private fun call(id: Any?, data: ByteArray, last: Any?, name: String = "a.txt", type: String = "text/plain"): String =
        JSONObject().put("id", id).put("name", name).put("type", type).put("data", Base64.getEncoder().encodeToString(data)).put("last", last).toString()

    private fun files(): List<File> = dir.listFiles()?.toList() ?: emptyList()

    @Test fun twoChunksMakeOneFile() {
        assertEquals(FileSave.Step.More, save.accept(call("f", byteArrayOf(1, 2, 3), false)))
        val whole = save.accept(call("f", byteArrayOf(4, 5), true)) as FileSave.Step.Whole
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 5), whole.file.readBytes())
        assertEquals("a.txt", whole.name)
        assertEquals("text/plain", whole.type)
        assertEquals(dir, whole.file.parentFile)
        assertEquals(listOf(whole.file), files())
    }

    @Test fun anEmptyFileIsOneCall() {
        val whole = save.accept(call("empty", ByteArray(0), true)) as FileSave.Step.Whole
        assertTrue(whole.file.exists())
        assertEquals(0L, whole.file.length())
    }

    @Test fun aNewIdDiscardsTheUnfinishedFile() {
        assertEquals(FileSave.Step.More, save.accept(call("old", byteArrayOf(9, 9), false)))
        assertEquals(1, files().size)
        val whole = save.accept(call("new", byteArrayOf(7), true)) as FileSave.Step.Whole
        assertArrayEquals(byteArrayOf(7), whole.file.readBytes())
        assertEquals(listOf(whole.file), files())
    }

    @Test fun aWholeFileIsNotTouchedByTheNextOne() {
        val first = save.accept(call("one", byteArrayOf(1), true)) as FileSave.Step.Whole
        val second = save.accept(call("two", byteArrayOf(2), true)) as FileSave.Step.Whole
        assertArrayEquals(byteArrayOf(1), first.file.readBytes())
        assertArrayEquals(byteArrayOf(2), second.file.readBytes())
    }

    @Test fun malformedPayloadsFailAndLeaveNoFile() {
        val bad = listOf(
            "not json",
            "{}",
            "[]",
            call("", byteArrayOf(1), true),
            call(7, byteArrayOf(1), true),
            call("x", byteArrayOf(1), "yes"),
            call("x", byteArrayOf(1), null),
            """{"id":"x","name":"a","type":"","data":"***","last":true}""",
            """{"id":"x","name":"a","type":"","data":7,"last":true}""",
            """{"id":"x","type":"","data":"","last":true}""",
            """{"id":"x","name":"a","data":"","last":true}""",
        )
        for (json in bad) {
            assertNull(json, FileSave.parse(json))
            assertEquals(json, FileSave.Step.Failed, FileSave(dir).accept(json))
        }
        assertEquals(emptyList<File>(), files())
    }

    /** A file whose chunk failed is never saved from its later chunks. */
    @Test fun aFailedChunkRefusesTheRestOfItsFile() {
        assertEquals(FileSave.Step.More, save.accept(call("f", byteArrayOf(1), false)))
        assertEquals(FileSave.Step.Failed, save.accept("""{"id":"f","name":"a","type":"","data":"***","last":false}"""))
        assertEquals(emptyList<File>(), files())
        assertEquals(FileSave.Step.Failed, save.accept(call("f", byteArrayOf(3), true)))
        assertEquals(emptyList<File>(), files())
        assertTrue(save.accept(call("g", byteArrayOf(3), true)) is FileSave.Step.Whole)
    }

    @Test fun discardAndClearLeaveNothing() {
        save.accept(call("f", byteArrayOf(1), false))
        save.discard()
        assertEquals(emptyList<File>(), files())
        save.accept(call("g", byteArrayOf(1), true))
        File(dir, "stale.part").writeText("old")
        FileSave.clear(dir)
        assertEquals(emptyList<File>(), files())
        FileSave.clear(File(dir, "missing"))
    }

    @Test fun theNameIsItsLastPathSegment() {
        assertEquals("passwd", FileSave.name("../../etc/passwd"))
        assertEquals("key.txt", FileSave.name("C:\\Users\\me\\key.txt"))
        assertEquals("opentodo-recovery-key.txt", FileSave.name("opentodo-recovery-key.txt"))
        assertEquals("ab.txt", FileSave.name("a\u0000\nb\u007f.txt"))
        assertEquals("Aufgaben März.csv", FileSave.name("  Aufgaben März.csv "))
        for (empty in listOf(null, "", "   ", "/", "a/", ".", "..", "../..", "\u0001")) assertEquals(FileSave.FALLBACK_NAME, FileSave.name(empty))
        assertEquals("download", FileSave.FALLBACK_NAME)
        val long = FileSave.name("x".repeat(500) + ".txt")
        assertEquals(200, long.length)
        assertFalse(FileSave.name("/" + "x".repeat(199) + "\uD83D\uDE00").last().isHighSurrogate())
    }

    @Test fun theTypeIsAMimeTypeOrTheFallback() {
        assertEquals("text/plain", FileSave.type("text/plain;charset=utf-8"))
        assertEquals("application/json", FileSave.type(" Application/JSON "))
        assertEquals("image/svg+xml", FileSave.type("image/svg+xml"))
        for (bad in listOf(null, "", "text", "text/", "a b/c", "*/*", "text/plain\nX: y")) assertEquals(bad, FileSave.FALLBACK_TYPE, FileSave.type(bad))
        assertEquals("application/octet-stream", FileSave.FALLBACK_TYPE)
    }
}
