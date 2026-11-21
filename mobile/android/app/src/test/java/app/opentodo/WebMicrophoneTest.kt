package app.opentodo

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WebMicrophoneTest {
    private val server = "https://todo.example.com"

    @Test fun theServersPageMayRecordAudio() {
        assertArrayEquals(arrayOf(WebMicrophone.AUDIO), WebMicrophone.grant(server, server, arrayOf(WebMicrophone.AUDIO)))
    }

    @Test fun aCameraRequestIsGrantedTheMicrophoneOnly() {
        assertArrayEquals(
            arrayOf(WebMicrophone.AUDIO),
            WebMicrophone.grant(server, server, arrayOf("android.webkit.resource.VIDEO_CAPTURE", WebMicrophone.AUDIO)),
        )
    }

    @Test fun anotherOriginIsRefused() {
        assertNull(WebMicrophone.grant(server, "https://accounts.example.com", arrayOf(WebMicrophone.AUDIO)))
    }

    @Test fun aRequestWithoutAudioIsRefused() {
        assertNull(WebMicrophone.grant(server, server, arrayOf("android.webkit.resource.VIDEO_CAPTURE")))
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
