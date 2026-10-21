package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Test

class ShareMapperTest {
    @Test fun textAndLinks() {
        assertEquals("/share?url=https%3A%2F%2Fexample.com%2Fa", ShareMapper.path(null, "https://example.com/a", false))
        assertEquals("/share?title=Recipe&text=Look+at+https%3A%2F%2Fexample.com", ShareMapper.path("Recipe", "Look at https://example.com", false))
        assertEquals("/share?text=Buy+milk", ShareMapper.path("  ", " Buy milk ", false))
    }

    @Test fun files() {
        assertEquals("/share?files=1", ShareMapper.path(null, null, true))
        assertEquals("/share?text=Two+photos&files=1", ShareMapper.path(null, "Two photos", true))
    }

    @Test fun limitsBeforeHandOver() {
        val mb = 1024L * 1024
        assertEquals(listOf(0, 1), ShareMapper.accept(listOf(2 * mb, 3 * mb)))
        // Unknown size, too large, and over the total are left out.
        assertEquals(listOf(1, 3), ShareMapper.accept(listOf(-1, 15 * mb, 21 * mb, 5 * mb, 6 * mb)))
        assertEquals(ShareMapper.MAX_FILES, ShareMapper.accept(List(15) { 1024L }).size)
    }
}
