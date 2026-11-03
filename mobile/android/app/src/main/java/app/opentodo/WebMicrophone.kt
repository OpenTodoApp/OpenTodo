package app.opentodo

/**
 * Which microphone request the web view may be granted. Audio only, and only for
 * the configured server: a sign-in page never gets it, and a request that also
 * asks for the camera is granted the microphone alone. Pure so the decision is
 * unit-tested; the activity asks Android and then grants or refuses.
 */
object WebMicrophone {
    /** [android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE]. */
    const val AUDIO = "android.webkit.resource.AUDIO_CAPTURE"

    /** The resources to grant, or null to refuse. */
    fun grant(serverOrigin: String?, requestOrigin: String?, resources: Array<String>?): Array<String>? {
        if (serverOrigin.isNullOrEmpty() || requestOrigin != serverOrigin) return null
        if (resources == null || !resources.contains(AUDIO)) return null
        return arrayOf(AUDIO)
    }
}
