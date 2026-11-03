package app.opentodo

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

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
}
