package app.opentodo

import java.util.Locale

/**
 * The web app's two uses of location in the shell (OpenSpec change android-location-and-map):
 * "Use my location" asks the web view for the position, and "Open in maps" on a phone is a
 * `geo:` link. Pure Kotlin, no android.net.Uri, so both decisions are unit-tested; the
 * activity asks Android and starts the maps app.
 */
object WebLocation {
    /** The page may be given the position: only the configured server, and never in the Play build (no location permission). */
    fun allowed(play: Boolean, serverOrigin: String?, requestOrigin: String?): Boolean {
        if (play || serverOrigin.isNullOrEmpty() || requestOrigin == null) return false
        return SignInFlow.originOf(requestOrigin) == serverOrigin
    }

    private const val NUM = """-?\d{1,3}(?:\.\d{1,15})?"""
    private val GEO = Regex("""^geo:($NUM),($NUM)(?:\?q=($NUM),($NUM))?$""")

    /** The point of a `geo:` link of the web app's shape (`geo:lat,lon` or `geo:lat,lon?q=lat,lon`), or null. */
    fun point(url: String): Pair<Double, Double>? {
        val m = GEO.matchEntire(url) ?: return null
        val nums = m.groupValues.drop(1).filter { it.isNotEmpty() }.map { it.toDouble() }
        for (i in nums.indices step 2) {
            if (nums[i] < -90 || nums[i] > 90 || nums[i + 1] < -180 || nums[i + 1] > 180) return null
        }
        return nums[0] to nums[1]
    }

    /** A `geo:` link the shell hands to the system: a maps app opens it. */
    fun mapLink(url: String): Boolean = point(url) != null

    /** Where a `geo:` link goes when no app on the phone opens it: the same point on openstreetmap.org. */
    fun fallback(url: String): String? {
        val (lat, lon) = point(url) ?: return null
        val a = format(lat)
        val o = format(lon)
        return "https://www.openstreetmap.org/?mlat=$a&mlon=$o#map=17/$a/$o"
    }

    private fun format(v: Double): String =
        String.format(Locale.ROOT, "%.6f", v).trimEnd('0').trimEnd('.').let { if (it == "-0") "0" else it }
}
