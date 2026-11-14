package app.opentodo

import org.json.JSONObject

/**
 * The UnifiedPush connector's rules (shell-push D2, specification AND_3.1.0), without an
 * Android class so every decision is unit-tested: the intent names, the stored registration,
 * what a distributor's answer does to it, and the JSON the bridge answers. [PushReceiver]
 * and [Push] only carry intents to and from these functions.
 */
object UnifiedPush {
    /** The activity of the distributor the user chose; its result carries a `pi` whose creator is that app. */
    const val LINK = "unifiedpush://link"

    // To the distributor.
    const val ACTION_REGISTER = "org.unifiedpush.android.distributor.REGISTER"
    const val ACTION_UNREGISTER = "org.unifiedpush.android.distributor.UNREGISTER"
    const val ACTION_MESSAGE_ACK = "org.unifiedpush.android.distributor.MESSAGE_ACK"

    // From the distributor (the manifest's filter of PushReceiver lists the same five).
    const val ACTION_NEW_ENDPOINT = "org.unifiedpush.android.connector.NEW_ENDPOINT"
    const val ACTION_REGISTRATION_FAILED = "org.unifiedpush.android.connector.REGISTRATION_FAILED"
    const val ACTION_MESSAGE = "org.unifiedpush.android.connector.MESSAGE"
    const val ACTION_UNREGISTERED = "org.unifiedpush.android.connector.UNREGISTERED"
    const val ACTION_TEMP_UNAVAILABLE = "org.unifiedpush.android.connector.TEMP_UNAVAILABLE"

    const val EXTRA_TOKEN = "token"
    const val EXTRA_VAPID = "vapid"
    const val EXTRA_PI = "pi"
    const val EXTRA_ENDPOINT = "endpoint"
    const val EXTRA_REASON = "reason"
    const val EXTRA_BYTES = "bytesMessage"
    const val EXTRA_ID = "id"

    // The errors of pushSubscribe (bridge fixture push-bridge.json).
    const val NO_DISTRIBUTOR = "no-distributor"
    const val CANCELLED = "cancelled"
    const val FAILED = "failed"
    const val ACTION_REQUIRED = "action-required"
    const val NETWORK = "network"
    val ERRORS = listOf(NO_DISTRIBUTOR, CANCELLED, FAILED, ACTION_REQUIRED, NETWORK)

    const val MAX_ENDPOINT = 1000
    /** A distributor that never answers a registration: the web app is told it failed. */
    const val ANSWER_LIMIT_MS = 30_000L

    /**
     * The registration as stored in the app's private settings: nothing (unregistered), a
     * token, distributor and keys without an endpoint (registering), or all of it (registered).
     */
    data class State(
        val token: String? = null,
        val distributor: String? = null,
        val vapid: String? = null,
        val endpoint: String? = null,
        val keys: WebPush.Keys? = null,
    ) {
        val registered: Boolean get() = token != null && distributor != null && endpoint != null && keys != null

        fun toJson(): String = JSONObject().apply {
            token?.let { put("token", it) }
            distributor?.let { put("distributor", it) }
            vapid?.let { put("vapid", it) }
            endpoint?.let { put("endpoint", it) }
            keys?.let { put("privateKey", it.privateKey); put("p256dh", it.p256dh); put("auth", it.auth) }
        }.toString()

        companion object {
            /** The stored registration; anything unreadable or incomplete is no registration. */
            fun parse(json: String?): State {
                val o = try { JSONObject(json ?: return State()) } catch (e: Exception) { return State() }
                fun text(key: String): String? = if (o.has(key) && !o.isNull(key)) o.optString(key).ifEmpty { null } else null
                val token = text("token") ?: return State()
                val distributor = text("distributor") ?: return State()
                val keys = WebPush.Keys(text("privateKey") ?: return State(), text("p256dh") ?: return State(), text("auth") ?: return State())
                return State(token, distributor, text("vapid"), text("endpoint")?.takeIf { validEndpoint(it) }, keys)
            }
        }
    }

    /** What a distributor said, with the token it said it for. */
    sealed class Event {
        abstract val token: String?
        data class NewEndpoint(override val token: String?, val endpoint: String?) : Event()
        data class RegistrationFailed(override val token: String?, val reason: String?) : Event()
        data class Unregistered(override val token: String?) : Event()
        data class TempUnavailable(override val token: String?) : Event()
    }

    /** The registration after an event, and what a waiting `pushSubscribe` is answered. */
    data class Step(val state: State, val answer: String)

    /** The event of a broadcast's action and extras; null for MESSAGE and for anything unknown. */
    fun event(action: String?, token: String?, endpoint: String?, reason: String?): Event? = when (action) {
        ACTION_NEW_ENDPOINT -> Event.NewEndpoint(token, endpoint)
        ACTION_REGISTRATION_FAILED -> Event.RegistrationFailed(token, reason)
        ACTION_UNREGISTERED -> Event.Unregistered(token)
        ACTION_TEMP_UNAVAILABLE -> Event.TempUnavailable(token)
        else -> null
    }

    /** Only an intent that carries the stored token is the distributor's: the receiver is exported. */
    fun accepts(state: State, token: String?): Boolean = state.token != null && token == state.token

    /**
     * The next registration. Null when the event is ignored: a foreign token, or no registration.
     * A new endpoint is kept (https only); a failed first registration and an unregistration
     * forget the token and the keys; a failure after an endpoint and "temporarily unavailable"
     * keep what there is.
     */
    fun next(state: State, event: Event): Step? {
        if (!accepts(state, event.token)) return null
        return when (event) {
            is Event.NewEndpoint -> {
                val endpoint = event.endpoint
                if (endpoint == null || !validEndpoint(endpoint)) Step(state, error(FAILED))
                else state.copy(endpoint = endpoint).let { Step(it, subscription(it) ?: error(FAILED)) }
            }
            is Event.RegistrationFailed -> Step(if (state.endpoint == null) State() else state, error(failure(event.reason)))
            is Event.Unregistered -> Step(State(), error(FAILED))
            is Event.TempUnavailable -> Step(state, error(NETWORK))
        }
    }

    /** REGISTRATION_FAILED's reason as the bridge's error. */
    fun failure(reason: String?): String = when (reason) {
        "NETWORK" -> NETWORK
        "ACTION_REQUIRED" -> ACTION_REQUIRED
        // INTERNAL_ERROR, VAPID_REQUIRED (the key is always sent) and anything newer.
        else -> FAILED
    }

    /**
     * After the answer: a `pushSubscribe` that was waiting ([waited]) and did not get its
     * endpoint leaves no half registration behind, so an endpoint that comes later is not the
     * app's (the web app was told the registration failed).
     */
    fun settled(state: State, waited: Boolean): State = if (waited && !state.registered) State() else state

    /** No answer within [ANSWER_LIMIT_MS]: a registration that never got an endpoint is forgotten. */
    fun timedOut(state: State): State = if (state.endpoint == null) State() else state

    /** What `pushSubscribe` does first. */
    sealed class Plan {
        data class Answer(val json: String) : Plan()
        /** Start the distributor's link activity (the visible app only). */
        object Link : Plan()
        data class Register(val distributor: String) : Plan()
    }

    /**
     * [linkable]: an activity answers [LINK]. [receivers]: the packages with a receiver for
     * REGISTER (older distributors have no link activity). A registration for the same server
     * key is answered as it is; a background run ([hasScreen] false) never starts anything.
     * Several distributors and no way to ask which: nothing is chosen for the user.
     */
    fun plan(state: State, vapid: String, hasScreen: Boolean, linkable: Boolean, receivers: List<String>): Plan = when {
        !validVapid(vapid) -> Plan.Answer(error(FAILED))
        state.registered && state.vapid == vapid -> Plan.Answer(subscription(state) ?: error(FAILED))
        !hasScreen -> Plan.Answer(error(FAILED))
        linkable -> Plan.Link
        receivers.size == 1 -> Plan.Register(receivers[0])
        receivers.isEmpty() -> Plan.Answer(error(NO_DISTRIBUTOR))
        else -> Plan.Answer(error(FAILED))
    }

    /** After the link activity: [ok] is RESULT_OK, [distributor] the creator of its `pi`. */
    fun afterLink(ok: Boolean, distributor: String?): Plan = when {
        !ok -> Plan.Answer(error(CANCELLED))
        distributor.isNullOrEmpty() -> Plan.Answer(error(FAILED))
        else -> Plan.Register(distributor)
    }

    /** A new registration waiting for its endpoint: a new token and new keys every time. */
    fun begin(distributor: String, vapid: String, token: String, keys: WebPush.Keys): State =
        State(token = token, distributor = distributor, vapid = vapid, endpoint = null, keys = keys)

    /** A push endpoint the server accepts: https, of a sane length. */
    fun validEndpoint(endpoint: String): Boolean =
        endpoint.length <= MAX_ENDPOINT && endpoint.startsWith("https://") && endpoint.length > "https://".length &&
            endpoint.none { it.isWhitespace() || it.isISOControl() }

    /** The server's VAPID public key: 87 characters of base64url, a 65-byte uncompressed point. */
    fun validVapid(vapid: String): Boolean {
        if (vapid.length != 87) return false
        val bytes = WebPush.decode(vapid) ?: return false
        return bytes.size == 65 && bytes[0].toInt() == 4
    }

    // ---- What the bridge answers (the private key is never part of it) ----

    fun error(code: String): String = JSONObject().put("error", code).toString()

    /** `{endpoint, p256dh, auth}` of a registered state, else null. */
    fun subscription(state: State): String? {
        if (!state.registered) return null
        return JSONObject().put("endpoint", state.endpoint).put("p256dh", state.keys!!.p256dh).put("auth", state.keys.auth).toString()
    }

    /** `pushState`: [available] is whether a distributor is installed. */
    fun stateJson(available: Boolean, state: State): String {
        val o = JSONObject().put("available", available).put("registered", state.registered)
        if (state.registered) o.put("endpoint", state.endpoint).put("p256dh", state.keys!!.p256dh).put("auth", state.keys.auth)
        return o.toString()
    }

    // ---- A decrypted message ----

    sealed class Message {
        /** `{type:"reminder", reminderId, taskId, fireAt, title?}`: shown as the alarm shows it. */
        data class Reminder(val reminder: ShellReminder) : Message()
        /** The server's test push (`{type:"test"}`): the test notification. */
        object Test : Message()
    }

    /** The message of a decrypted payload; null for anything that is neither a reminder nor the test. */
    fun message(plain: ByteArray, now: Long): Message? {
        val o = try { JSONObject(String(plain, Charsets.UTF_8)) } catch (e: Exception) { return null }
        return when (o.optString("type")) {
            "test" -> Message.Test
            "reminder" -> {
                val id = o.optString("reminderId")
                val taskId = o.optString("taskId")
                if (id.isEmpty() || id.length > 100 || taskId.isEmpty() || taskId.length > 100) return null
                val fireAt = o.optLong("fireAt", -1).let { if (it < 0) now else it }
                val title = if (o.has("title") && !o.isNull("title")) o.optString("title").take(200).ifEmpty { null } else null
                Message.Reminder(ShellReminder(id, taskId, fireAt, title))
            }
            else -> null
        }
    }
}
