package app.opentodo

import android.app.BroadcastOptions
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.UUID

/**
 * Reminders by push through UnifiedPush (shell-push): the Android side of [UnifiedPush],
 * which decides everything. The app registers with the distributor the user chose, hands the
 * web app a Web Push subscription, and shows a delivered reminder as its alarm would. The
 * registration (token, endpoint, keys) lives in [Prefs.push]; the private key never leaves
 * the phone. Everything here runs on the main thread, where broadcasts arrive.
 */
object Push {
    private val main = Handler(Looper.getMainLooper())
    /** The `pushSubscribe` waiting for the distributor's answer, and its time limit. */
    private var pending: ((String) -> Unit)? = null
    private var limit: Runnable? = null

    fun state(context: Context): UnifiedPush.State = UnifiedPush.State.parse(Prefs(context).push)

    private fun save(context: Context, state: UnifiedPush.State) {
        Prefs(context).push = if (state.token == null) null else state.toJson()
    }

    fun linkIntent(): Intent = Intent(Intent.ACTION_VIEW, Uri.parse(UnifiedPush.LINK))

    /** The distributor of a link activity's result: the creator of its `pi` extra. */
    @Suppress("DEPRECATION")
    fun distributorOf(data: Intent?): String? = try {
        val pi: PendingIntent? =
            if (Build.VERSION.SDK_INT >= 33) data?.getParcelableExtra(UnifiedPush.EXTRA_PI, PendingIntent::class.java)
            else data?.getParcelableExtra<PendingIntent>(UnifiedPush.EXTRA_PI)
        pi?.creatorPackage
    } catch (e: RuntimeException) {
        null
    }

    @Suppress("DEPRECATION")
    private fun linkable(context: Context): Boolean = try {
        context.packageManager.queryIntentActivities(linkIntent(), 0).isNotEmpty()
    } catch (e: RuntimeException) {
        false
    }

    /** The installed apps with a receiver for REGISTER: distributors, also those without a link activity. */
    @Suppress("DEPRECATION")
    private fun receivers(context: Context): List<String> = try {
        context.packageManager.queryBroadcastReceivers(Intent(UnifiedPush.ACTION_REGISTER), 0)
            .mapNotNull { it.activityInfo?.packageName }
            .filter { it != context.packageName }
            .distinct().sorted()
    } catch (e: RuntimeException) {
        emptyList()
    }

    /** `pushState`: asks nothing, so a background run can read it. */
    fun stateJson(context: Context): String {
        val app = context.applicationContext
        return UnifiedPush.stateJson(linkable(app) || receivers(app).isNotEmpty(), state(app))
    }

    /**
     * `pushSubscribe`. Without a [host] (a background run) no screen is started: the answer is
     * the registration there is, or `failed`. [answer] gets the JSON of the bridge contract.
     */
    fun subscribe(context: Context, host: Bridge.Host?, vapid: String, answer: (String) -> Unit) {
        val app = context.applicationContext
        when (val plan = UnifiedPush.plan(state(app), vapid, host != null, linkable(app), receivers(app))) {
            is UnifiedPush.Plan.Answer -> answer(plan.json)
            is UnifiedPush.Plan.Register -> register(app, plan.distributor, vapid, answer)
            is UnifiedPush.Plan.Link -> {
                if (host == null) return answer(UnifiedPush.error(UnifiedPush.FAILED))
                host.pushLink { ok, distributor ->
                    when (val linked = UnifiedPush.afterLink(ok, distributor)) {
                        is UnifiedPush.Plan.Register -> register(app, linked.distributor, vapid, answer)
                        is UnifiedPush.Plan.Answer -> answer(linked.json)
                        is UnifiedPush.Plan.Link -> answer(UnifiedPush.error(UnifiedPush.FAILED))
                    }
                }
            }
        }
    }

    /** A new token and new keys, then REGISTER; the answer comes to [PushReceiver], or the limit passes. */
    private fun register(app: Context, distributor: String, vapid: String, answer: (String) -> Unit) {
        // An earlier registration is replaced, and an earlier call that still waits has failed.
        release(app)
        finish(UnifiedPush.error(UnifiedPush.FAILED))
        val keys = WebPush.newKeys()
        if (keys == null) {
            save(app, UnifiedPush.State())
            return answer(UnifiedPush.error(UnifiedPush.FAILED))
        }
        val fresh = UnifiedPush.begin(distributor, vapid, UUID.randomUUID().toString(), keys)
        save(app, fresh)
        pending = answer
        val expire = Runnable { expired(app) }
        limit = expire
        main.postDelayed(expire, UnifiedPush.ANSWER_LIMIT_MS)
        try {
            sendRegister(app, fresh)
        } catch (e: RuntimeException) {
            save(app, UnifiedPush.State())
            finish(UnifiedPush.error(UnifiedPush.FAILED))
        }
    }

    /**
     * The app tells the distributor who it is: its shared identity on Android 14+, and the
     * `pi` extra (an immutable PendingIntent of this app that does nothing) for distributors
     * and Android versions that read that.
     */
    private fun sendRegister(app: Context, state: UnifiedPush.State) {
        val identity = PendingIntent.getBroadcast(
            app, 0, Intent(app, PushReceiver::class.java).setAction(ACTION_IDENTITY), PendingIntent.FLAG_IMMUTABLE,
        )
        val intent = Intent(UnifiedPush.ACTION_REGISTER).setPackage(state.distributor)
            .putExtra(UnifiedPush.EXTRA_TOKEN, state.token)
            .putExtra(UnifiedPush.EXTRA_VAPID, state.vapid)
            .putExtra(UnifiedPush.EXTRA_PI, identity)
        if (Build.VERSION.SDK_INT >= 34) {
            app.sendBroadcast(intent, null, BroadcastOptions.makeBasic().setShareIdentityEnabled(true).toBundle())
        } else {
            app.sendBroadcast(intent)
        }
    }

    /** To the registration's distributor, about its token. Nothing is sent without both. */
    private fun tell(app: Context, state: UnifiedPush.State, action: String, messageId: String? = null) {
        val distributor = state.distributor ?: return
        val token = state.token ?: return
        val intent = Intent(action).setPackage(distributor).putExtra(UnifiedPush.EXTRA_TOKEN, token)
        if (messageId != null) intent.putExtra(UnifiedPush.EXTRA_ID, messageId)
        try { app.sendBroadcast(intent) } catch (e: RuntimeException) { /* the distributor is gone */ }
    }

    private fun release(app: Context) = tell(app, state(app), UnifiedPush.ACTION_UNREGISTER)

    /** Answers the waiting `pushSubscribe`, if there is one: true when there was. */
    private fun finish(json: String): Boolean {
        limit?.let { main.removeCallbacks(it) }
        limit = null
        val waiting = pending ?: return false
        pending = null
        waiting(json)
        return true
    }

    private fun expired(app: Context) {
        val now = state(app)
        val after = UnifiedPush.timedOut(now)
        if (after != now) { release(app); save(app, after) }
        finish(UnifiedPush.error(UnifiedPush.FAILED))
    }

    /**
     * `pushUnsubscribe`, and "Change server": the distributor is told, and the token, the
     * endpoint and the keys go. A later message for that registration shows nothing.
     */
    fun forget(context: Context) {
        val app = context.applicationContext
        release(app)
        Prefs(app).push = null
        finish(UnifiedPush.error(UnifiedPush.FAILED))
    }

    /**
     * The distributor's answer about the registration. A change nobody waits for (a rotated
     * endpoint, an unregistration) is told to the web app by a background run, which
     * subscribes the new endpoint on the server or removes the old one.
     */
    fun answered(app: Context, before: UnifiedPush.State, step: UnifiedPush.Step) {
        save(app, step.state)
        val waited = finish(step.answer)
        val settled = UnifiedPush.settled(step.state, waited)
        if (settled != step.state) { release(app); save(app, settled) }
        if (!waited && settled != before) HiddenRun.enqueueRefresh(app)
    }

    /**
     * A delivered message: decrypted here, shown when it is a reminder (through the alarm's own
     * notification, whose alarm then goes) or the server's test, and acknowledged. Bytes that
     * do not decrypt, and any other message, show nothing; nothing of a message is logged.
     */
    fun message(app: Context, state: UnifiedPush.State, body: ByteArray?, messageId: String?) {
        val keys = state.keys
        val plain = if (body == null || keys == null) null else WebPush.decrypt(body, keys)
        when (val message = plain?.let { UnifiedPush.message(it, System.currentTimeMillis()) }) {
            is UnifiedPush.Message.Reminder -> {
                val r = message.reminder
                if (Notifier.show(app, r.id, r.taskId, r.title, r.fireAt)) Scheduler.cancel(app, r.id)
                // The web app syncs, hands over the schedule again and refreshes the widget.
                HiddenRun.enqueueRefresh(app)
            }
            is UnifiedPush.Message.Test -> Notifier.test(app)
            null -> Unit
        }
        if (messageId != null) tell(app, state, UnifiedPush.ACTION_MESSAGE_ACK, messageId)
    }

    /** The action of the identity PendingIntent: nothing handles it. */
    private const val ACTION_IDENTITY = "app.opentodo.PUSH_IDENTITY"
}

/**
 * The distributor's broadcasts (specification AND_3.1.0). Exported, because the distributor
 * is another app: an intent is only read further when its `token` is the stored one, so no
 * other app can show a notification, change the endpoint or unregister the app.
 */
class PushReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        try {
            val state = Push.state(app)
            val token = intent.getStringExtra(UnifiedPush.EXTRA_TOKEN)
            if (intent.action == UnifiedPush.ACTION_MESSAGE) {
                if (!UnifiedPush.accepts(state, token)) return
                Push.message(app, state, intent.getByteArrayExtra(UnifiedPush.EXTRA_BYTES), intent.getStringExtra(UnifiedPush.EXTRA_ID))
                return
            }
            val event = UnifiedPush.event(
                intent.action, token,
                intent.getStringExtra(UnifiedPush.EXTRA_ENDPOINT), intent.getStringExtra(UnifiedPush.EXTRA_REASON),
            ) ?: return
            val step = UnifiedPush.next(state, event) ?: return
            Push.answered(app, state, step)
        } catch (e: RuntimeException) {
            // Extras another app made unreadable: the intent is ignored like any foreign one.
        }
    }
}
