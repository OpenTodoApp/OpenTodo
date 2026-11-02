package app.opentodo

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** One location reminder the web app handed over (bridge v1 `scheduleGeofences`, location-reminders D3). */
data class ShellGeofence(
    val id: String,
    val taskId: String,
    val lat: Double,
    val lon: Double,
    /** Metres, 100 to 5,000. */
    val radius: Int,
    /** `arrive` or `leave`. */
    val on: String,
    val title: String?,
)

/** The argument of `scheduleGeofences`: [ask] lets a shell with a screen ask for the location permission. */
data class GeofencePayload(val ask: Boolean, val regions: List<ShellGeofence>)

/** A position: the ranking anchor (the only position the shell keeps, and only in its private storage). */
data class GeoPoint(val lat: Double, val lon: Double)

/**
 * Parsing, ranking and the firing rules of the location reminders; pure (no Android type)
 * so the rules are unit-tested against the shared bridge fixtures.
 */
object GeofenceSchedule {
    const val MAX = 100
    /** Proximity alerts registered for reminders; one more is the re-rank region. */
    const val MAX_REGISTERED = 19
    const val MIN_RADIUS = 100
    const val MAX_RADIUS = 5000
    /** The re-rank region around the ranking anchor: leaving it re-ranks. */
    const val RERANK_RADIUS_M = 1000f
    /** Crossings within this time of the last notification of a reminder are GPS jitter. */
    const val COOLDOWN_MS = 60L * 60 * 1000

    const val GRANTED = "granted"
    const val FOREGROUND_ONLY = "foreground-only"
    const val DENIED = "denied"
    const val UNAVAILABLE = "unavailable"

    private const val EARTH_RADIUS_M = 6_371_000.0

    private fun number(o: JSONObject, key: String): Double? {
        val v = o.opt(key)
        if (v !is Number) return null
        val d = v.toDouble()
        return if (d.isNaN() || d.isInfinite()) null else d
    }

    /**
     * The payload as the shell reads it: valid regions only (an id and a task id, a latitude
     * and longitude in range, a radius of 100 to 5,000 m, a direction), one per id, at most
     * [MAX], in payload order. Bad JSON or another version is an empty payload that asks nothing.
     */
    fun parse(json: String): GeofencePayload {
        val o = try { JSONObject(json) } catch (e: Exception) { return GeofencePayload(false, emptyList()) }
        if (o.opt("version") != 1) return GeofencePayload(false, emptyList())
        val ask = o.opt("ask") == true
        val arr = o.optJSONArray("regions") ?: return GeofencePayload(ask, emptyList())
        val seen = HashSet<String>()
        val out = ArrayList<ShellGeofence>()
        for (i in 0 until arr.length()) {
            if (out.size >= MAX) break
            val r = arr.optJSONObject(i) ?: continue
            val id = r.opt("id") as? String ?: continue
            val taskId = r.opt("taskId") as? String ?: continue
            if (id.isEmpty() || id.length > 100 || taskId.isEmpty() || taskId.length > 100) continue
            val lat = number(r, "lat") ?: continue
            val lon = number(r, "lon") ?: continue
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
            val radius = number(r, "radius") ?: continue
            if (radius < MIN_RADIUS || radius > MAX_RADIUS) continue
            val on = r.opt("on") as? String ?: continue
            if (on != "arrive" && on != "leave") continue
            if (!seen.add(id)) continue
            val title = (r.opt("title") as? String)?.take(200)?.ifEmpty { null }
            out.add(ShellGeofence(id, taskId, lat, lon, radius.roundToInt(), on, title))
        }
        return GeofencePayload(ask, out)
    }

    /** The stored form: a payload without `ask`, read back with [parse]. */
    fun toJson(list: List<ShellGeofence>): String {
        val arr = JSONArray()
        for (r in list) arr.put(JSONObject().apply {
            put("id", r.id); put("taskId", r.taskId); put("lat", r.lat); put("lon", r.lon)
            put("radius", r.radius); put("on", r.on)
            if (r.title != null) put("title", r.title)
        })
        return JSONObject().put("version", 1).put("regions", arr).toString()
    }

    /** Great-circle distance in metres (haversine). */
    fun distance(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val dLat = Math.toRadians(bLat - aLat)
        val dLon = Math.toRadians(bLon - aLon)
        val h = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(aLat)) * cos(Math.toRadians(bLat)) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(h)))
    }

    fun inside(r: ShellGeofence, p: GeoPoint): Boolean = distance(r.lat, r.lon, p.lat, p.lon) <= r.radius

    /**
     * The regions to register: at most [MAX_REGISTERED], the nearest to [from] (ties in payload
     * order); without a known position, the first ones in payload order.
     */
    fun pick(list: List<ShellGeofence>, from: GeoPoint?): List<ShellGeofence> {
        if (from == null || list.size <= MAX_REGISTERED) return list.take(MAX_REGISTERED)
        return list.sortedBy { distance(from.lat, from.lon, it.lat, it.lon) }.take(MAX_REGISTERED)
    }

    /** Whether a region needs the re-rank region: only when some handed regions are left out. */
    fun needsRerank(list: List<ShellGeofence>): Boolean = list.size > MAX_REGISTERED

    /** Same alert on the platform: a region whose id, centre and radius did not change stays registered. */
    fun sameAlert(a: ShellGeofence, b: ShellGeofence): Boolean = a.id == b.id && a.lat == b.lat && a.lon == b.lon && a.radius == b.radius

    /** The registered alerts to remove and the ones to add to go from [before] to [after]. */
    fun diff(before: List<ShellGeofence>, after: List<ShellGeofence>): Pair<List<ShellGeofence>, List<ShellGeofence>> {
        val remove = before.filter { b -> after.none { sameAlert(it, b) } }
        val add = after.filter { a -> before.none { sameAlert(it, a) } }
        return remove to add
    }

    /** A crossing in the reminder's direction: entering for `arrive`, leaving for `leave`. */
    fun matches(on: String, entering: Boolean): Boolean = if (entering) on == "arrive" else on == "leave"

    /** At most one notification an hour per reminder (a clock set back fires again). */
    fun shouldFire(lastFiredAt: Long?, now: Long): Boolean =
        lastFiredAt == null || now - lastFiredAt >= COOLDOWN_MS || now < lastFiredAt

    /** The bridge's answer from the permission state; below Android 10 [background] is the fine permission. */
    fun answer(available: Boolean, fine: Boolean, coarse: Boolean, background: Boolean): String = when {
        !available -> UNAVAILABLE
        fine && background -> GRANTED
        fine || coarse -> FOREGROUND_ONLY
        else -> DENIED
    }

    fun anchorToJson(p: GeoPoint?): String? = p?.let { JSONObject().put("lat", it.lat).put("lon", it.lon).toString() }

    fun anchorFromJson(json: String?): GeoPoint? {
        val o = try { JSONObject(json ?: return null) } catch (e: Exception) { return null }
        val lat = number(o, "lat") ?: return null
        val lon = number(o, "lon") ?: return null
        return GeoPoint(lat, lon)
    }

    /** The per-reminder time of the last notification, `{id: ms}`. */
    fun firedFromJson(json: String?): MutableMap<String, Long> {
        val out = HashMap<String, Long>()
        val o = try { JSONObject(json ?: return out) } catch (e: Exception) { return out }
        for (k in o.keys()) (o.opt(k) as? Number)?.let { out[k] = it.toLong() }
        return out
    }

    fun firedToJson(map: Map<String, Long>): String = JSONObject().apply { for ((k, v) in map) put(k, v) }.toString()

    /** The address a location reminder's Done or Dismiss opens in the background (shared fixture bridge/actions.json). */
    fun actionPath(id: String, action: String): String = ReminderSchedule.actionPath(id, action)
}
