package app.opentodo

/** What a web view rebuilt after its render process died opens (the render-recovery fix). */
object RenderRecovery {
    /**
     * The page the dead web view showed, when it was one of the server's; otherwise (a
     * sign-in provider's page, about:blank, nothing) the server's start page. Never the
     * launch intent: replaying a share or an opentodo-open link would act on it twice.
     */
    fun reloadUrl(last: String?, origin: String): String =
        if (last != null && SignInFlow.originOf(last) == origin) last else "$origin/"
}
