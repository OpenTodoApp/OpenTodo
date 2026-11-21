package app.opentodo

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * No native overscroll effect (row-lift-overscroll D2): the app's web views draw no glow
 * or stretch at a list's end; the page's own scrolling decides what happens at an edge.
 */
class OverscrollTest {
    @Test fun everyWebViewTurnsTheOverscrollEffectOff() {
        val layouts = File("src/main/res/layout").listFiles { f -> f.name.endsWith(".xml") }!!
        val views = layouts.flatMap { f -> Regex("""<WebView\b[^>]*>""").findAll(f.readText()).map { f.name to it.value }.toList() }
        assertEquals(listOf("activity_main.xml", "activity_sign_in.xml"), views.map { it.first }.sorted())
        for ((file, tag) in views) assertEquals(file, true, tag.contains("""android:overScrollMode="never""""))
    }
}
