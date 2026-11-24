package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WebMicrophoneTest {
    private val server = "https://todo.example.com"

    /** The cases both apps read (the iPhone app's MediaCaptureTests too): microphone/cases.json. */
    @Test fun requestsFollowTheSharedCases() {
        val doc = JSONObject(javaClass.classLoader!!.getResource("microphone/cases.json")!!.readText())
        val origin = SignInFlow.originOf(doc.getString("server"))
        val cases = doc.getJSONArray("cases")
        assertTrue("the fixture has cases", cases.length() > 0)
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val resources = listOfNotNull(
                if (c.getBoolean("audio")) WebMicrophone.AUDIO else null,
                if (c.getBoolean("video")) "android.webkit.resource.VIDEO_CAPTURE" else null,
            ).toTypedArray()
            // Android's request names the asking frame's origin: an embedded frame's when the case has one.
            val asking = if (c.has("frame")) c.getString("frame") else c.getString("origin")
            val got = WebMicrophone.grant(origin, SignInFlow.originOf(asking), resources)
            val want = if (c.getString("grant") == "audio") arrayOf(WebMicrophone.AUDIO) else null
            assertArrayEquals(c.getString("name"), want, got)
        }
    }

    @Test fun aRequestWithoutAudioIsRefused() {
        assertNull(WebMicrophone.grant(server, server, null))
        assertNull(WebMicrophone.grant(null, server, arrayOf(WebMicrophone.AUDIO)))
    }

    // GitHub issue 1582: without MODIFY_AUDIO_SETTINGS the web view's getUserMedia fails at once
    // although RECORD_AUDIO is granted, and dictation reads "unavailable".
    @Test fun theManifestLetsTheWebViewOpenTheMicrophone() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        for (p in listOf("RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS")) {
            assertTrue("the manifest lacks $p", manifest.contains("<uses-permission android:name=\"android.permission.$p\" />"))
        }
    }
}
