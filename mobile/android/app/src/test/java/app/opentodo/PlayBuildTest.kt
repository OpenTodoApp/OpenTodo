package app.opentodo

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Google Play build (play-location-later): the page learns `store: 'play'` from the bridge,
 * so Settings explains that location reminders come to the Play version later. The build for
 * GitHub and F-Droid injects the same object as before, without the field.
 */
class PlayBuildTest {
    @Test fun thePlayBuildSaysSoInTheBridge() {
        val play = Bridge.script("0.21.0", listOf("reminders", "widgets"), play = true)
        assertTrue(play, play.contains("store: 'play',"))
    }

    @Test fun theOtherBuildDoesNotNameAStore() {
        val direct = Bridge.script("0.21.0", listOf("reminders", "widgets", "geofences"))
        assertFalse(direct, direct.contains("store:"))
        assertTrue(direct, direct.contains("\"geofences\""))
    }

    @Test fun thisBuildIsNotThePlayBuild() {
        // Unit tests run the debug build without -Popentodo.play=true.
        assertFalse(BuildConfig.PLAY_BUILD)
    }
}
