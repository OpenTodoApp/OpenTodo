package app.opentodo

import java.io.File
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The widgets' text follows the day/night colours and stays readable on the widget background (#966). */
class WidgetColorTest {
    private val res = File("src/main/res")

    private fun colors(dir: String): Map<String, Long> =
        Regex("""<color name="([a-z_]+)">#([0-9A-Fa-f]{8})</color>""")
            .findAll(File(res, "$dir/colors.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2].toLong(16) }

    private fun channel(argb: Long, shift: Int) = ((argb shr shift) and 0xFF).toDouble() / 255

    private fun luminance(r: Double, g: Double, b: Double): Double {
        fun lin(c: Double) = if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    /** Contrast of an opaque text colour on the (slightly translucent) background, composited on the opposite extreme. */
    private fun contrast(text: Long, bg: Long, under: Double): Double {
        val a = channel(bg, 24)
        fun comp(shift: Int) = channel(bg, shift) * a + under * (1 - a)
        val lb = luminance(comp(16), comp(8), comp(0))
        val lt = luminance(channel(text, 16), channel(text, 8), channel(text, 0))
        return (maxOf(lb, lt) + 0.05) / (minOf(lb, lt) + 0.05)
    }

    @Test fun textReadableInBothModes() {
        for ((dir, under) in listOf("values" to 0.0, "values-night" to 1.0)) {
            val c = colors(dir)
            for (name in listOf("widget_text", "widget_muted", "overdue")) {
                val ratio = contrast(c.getValue(name), c.getValue("widget_background"), under)
                assertTrue("$dir $name contrast $ratio", ratio >= 4.5)
            }
        }
    }

    /** android-upcoming-calendar-widgets D4: the calendar's ring and dots stand out from the background (non-text, 3:1). */
    @Test fun calendarMarksVisibleInBothModes() {
        for ((dir, under) in listOf("values" to 0.0, "values-night" to 1.0)) {
            val c = colors(dir)
            val ratio = contrast(c.getValue("widget_accent"), c.getValue("widget_background"), under)
            assertTrue("$dir widget_accent contrast $ratio", ratio >= 3.0)
        }
    }

    /** android-widget-list D1: a row's colours are in its layout, so the launcher resolves them for the theme. */
    @Test fun rowsUseTheDayNightWidgetColours() {
        val row = File(res, "layout/widget_today_row.xml").readText()
        assertTrue(row.contains("android:textColor=\"@color/widget_text\""))
        assertTrue(row.contains("android:textColor=\"@color/overdue\""))
        assertTrue(row.contains("android:textColor=\"@color/widget_muted\""))
        assertTrue(File(res, "drawable/widget_circle.xml").readText().contains("@color/widget_muted"))
        // No colour is set from code: it would bake in the theme of the moment it was drawn (#966).
        for (file in listOf("Widgets.kt", "CalendarWidget.kt")) {
            val code = File("src/main/java/app/opentodo/$file").readText()
            assertNull(file, Regex("""setTextColor|setColorStateList|getColor\(|setInt\(""").find(code))
        }
    }

    @Test fun widgetTextNeverHardCoded() {
        for (name in listOf("widget_today.xml", "widget_today_row.xml", "widget_today_heading.xml", "widget_quick_add.xml", "widget_upcoming.xml", "widget_calendar.xml", "widget_calendar_day.xml", "widget_calendar_other.xml", "widget_calendar_today.xml")) {
            val layout = File(res, "layout/$name").readText()
            assertTrue(name, Regex("""textColor="(?!@color/widget_|@color/overdue")""").find(layout) == null)
        }
    }
}
