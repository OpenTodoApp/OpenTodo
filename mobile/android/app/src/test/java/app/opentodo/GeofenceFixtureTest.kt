package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * location-reminders D3: the `scheduleGeofences` payloads the web app hands over (the
 * shared bridge fixtures, written by web/src/lib/shellBridge.fixture.test.ts), and the
 * shell's ranking, direction and cooldown rules.
 */
class GeofenceFixtureTest {
    private fun fixture(name: String): JSONObject {
        val url = javaClass.classLoader!!.getResource("bridge/$name")
        assertNotNull("missing bridge fixture $name (web: UPDATE_BRIDGE_FIXTURES=1)", url)
        return JSONObject(url!!.readText())
    }

    private fun check(name: String) {
        val f = fixture(name)
        assertEquals(name, "scheduleGeofences", f.getString("method"))
        val want = f.getJSONObject("expect")
        val regions = want.getJSONArray("regions")
        val expected = GeofencePayload(want.getBoolean("ask"), (0 until regions.length()).map { i ->
            val o = regions.getJSONObject(i)
            ShellGeofence(
                o.getString("id"), o.getString("taskId"), o.getDouble("lat"), o.getDouble("lon"),
                o.getInt("radius"), o.getString("on"), if (o.isNull("title")) null else o.getString("title"),
            )
        })
        assertEquals(name, expected, GeofenceSchedule.parse(f.getString("payload")))
    }

    @Test fun regions() = check("geofences.json")

    @Test fun regionsOfAnEncryptedAccountCarryNoTitles() = check("geofences-encrypted.json")

    @Test fun signOutEmptiesTheRegions() = check("geofences-signed-out.json")

    @Test fun turningOnAsksEvenWithoutRegions() = check("geofences-ask.json")

    @Test fun storedRegionsReadBackAsHandedOver() {
        val list = GeofenceSchedule.parse(fixture("geofences.json").getString("payload")).regions
        assertEquals(list, GeofenceSchedule.parse(GeofenceSchedule.toJson(list)).regions)
        assertFalse(GeofenceSchedule.parse(GeofenceSchedule.toJson(list)).ask)
    }

    /** From either city the 19 registered are that city's nearest; travelling re-ranks to the other city's. */
    @Test fun theNearest19AreRegistered() {
        val f = fixture("geofences-two-cities.json")
        val list = GeofenceSchedule.parse(f.getString("payload")).regions
        assertEquals(40, list.size)
        assertTrue(GeofenceSchedule.needsRerank(list))
        val cases = f.getJSONArray("expect")
        assertTrue(cases.length() >= 2)
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val from = c.getJSONObject("from")
            val want = c.getJSONArray("registered")
            val got = GeofenceSchedule.pick(list, GeoPoint(from.getDouble("lat"), from.getDouble("lon")))
            assertEquals(GeofenceSchedule.MAX_REGISTERED, got.size)
            assertEquals(from.toString(), (0 until want.length()).map { want.getString(it) }.toSet(), got.map { it.id }.toSet())
        }
    }

    @Test fun withoutAPositionTheFirst19InPayloadOrder() {
        val list = GeofenceSchedule.parse(fixture("geofences-two-cities.json").getString("payload")).regions
        assertEquals(list.take(19).map { it.id }, GeofenceSchedule.pick(list, null).map { it.id })
    }

    /** The hourly hand-over keeps unchanged alerts; a moved place is removed and added again. */
    @Test fun unchangedAlertsStayRegistered() {
        val a = ShellGeofence("a", "t", 45.0, 9.0, 150, "arrive", "A")
        val b = ShellGeofence("b", "t", 45.1, 9.1, 150, "leave", null)
        val movedB = b.copy(lat = 45.2)
        val (remove, add) = GeofenceSchedule.diff(listOf(a, b), listOf(a.copy(title = "renamed"), movedB))
        assertEquals(listOf(b), remove)
        assertEquals(listOf(movedB), add)
    }

    @Test fun direction() {
        assertTrue(GeofenceSchedule.matches("arrive", entering = true))
        assertFalse(GeofenceSchedule.matches("arrive", entering = false))
        assertTrue(GeofenceSchedule.matches("leave", entering = false))
        assertFalse(GeofenceSchedule.matches("leave", entering = true))
    }

    /** reminders "GPS jitter at the edge": three crossings within ten minutes show one notification. */
    @Test fun cooldown() {
        val t0 = 1_792_670_400_000L
        var last: Long? = null
        var shown = 0
        for (t in listOf(t0, t0 + 4 * 60_000, t0 + 10 * 60_000)) {
            if (GeofenceSchedule.shouldFire(last, t)) { shown++; last = t }
        }
        assertEquals(1, shown)
        assertTrue(GeofenceSchedule.shouldFire(t0, t0 + GeofenceSchedule.COOLDOWN_MS))
        assertFalse(GeofenceSchedule.shouldFire(t0, t0 + GeofenceSchedule.COOLDOWN_MS - 1))
    }

    @Test fun malformedEntriesAreIgnored() {
        val json = """{"version":1,"regions":[
          {"id":"ok","taskId":"t","lat":45,"lon":9,"radius":100,"on":"arrive"},
          {"id":"small","taskId":"t","lat":45,"lon":9,"radius":50,"on":"arrive"},
          {"id":"big","taskId":"t","lat":45,"lon":9,"radius":5001,"on":"arrive"},
          {"id":"lat","taskId":"t","lat":91,"lon":9,"radius":150,"on":"arrive"},
          {"id":"str","taskId":"t","lat":"45","lon":9,"radius":150,"on":"arrive"},
          {"id":"dir","taskId":"t","lat":45,"lon":9,"radius":150,"on":"near"},
          {"taskId":"t","lat":45,"lon":9,"radius":150,"on":"arrive"},
          {"id":"ok","taskId":"t2","lat":46,"lon":9,"radius":150,"on":"leave"},
          {"id":"max","taskId":"t","lat":-90,"lon":180,"radius":5000,"on":"leave","title":""}
        ]}"""
        val got = GeofenceSchedule.parse(json).regions
        assertEquals(listOf("ok", "max"), got.map { it.id })
        assertEquals(null, got[1].title)
        assertTrue(GeofenceSchedule.parse("not json").regions.isEmpty())
        assertTrue(GeofenceSchedule.parse("""{"version":2,"regions":[{"id":"a","taskId":"t","lat":45,"lon":9,"radius":150,"on":"arrive"}]}""").regions.isEmpty())
    }

    @Test fun atMost100() {
        val json = (0 until 150).joinToString(",", """{"version":1,"regions":[""", "]}") {
            """{"id":"r$it","taskId":"t","lat":45,"lon":9,"radius":150,"on":"arrive"}"""
        }
        assertEquals(GeofenceSchedule.MAX, GeofenceSchedule.parse(json).regions.size)
    }

    @Test fun distanceAndInside() {
        // Milan Duomo to near Milano Centrale: about 2.7 km.
        val d = GeofenceSchedule.distance(45.4642, 9.19, 45.4861, 9.2042)
        assertTrue("$d", d in 2_400.0..2_800.0)
        val r = ShellGeofence("a", "t", 45.4642, 9.19, 150, "arrive", null)
        assertTrue(GeofenceSchedule.inside(r, GeoPoint(45.4650, 9.19)))
        assertFalse(GeofenceSchedule.inside(r, GeoPoint(45.4700, 9.19)))
    }

    @Test fun permissionAnswers() {
        assertEquals("unavailable", GeofenceSchedule.answer(available = false, fine = true, coarse = true, background = true))
        assertEquals("granted", GeofenceSchedule.answer(available = true, fine = true, coarse = true, background = true))
        assertEquals("foreground-only", GeofenceSchedule.answer(available = true, fine = true, coarse = true, background = false))
        assertEquals("foreground-only", GeofenceSchedule.answer(available = true, fine = false, coarse = true, background = false))
        assertEquals("denied", GeofenceSchedule.answer(available = true, fine = false, coarse = false, background = false))
    }

    @Test fun storedStateRoundTrips() {
        assertEquals(GeoPoint(52.52, 13.405), GeofenceSchedule.anchorFromJson(GeofenceSchedule.anchorToJson(GeoPoint(52.52, 13.405))))
        assertEquals(null, GeofenceSchedule.anchorFromJson(null))
        assertEquals(mapOf("a" to 5L), GeofenceSchedule.firedFromJson(GeofenceSchedule.firedToJson(mapOf("a" to 5L))))
        assertTrue(GeofenceSchedule.firedFromJson("bad").isEmpty())
    }

    /** The Done and Dismiss buttons of a location reminder open the addresses the web app reads. */
    @Test fun locationActionAddresses() {
        val actions = fixture("actions.json").getJSONArray("locationActions")
        assertTrue(actions.length() >= 2)
        for (i in 0 until actions.length()) {
            val a = actions.getJSONObject(i)
            assertEquals(a.getString("path"), GeofenceSchedule.actionPath(a.getString("id"), a.getString("action")))
        }
    }
}
