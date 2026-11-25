package app.opentodo

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import androidx.work.OutOfQuotaPolicy
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

/**
 * Runs the web app briefly in a hidden web view (native-shells D4): hourly so it syncs and
 * hands over a fresh schedule and widget data, once for a notification's Snooze or
 * Dismiss, which the web app applies as its own reminder ops, and once after a pushed
 * reminder (shell-push D4) or a quick-add notification's reply. The run ends when the web app
 * says it is done (shell-reminders-on D4: capability `background`, `backgroundDone()`), or
 * after 90 seconds when nothing is heard (an older web app, a server that does not answer).
 */
class HiddenRunWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @SuppressLint("SetJavaScriptEnabled")
    override suspend fun doWork(): Result {
        // android-quick-add-notification D4: a reply's run knows its text and the id to create it with.
        val addText = inputData.getString(QUICK_ADD_TEXT)
        val addId = inputData.getString(QUICK_ADD_ID)
        val origin = Prefs(applicationContext).server ?: return Result.success().also { addFailed(addText, addId, emptySet()) }
        // android-widget-list D2: a widget run takes every tick queued so far; a later run of the
        // chain that finds the queue empty has nothing to do.
        val path = if (inputData.getBoolean(WIDGET_RUN, false)) WidgetStore.takeCompletePath(applicationContext) ?: return Result.success()
        else if (addText != null && addId != null) QuickAddNotification.replyPath(addText, addId)
        else inputData.getString("path")?.takeIf { it.startsWith("/") } ?: "/"
        var result: String? = null
        withContext(Dispatchers.Main) {
            val web = WebView(applicationContext)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            web.webViewClient = object : WebViewClient() {
                // The hidden run never leaves the server's origin and never opens anything: when a
                // login wall's session has expired, its redirect is dropped and the run ends quietly
                // (the next time the app is opened, the wall asks in the app).
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !SignInFlow.hiddenRunStays(request.url.toString(), origin)
            }
            val done = CompletableDeferred<Unit>()
            Bridge(applicationContext, origin, null) { r -> result = r; done.complete(Unit) }.install(web)
            web.loadUrl(origin + path)
            try { awaitBackgroundDone(done, LIMIT_MS) } finally { web.stopLoading(); web.destroy() }
        }
        addFailed(addText, addId, QuickAddNotification.added(result))
        return Result.success()
    }

    /** A reply the run did not save comes back as a notification that opens quick add with it (D4). */
    private fun addFailed(text: String?, id: String?, added: Set<String>) {
        if (text != null && id != null && id !in added) QuickAddNotification.failed(applicationContext, text, id)
    }

    /**
     * An expedited widget run on Android 11 and earlier runs as a foreground service, which needs
     * a notification: a silent one on a low "Syncing" channel, gone when the run ends. Android 12
     * and later run expedited work as a job and never ask for it.
     */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(SYNC_CHANNEL, applicationContext.getString(R.string.channel_sync), NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
        val n = NotificationCompat.Builder(applicationContext, SYNC_CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(applicationContext.getString(R.string.channel_sync))
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setOngoing(true)
            .build()
        return ForegroundInfo(SYNC_NOTIFICATION, n)
    }

    companion object {
        const val LIMIT_MS = 90_000L
        const val WIDGET_RUN = "widget"
        const val QUICK_ADD_TEXT = "quickAddText"
        const val QUICK_ADD_ID = "quickAddId"
        private const val SYNC_CHANNEL = "sync"
        private const val SYNC_NOTIFICATION = 7301
    }
}

/** Waits for the web app's `backgroundDone()`, at most [limitMs]: true when it came, false at the limit. */
internal suspend fun awaitBackgroundDone(done: Deferred<Unit>, limitMs: Long): Boolean =
    withTimeoutOrNull(limitMs) { done.await() } != null

object HiddenRun {
    private const val PERIODIC = "refresh"
    private const val PUSHED = "pushed"
    private const val WIDGET = "widget"

    fun schedulePeriodic(context: Context) {
        if (Prefs(context).server == null) return
        val req = PeriodicWorkRequestBuilder<HiddenRunWorker>(1, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** A notification action: applied locally at once and synced when there is a network. */
    fun enqueueOnce(context: Context, path: String) {
        val req = OneTimeWorkRequestBuilder<HiddenRunWorker>().setInputData(workDataOf("path" to path)).build()
        WorkManager.getInstance(context).enqueue(req)
    }

    /**
     * A reply in the quick-add notification (android-quick-add-notification D4): expedited when
     * the system allows, like a widget tick. The id goes with the text, so a run WorkManager
     * repeats after the process died finds the task it created and adds nothing twice.
     */
    fun enqueueQuickAdd(context: Context, text: String, id: String) {
        val req = OneTimeWorkRequestBuilder<HiddenRunWorker>()
            .setInputData(workDataOf(HiddenRunWorker.QUICK_ADD_TEXT to text, HiddenRunWorker.QUICK_ADD_ID to id))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context).enqueue(req)
    }

    /**
     * A tap on the Today widget's completion circle (android-widget-list D2): a run that completes
     * every tick queued when it starts (WidgetStore.takeCompletePath), so quick ticks share one
     * web view; appended to one chain, so a tick made while a run is going gets the next run, and
     * each id is sent once. Expedited when the system allows, else as soon as it can. Like a
     * notification action, applied locally at once and synced when there is a network.
     */
    fun enqueueWidgetRun(context: Context) {
        if (Prefs(context).server == null) return
        val req = OneTimeWorkRequestBuilder<HiddenRunWorker>()
            .setInputData(workDataOf(HiddenRunWorker.WIDGET_RUN to true))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WIDGET, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }

    /**
     * After a pushed reminder or a changed push endpoint (shell-push D4): one run that syncs and
     * hands over the schedule, the widget and the endpoint. Several messages at once share it.
     */
    fun enqueueRefresh(context: Context) {
        if (Prefs(context).server == null) return
        val req = OneTimeWorkRequestBuilder<HiddenRunWorker>()
            .setInputData(workDataOf("path" to "/"))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(PUSHED, ExistingWorkPolicy.KEEP, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelAllWork()
    }
}
