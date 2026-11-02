package app.opentodo

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * Location reminders on this phone (location-reminders D3): the handed-over regions, of
 * which at most 19 are registered as platform proximity alerts (`LocationManager`, no
 * library), the nearest to the last known position, plus a 1 km re-rank region around
 * that position whose exit ranks them again. The position is kept only in memory and as
 * the ranking anchor in private storage; it is never logged or handed to the web view.
 */
object Geofences {
    private const val REGION_SCHEME = "opentodo-geofence"
    private const val RERANK_SCHEME = "opentodo-geofence-rerank"

    private fun manager(context: Context): LocationManager? = context.getSystemService(LocationManager::class.java)

    private fun granted(context: Context, permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** A location provider other than the passive one exists (a device without location has none). */
    fun available(context: Context): Boolean =
        manager(context)?.allProviders?.any { it != LocationManager.PASSIVE_PROVIDER } == true

    fun fine(context: Context): Boolean = granted(context, Manifest.permission.ACCESS_FINE_LOCATION)

    fun foreground(context: Context): Boolean = fine(context) || granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)

    /** "Allow all the time": its own permission from Android 10; before, the fine permission covers it. */
    fun background(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) else fine(context)

    /** The bridge's answer: `granted`, `foreground-only`, `denied` or `unavailable`. */
    fun state(context: Context): String =
        GeofenceSchedule.answer(available(context), fine(context), granted(context, Manifest.permission.ACCESS_COARSE_LOCATION), background(context))

    /**
     * Replaces the handed-over regions and the registered alerts. Only with background
     * location are regions stored and registered; otherwise every one is removed.
     */
    fun replace(context: Context, regions: List<ShellGeofence>): String {
        val state = state(context)
        val keep = if (state == GeofenceSchedule.GRANTED) regions else emptyList()
        val prefs = Prefs(context)
        prefs.geofences = GeofenceSchedule.toJson(keep)
        val ids = keep.map { it.id }.toSet()
        prefs.geofencesFired = GeofenceSchedule.firedToJson(GeofenceSchedule.firedFromJson(prefs.geofencesFired).filterKeys { it in ids })
        register(context, keep, fresh = false)
        return state
    }

    /** After a reboot or an app update the platform has forgotten every alert: register the stored regions again. */
    fun rearm(context: Context) = register(context, stored(context), fresh = true)

    /** The phone left the re-rank region: rank again from where it is now. */
    fun rerank(context: Context) = register(context, stored(context), fresh = false)

    /** Sign-out, lock, server change: every alert and every stored region, title and position go. */
    fun clear(context: Context) {
        register(context, emptyList(), fresh = false)
        val prefs = Prefs(context)
        prefs.geofences = GeofenceSchedule.toJson(emptyList())
        prefs.geofencesFired = "{}"
        prefs.geofenceAnchor = null
    }

    private fun stored(context: Context): List<ShellGeofence> = GeofenceSchedule.parse(Prefs(context).geofences).regions

    @SuppressLint("InlinedApi")
    private fun pending(context: Context, data: Uri): PendingIntent {
        // Mutable so the platform can add KEY_PROXIMITY_ENTERING; explicit, so no other app receives it.
        val intent = Intent(context, GeofenceReceiver::class.java).setData(data)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
    }

    private fun regionIntent(context: Context, id: String) = pending(context, Uri.parse("$REGION_SCHEME:" + Uri.encode(id)))

    private fun rerankIntent(context: Context) = pending(context, Uri.parse("$RERANK_SCHEME:anchor"))

    @SuppressLint("MissingPermission") // removing the app's own alert needs no location permission
    private fun removeAlert(lm: LocationManager, pi: PendingIntent) {
        try { lm.removeProximityAlert(pi) } catch (e: RuntimeException) { /* nothing registered */ }
    }

    /** The most recent last known position over the enabled providers; null without permission or fix. */
    @SuppressLint("MissingPermission")
    private fun lastKnown(context: Context, lm: LocationManager): GeoPoint? {
        if (!foreground(context)) return null
        var best: Location? = null
        for (provider in lm.getProviders(true)) {
            val l = try { lm.getLastKnownLocation(provider) } catch (e: RuntimeException) { null } ?: continue
            if (best == null || l.elapsedRealtimeNanos > best.elapsedRealtimeNanos) best = l
        }
        return best?.let { GeoPoint(it.latitude, it.longitude) }
    }

    /**
     * Registers the nearest regions of [list]: alerts that did not change stay as they are (so
     * the hourly hand-over does not report "entered" again while the phone is inside), the
     * others are removed or added. [fresh]: nothing is registered on the platform now.
     */
    @SuppressLint("MissingPermission") // only after state() found fine and background location granted
    private fun register(context: Context, list: List<ShellGeofence>, fresh: Boolean) {
        val prefs = Prefs(context)
        val before = if (fresh) emptyList() else GeofenceSchedule.parse(prefs.geofencesRegistered).regions
        val lm = manager(context)
        if (lm == null) {
            prefs.geofencesRegistered = GeofenceSchedule.toJson(emptyList())
            return
        }
        val allowed = list.isNotEmpty() && state(context) == GeofenceSchedule.GRANTED
        val anchor = if (allowed) lastKnown(context, lm) ?: GeofenceSchedule.anchorFromJson(prefs.geofenceAnchor) else null
        val chosen = if (allowed) GeofenceSchedule.pick(list, anchor) else emptyList()
        val (remove, add) = GeofenceSchedule.diff(before, chosen)
        for (r in remove) removeAlert(lm, regionIntent(context, r.id))
        removeAlert(lm, rerankIntent(context))
        val registered = chosen.filter { c -> before.any { GeofenceSchedule.sameAlert(it, c) } }.toMutableList()
        if (allowed) {
            val now = System.currentTimeMillis()
            val fired = GeofenceSchedule.firedFromJson(prefs.geofencesFired)
            for (r in add) {
                try {
                    lm.addProximityAlert(r.lat, r.lon, r.radius.toFloat(), -1L, regionIntent(context, r.id))
                    registered += r
                    // A new alert reports "entered" at its first fix when the phone is already inside:
                    // that is not an arrival, so it counts as the last notification.
                    if (r.on == "arrive" && anchor != null && GeofenceSchedule.inside(r, anchor)) fired[r.id] = now
                } catch (e: RuntimeException) { /* refused (permission revoked meanwhile): not registered */ }
            }
            prefs.geofencesFired = GeofenceSchedule.firedToJson(fired)
            if (anchor != null && GeofenceSchedule.needsRerank(list)) {
                try { lm.addProximityAlert(anchor.lat, anchor.lon, GeofenceSchedule.RERANK_RADIUS_M, -1L, rerankIntent(context)) } catch (e: RuntimeException) { /* the hourly hand-over ranks again */ }
            }
        }
        prefs.geofenceAnchor = GeofenceSchedule.anchorToJson(anchor)
        prefs.geofencesRegistered = GeofenceSchedule.toJson(registered)
    }

    /** A proximity alert fired: notify when the direction matches and the reminder was quiet for an hour. */
    fun crossed(context: Context, id: String, entering: Boolean) {
        val prefs = Prefs(context)
        val r = stored(context).firstOrNull { it.id == id }
        if (r == null) {
            manager(context)?.let { removeAlert(it, regionIntent(context, id)) }
            return
        }
        if (!GeofenceSchedule.matches(r.on, entering)) return
        val now = System.currentTimeMillis()
        val fired = GeofenceSchedule.firedFromJson(prefs.geofencesFired)
        if (!GeofenceSchedule.shouldFire(fired[id], now)) return
        fired[id] = now
        prefs.geofencesFired = GeofenceSchedule.firedToJson(fired)
        Notifier.location(context, r)
    }

    internal fun regionId(data: Uri): String? = if (data.scheme == REGION_SCHEME) data.schemeSpecificPart else null

    internal fun isRerank(data: Uri): Boolean = data.scheme == RERANK_SCHEME
}

/** The platform's proximity alerts: a region crossed, or the re-rank region left. Firing writes nothing. */
class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!intent.hasExtra(LocationManager.KEY_PROXIMITY_ENTERING)) return
        val entering = intent.getBooleanExtra(LocationManager.KEY_PROXIMITY_ENTERING, false)
        val data = intent.data ?: return
        if (Geofences.isRerank(data)) {
            if (!entering) Geofences.rerank(context)
            return
        }
        val id = Geofences.regionId(data)?.takeIf { it.isNotEmpty() } ?: return
        Geofences.crossed(context, id, entering)
    }
}
