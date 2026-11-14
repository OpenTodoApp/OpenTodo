package app.opentodo

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * shell-push D2 and D5: the registration's state machine, the token check of the exported
 * receiver, and the JSON the bridge answers (shared fixture `bridge/push-bridge.json`,
 * written by the web app's fixture test).
 */
class UnifiedPushTest {
    private val keys = WebPush.Keys("private-key", "p256dh-key", "auth-secret")
    private val vapid = WebPush.encode(byteArrayOf(4) + ByteArray(64) { 7 })
    private val endpoint = "https://ntfy.example/upAbC123"
    private val unregistered = UnifiedPush.State()
    private val registering = UnifiedPush.begin("org.example.distributor", vapid, "token-1", keys)
    private val registered = registering.copy(endpoint = endpoint)

    private fun json(text: String?): JSONObject = JSONObject(text!!)

    private fun errorOf(text: String?): String = json(text).getString("error")

    /** A flat object's keys and values (strings and booleans), whatever their order. */
    private fun flat(o: JSONObject): Map<String, Any> = o.keys().asSequence().associateWith { o.get(it) }

    private fun assertSameJson(want: JSONObject, got: String?) = assertEquals(flat(want), flat(json(got)))

    // ---- The stored registration ----

    @Test fun theThreeStates() {
        assertFalse(unregistered.registered)
        assertFalse(registering.registered)
        assertTrue(registered.registered)
        assertEquals("token-1", registering.token)
        assertNull(registering.endpoint)
    }

    @Test fun theRegistrationSurvivesStorage() {
        for (state in listOf(registering, registered)) assertEquals(state, UnifiedPush.State.parse(state.toJson()))
        assertEquals(unregistered, UnifiedPush.State.parse(unregistered.toJson()))
        assertEquals(unregistered, UnifiedPush.State.parse(null))
        assertEquals(unregistered, UnifiedPush.State.parse(""))
        assertEquals(unregistered, UnifiedPush.State.parse("not json"))
        // Half a registration is none: a token without keys could never decrypt.
        assertEquals(unregistered, UnifiedPush.State.parse("""{"token":"t","distributor":"d","endpoint":"$endpoint"}"""))
        assertEquals(unregistered, UnifiedPush.State.parse("""{"distributor":"d","privateKey":"a","p256dh":"b","auth":"c"}"""))
        // A stored endpoint that is not https is not an endpoint.
        val plain = JSONObject(registered.toJson()).put("endpoint", "http://ntfy.example/up").toString()
        assertEquals(registering, UnifiedPush.State.parse(plain))
    }

    // ---- The distributor's answers ----

    @Test fun aNewEndpointRegisters() {
        val step = UnifiedPush.next(registering, UnifiedPush.Event.NewEndpoint("token-1", endpoint))!!
        assertEquals(registered, step.state)
        assertSameJson(JSONObject().put("endpoint", endpoint).put("p256dh", "p256dh-key").put("auth", "auth-secret"), step.answer)
        assertFalse("the private key never crosses the bridge", step.answer.contains("private"))
    }

    @Test fun aRotatedEndpointReplacesTheOldOne() {
        val step = UnifiedPush.next(registered, UnifiedPush.Event.NewEndpoint("token-1", "https://ntfy.example/upNew"))!!
        assertEquals("https://ntfy.example/upNew", step.state.endpoint)
        assertTrue(step.state.registered)
        assertEquals(registered.keys, step.state.keys)
        assertEquals("https://ntfy.example/upNew", json(step.answer).getString("endpoint"))
    }

    @Test fun anEndpointThatIsNotHttpsIsNotKept() {
        for (bad in listOf(null, "", "http://ntfy.example/up", "https://", "ftp://x/y", "javascript:alert(1)", "https://ntfy.example/a b", "https://x/" + "a".repeat(1000))) {
            val first = UnifiedPush.next(registering, UnifiedPush.Event.NewEndpoint("token-1", bad))!!
            assertEquals("$bad", registering, first.state)
            assertEquals("$bad", "failed", errorOf(first.answer))
            val later = UnifiedPush.next(registered, UnifiedPush.Event.NewEndpoint("token-1", bad))!!
            assertEquals("$bad", registered, later.state)
        }
        assertTrue(UnifiedPush.validEndpoint("https://x/" + "a".repeat(990)))
        assertFalse(UnifiedPush.validEndpoint("https://x/" + "a".repeat(991)))
    }

    @Test fun aFailedRegistrationForgetsTheTokenAndKeys() {
        val reasons = mapOf("INTERNAL_ERROR" to "failed", "NETWORK" to "network", "ACTION_REQUIRED" to "action-required", "VAPID_REQUIRED" to "failed", "SOMETHING_NEW" to "failed", null to "failed")
        for ((reason, error) in reasons) {
            val step = UnifiedPush.next(registering, UnifiedPush.Event.RegistrationFailed("token-1", reason))!!
            assertEquals("$reason", unregistered, step.state)
            assertEquals("$reason", error, errorOf(step.answer))
            assertEquals("$reason", error, UnifiedPush.failure(reason))
        }
    }

    @Test fun aFailureAfterAnEndpointKeepsTheRegistration() {
        val step = UnifiedPush.next(registered, UnifiedPush.Event.RegistrationFailed("token-1", "NETWORK"))!!
        assertEquals(registered, step.state)
        assertEquals("network", errorOf(step.answer))
    }

    @Test fun unregisteredForgetsEverything() {
        for (state in listOf(registering, registered)) {
            val step = UnifiedPush.next(state, UnifiedPush.Event.Unregistered("token-1"))!!
            assertEquals(unregistered, step.state)
            assertEquals("failed", errorOf(step.answer))
        }
    }

    @Test fun temporarilyUnavailableKeepsTheState() {
        for (state in listOf(registering, registered)) {
            val step = UnifiedPush.next(state, UnifiedPush.Event.TempUnavailable("token-1"))!!
            assertEquals(state, step.state)
            assertEquals("network", errorOf(step.answer))
        }
    }

    @Test fun aForeignTokenIsIgnored() {
        val events = { token: String? ->
            listOf(
                UnifiedPush.Event.NewEndpoint(token, "https://evil.example/up"),
                UnifiedPush.Event.RegistrationFailed(token, "INTERNAL_ERROR"),
                UnifiedPush.Event.Unregistered(token),
                UnifiedPush.Event.TempUnavailable(token),
            )
        }
        for (token in listOf(null, "", "token-2", "TOKEN-1", "token-1 ")) {
            for (state in listOf(registering, registered)) {
                for (event in events(token)) assertNull("$event", UnifiedPush.next(state, event))
                assertFalse("a message with the token $token", UnifiedPush.accepts(state, token))
            }
        }
        // Without a registration nothing is accepted, not even a missing token.
        for (token in listOf(null, "", "token-1")) {
            for (event in events(token)) assertNull("$event", UnifiedPush.next(unregistered, event))
            assertFalse(UnifiedPush.accepts(unregistered, token))
        }
        assertTrue(UnifiedPush.accepts(registered, "token-1"))
        assertTrue(UnifiedPush.accepts(registering, "token-1"))
    }

    @Test fun broadcastsBecomeEvents() {
        assertEquals(UnifiedPush.Event.NewEndpoint("t", endpoint), UnifiedPush.event("org.unifiedpush.android.connector.NEW_ENDPOINT", "t", endpoint, null))
        assertEquals(UnifiedPush.Event.RegistrationFailed("t", "NETWORK"), UnifiedPush.event("org.unifiedpush.android.connector.REGISTRATION_FAILED", "t", null, "NETWORK"))
        assertEquals(UnifiedPush.Event.Unregistered("t"), UnifiedPush.event("org.unifiedpush.android.connector.UNREGISTERED", "t", null, null))
        assertEquals(UnifiedPush.Event.TempUnavailable("t"), UnifiedPush.event("org.unifiedpush.android.connector.TEMP_UNAVAILABLE", "t", null, null))
        // A message is not a registration event, and neither is anything else.
        assertNull(UnifiedPush.event("org.unifiedpush.android.connector.MESSAGE", "t", null, null))
        assertNull(UnifiedPush.event("app.opentodo.PUSH_IDENTITY", "t", null, null))
        assertNull(UnifiedPush.event(null, "t", null, null))
    }

    @Test fun theIntentNamesOfTheSpecification() {
        assertEquals("unifiedpush://link", UnifiedPush.LINK)
        assertEquals("org.unifiedpush.android.distributor.REGISTER", UnifiedPush.ACTION_REGISTER)
        assertEquals("org.unifiedpush.android.distributor.UNREGISTER", UnifiedPush.ACTION_UNREGISTER)
        assertEquals("org.unifiedpush.android.distributor.MESSAGE_ACK", UnifiedPush.ACTION_MESSAGE_ACK)
        assertEquals("org.unifiedpush.android.connector.MESSAGE", UnifiedPush.ACTION_MESSAGE)
        assertEquals(listOf("token", "vapid", "pi", "endpoint", "reason", "bytesMessage", "id"), listOf(
            UnifiedPush.EXTRA_TOKEN, UnifiedPush.EXTRA_VAPID, UnifiedPush.EXTRA_PI, UnifiedPush.EXTRA_ENDPOINT,
            UnifiedPush.EXTRA_REASON, UnifiedPush.EXTRA_BYTES, UnifiedPush.EXTRA_ID,
        ))
    }

    @Test fun noAnswerInTimeForgetsARegistrationWithoutAnEndpoint() {
        assertEquals(unregistered, UnifiedPush.timedOut(registering))
        assertEquals(registered, UnifiedPush.timedOut(registered))
        assertEquals(unregistered, UnifiedPush.timedOut(unregistered))
    }

    @Test fun aSubscribeThatFailedLeavesNoHalfRegistration() {
        // "Temporarily unavailable" while the web app waits: it is told `network`, and the token and keys go.
        val step = UnifiedPush.next(registering, UnifiedPush.Event.TempUnavailable("token-1"))!!
        assertEquals(unregistered, UnifiedPush.settled(step.state, waited = true))
        // Nobody waiting (the app was closed meanwhile): the registration stays for the endpoint to come.
        assertEquals(registering, UnifiedPush.settled(step.state, waited = false))
        // A registration with an endpoint is never dropped by an answer.
        assertEquals(registered, UnifiedPush.settled(registered, waited = true))
        assertEquals(registered, UnifiedPush.settled(registered, waited = false))
        assertEquals(unregistered, UnifiedPush.settled(unregistered, waited = true))
    }

    // ---- pushSubscribe ----

    private fun plan(state: UnifiedPush.State, hasScreen: Boolean, linkable: Boolean, receivers: List<String>, key: String = vapid) =
        UnifiedPush.plan(state, key, hasScreen, linkable, receivers)

    @Test fun theVisibleAppAsksTheDistributorsLinkScreen() {
        assertEquals(UnifiedPush.Plan.Link, plan(unregistered, hasScreen = true, linkable = true, receivers = listOf("a", "b")))
        assertEquals(UnifiedPush.Plan.Link, plan(registering, hasScreen = true, linkable = true, receivers = emptyList()))
    }

    @Test fun oneOlderDistributorIsUsedAndSeveralAreNotChosenBetween() {
        assertEquals(UnifiedPush.Plan.Register("a"), plan(unregistered, hasScreen = true, linkable = false, receivers = listOf("a")))
        val none = plan(unregistered, hasScreen = true, linkable = false, receivers = emptyList()) as UnifiedPush.Plan.Answer
        assertEquals("no-distributor", errorOf(none.json))
        val several = plan(unregistered, hasScreen = true, linkable = false, receivers = listOf("a", "b")) as UnifiedPush.Plan.Answer
        assertEquals("failed", errorOf(several.json))
    }

    @Test fun aBackgroundRunNeverStartsAnything() {
        for (linkable in listOf(true, false)) for (receivers in listOf(emptyList(), listOf("a"), listOf("a", "b"))) {
            for (state in listOf(unregistered, registering)) {
                val answer = plan(state, hasScreen = false, linkable = linkable, receivers = receivers) as UnifiedPush.Plan.Answer
                assertEquals("failed", errorOf(answer.json))
            }
            // With a registration it answers the subscription, as the visible app does.
            for (hasScreen in listOf(true, false)) {
                val answer = plan(registered, hasScreen = hasScreen, linkable = linkable, receivers = receivers) as UnifiedPush.Plan.Answer
                assertEquals(endpoint, json(answer.json).getString("endpoint"))
            }
        }
    }

    @Test fun anotherServerKeyRegistersAgain() {
        val other = WebPush.encode(byteArrayOf(4) + ByteArray(64) { 9 })
        assertEquals(UnifiedPush.Plan.Link, plan(registered, hasScreen = true, linkable = true, receivers = emptyList(), key = other))
        val background = plan(registered, hasScreen = false, linkable = true, receivers = emptyList(), key = other) as UnifiedPush.Plan.Answer
        assertEquals("failed", errorOf(background.json))
    }

    @Test fun aKeyThatIsNotAVapidKeyFails() {
        for (bad in listOf("", "abc", vapid + "A", vapid.dropLast(1), "!".repeat(87), WebPush.encode(byteArrayOf(3) + ByteArray(64) { 7 }))) {
            assertFalse(bad, UnifiedPush.validVapid(bad))
            val answer = plan(unregistered, hasScreen = true, linkable = true, receivers = listOf("a"), key = bad) as UnifiedPush.Plan.Answer
            assertEquals("failed", errorOf(answer.json))
        }
        assertEquals(87, vapid.length)
        assertTrue(UnifiedPush.validVapid(vapid))
    }

    @Test fun theLinkScreensAnswer() {
        assertEquals(UnifiedPush.Plan.Register("io.heckel.ntfy"), UnifiedPush.afterLink(true, "io.heckel.ntfy"))
        assertEquals("cancelled", errorOf((UnifiedPush.afterLink(false, null) as UnifiedPush.Plan.Answer).json))
        assertEquals("cancelled", errorOf((UnifiedPush.afterLink(false, "io.heckel.ntfy") as UnifiedPush.Plan.Answer).json))
        assertEquals("failed", errorOf((UnifiedPush.afterLink(true, null) as UnifiedPush.Plan.Answer).json))
        assertEquals("failed", errorOf((UnifiedPush.afterLink(true, "") as UnifiedPush.Plan.Answer).json))
    }

    @Test fun aRegistrationStartsWithANewTokenAndNoEndpoint() {
        val fresh = UnifiedPush.begin("io.heckel.ntfy", vapid, "token-9", keys)
        assertEquals(UnifiedPush.State("token-9", "io.heckel.ntfy", vapid, null, keys), fresh)
        assertNull(UnifiedPush.subscription(fresh))
        assertNull(UnifiedPush.subscription(unregistered))
    }

    // ---- The bridge fixture ----

    private fun fixture(): JSONObject {
        val url = javaClass.classLoader!!.getResource("bridge/push-bridge.json")
        assertNotNull("missing bridge fixture push-bridge.json (web: UPDATE_BRIDGE_FIXTURES=1)", url)
        return JSONObject(url!!.readText())
    }

    private fun strings(f: JSONObject, key: String): List<String> = f.getJSONArray(key).let { a -> (0 until a.length()).map { a.getString(it) } }

    @Test fun theSubscriptionTheWebAppReads() {
        val f = fixture()
        assertEquals("push", f.getString("capability"))
        val want = f.getJSONObject("subscription")
        val state = UnifiedPush.State("t", "d", vapid, want.getString("endpoint"), WebPush.Keys("never-handed-over", want.getString("p256dh"), want.getString("auth")))
        assertSameJson(want, UnifiedPush.subscription(state))
        assertTrue(UnifiedPush.validEndpoint(want.getString("endpoint")))
        // The same answer when the distributor gives that endpoint.
        val step = UnifiedPush.next(state.copy(endpoint = null), UnifiedPush.Event.NewEndpoint("t", want.getString("endpoint")))!!
        assertSameJson(want, step.answer)
    }

    @Test fun theErrorsTheWebAppReads() {
        val f = fixture()
        assertEquals(strings(f, "errors").toSet(), UnifiedPush.ERRORS.toSet())
        for (e in strings(f, "errors")) assertSameJson(JSONObject().put("error", e), UnifiedPush.error(e))
    }

    @Test fun theStatesTheWebAppReads() {
        val states = fixture().getJSONArray("states")
        assertTrue(states.length() >= 3)
        var withEndpoint = 0
        for (i in 0 until states.length()) {
            val want = states.getJSONObject(i)
            val state = if (!want.getBoolean("registered")) unregistered
            else UnifiedPush.State("t", "d", vapid, want.getString("endpoint"), WebPush.Keys("never-handed-over", want.getString("p256dh"), want.getString("auth"))).also { withEndpoint++ }
            assertSameJson(want, UnifiedPush.stateJson(want.getBoolean("available"), state))
        }
        assertTrue(withEndpoint >= 1)
        // A registration still waiting for its endpoint is not registered, and names no keys.
        assertSameJson(JSONObject().put("available", true).put("registered", false), UnifiedPush.stateJson(true, registering))
        assertFalse(UnifiedPush.stateJson(true, registered).contains("private"))
    }

    @Test fun thePageScriptHasTheMethodsOfTheFixture() {
        val script = Bridge.script("1.0.0", listOf("reminders", "widgets", "push"))
        assertEquals(listOf("pushSubscribe", "pushState", "pushUnsubscribe"), strings(fixture(), "methods"))
        assertTrue(script, script.contains("pushSubscribe: function (key) { return call('pushSubscribe', [String(key)]) }"))
        assertTrue(script, script.contains("pushState: function () { return call('pushState', []) }"))
        assertTrue(script, script.contains("pushUnsubscribe: function () { send('pushUnsubscribe', []) }"))
        assertTrue(script, script.contains("\"push\""))
    }

    // ---- A decrypted message ----

    private fun message(text: String, now: Long = 5_000L) = UnifiedPush.message(text.toByteArray(), now)

    @Test fun aReminderIsTheAlarmsReminder() {
        val m = message("""{"type":"reminder","reminderId":"r1","taskId":"t1","fireAt":1800000000000,"title":"Call the plumber"}""")
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("r1", "t1", 1_800_000_000_000L, "Call the plumber")), m)
        // The same notification as the alarm's: the id comes from the reminder's id, on the reminders channel.
        val pushed = (m as UnifiedPush.Message.Reminder).reminder
        val scheduled = ReminderSchedule.parse("""[{"id":"r1","taskId":"t1","fireAt":1800000000000,"title":"Call the plumber"}]""", null).single()
        assertEquals(scheduled, pushed)
        assertEquals(Notifier.notificationId(scheduled.id), Notifier.notificationId(pushed.id))
        assertEquals("reminders", Notifier.CHANNEL)
    }

    @Test fun aReminderWithoutATitleHasNone() {
        // Titles off, or an encrypted account: the notification then reads the generic text.
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("r1", "t1", 7L, null)), message("""{"type":"reminder","reminderId":"r1","taskId":"t1","fireAt":7}"""))
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("r1", "t1", 7L, null)), message("""{"type":"reminder","reminderId":"r1","taskId":"t1","fireAt":7,"title":""}"""))
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("r1", "t1", 7L, null)), message("""{"type":"reminder","reminderId":"r1","taskId":"t1","fireAt":7,"title":null}"""))
        // Without a fire time it fires now.
        assertEquals(UnifiedPush.Message.Reminder(ShellReminder("r1", "t1", 5_000L, null)), message("""{"type":"reminder","reminderId":"r1","taskId":"t1"}"""))
        val long = message("""{"type":"reminder","reminderId":"r1","taskId":"t1","fireAt":7,"title":"${"x".repeat(300)}"}""") as UnifiedPush.Message.Reminder
        assertEquals(200, long.reminder.title!!.length)
    }

    @Test fun theServersTestPush() {
        assertEquals(UnifiedPush.Message.Test, message("""{"type":"test","testId":"abc","sentAt":1800000000000}"""))
    }

    @Test fun anythingElseShowsNothing() {
        for (bad in listOf(
            "", "not json", "[]", "null", "{}", """{"type":"other"}""", """{"type":"Reminder","reminderId":"r","taskId":"t"}""",
            """{"type":"reminder"}""", """{"type":"reminder","reminderId":"r1"}""", """{"type":"reminder","taskId":"t1"}""",
            """{"type":"reminder","reminderId":"","taskId":"t1"}""", """{"type":"reminder","reminderId":"${"r".repeat(101)}","taskId":"t1"}""",
            """{"type":"reminder","reminderId":"r1","taskId":"${"t".repeat(101)}"}""",
        )) assertNull(bad, message(bad))
        assertNull(UnifiedPush.message(byteArrayOf(0xff.toByte(), 0xfe.toByte(), 0x00), 0))
    }
}
