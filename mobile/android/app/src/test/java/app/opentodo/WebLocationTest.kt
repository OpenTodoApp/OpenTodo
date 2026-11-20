package app.opentodo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebLocationTest {
    private val server = "https://todo.example.com"

    @Test fun theServersPageMayAskForThePosition() {
        // The web view hands the origin with a trailing slash.
        assertTrue(WebLocation.allowed(false, server, "https://todo.example.com/"))
        assertTrue(WebLocation.allowed(false, server, "https://Todo.Example.com:443"))
        assertTrue(WebLocation.allowed(false, "http://localhost:8080", "http://localhost:8080/"))
    }

    @Test fun anotherOriginIsRefused() {
        assertFalse(WebLocation.allowed(false, server, "https://accounts.example.com/"))
        assertFalse(WebLocation.allowed(false, server, "http://todo.example.com/"))
        assertFalse(WebLocation.allowed(false, server, "https://todo.example.com:8443/"))
        assertFalse(WebLocation.allowed(false, server, "file:///android_asset/x"))
        assertFalse(WebLocation.allowed(false, server, null))
        assertFalse(WebLocation.allowed(false, null, server))
        assertFalse(WebLocation.allowed(false, "", server))
    }

    @Test fun thePlayBuildNeverAsks() {
        assertFalse(WebLocation.allowed(true, server, server))
    }

    /** What web/src/lib/locations.ts openInMapsHref hands over on a phone. */
    @Test fun theWebAppsMapLinkLeaves() {
        assertTrue(WebLocation.mapLink("geo:45.0703,7.6869?q=45.0703,7.6869"))
        assertTrue(WebLocation.mapLink("geo:-33.868820,151.209296?q=-33.86882,151.209296"))
        assertTrue(WebLocation.mapLink("geo:0,0"))
    }

    @Test fun otherGeoLinksAreRefused() {
        for (url in listOf(
            "geo:91,7?q=91,7",
            "geo:45,181",
            "geo:45.07,7.68?q=Pizza",
            "geo:45.07,7.68?z=3",
            "geo:45.07,7.68;u=10",
            "geo:0,0?q=1,2&x=javascript:alert(1)",
            "GEO:45,7",
            "geo:",
            "geo:abc,def",
            "geo:45.07,7.68 ",
            "https://www.openstreetmap.org/?mlat=45&mlon=7",
            "javascript:alert(1)",
        )) assertFalse(url, WebLocation.mapLink(url))
    }

    @Test fun withoutAMapsAppTheLinkOpensOpenStreetMap() {
        assertEquals(
            "https://www.openstreetmap.org/?mlat=45.0703&mlon=7.6869#map=17/45.0703/7.6869",
            WebLocation.fallback("geo:45.0703,7.6869?q=45.0703,7.6869"),
        )
        assertEquals(
            "https://www.openstreetmap.org/?mlat=-33.86882&mlon=151.209296#map=17/-33.86882/151.209296",
            WebLocation.fallback("geo:-33.868820,151.209296"),
        )
        assertEquals("https://www.openstreetmap.org/?mlat=0&mlon=0#map=17/0/0", WebLocation.fallback("geo:0,0"))
        assertNull(WebLocation.fallback("geo:45.07,7.68?q=Pizza"))
    }
}
