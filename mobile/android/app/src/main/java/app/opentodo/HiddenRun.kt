package app.opentodo

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
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
 * hands over a fresh schedule and widget data, and once for a notification's Snooze or
 * Dismiss, which the web app applies as its own reminder ops. The run ends when the web app
 * says it is done (shell-reminders-on D4: capability `background`, `backgroundDone()`), or
 * after 90 seconds when nothing is heard (an older web app, a server that does not answer).
 */
class HiddenRunWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @SuppressLint("SetJavaScriptEnabled")
    override suspend fun doWork(): Result {
        val origin = Prefs(applicationContext).server ?: return Result.success()
        val path = inputData.getString("path")?.takeIf { it.startsWith("/") } ?: "/"
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
            Bridge(applicationContext, origin, null) { done.complete(Unit) }.install(web)
            web.loadUrl(origin + path)
            try { awaitBackgroundDone(done, LIMIT_MS) } finally { web.stopLoading(); web.destroy() }
        }
        return Result.success()
    }

    companion object { const val LIMIT_MS = 90_000L }
}

/** Waits for the web app's `backgroundDone()`, at most [limitMs]: true when it came, false at the limit. */
internal suspend fun awaitBackgroundDone(done: Deferred<Unit>, limitMs: Long): Boolean =
    withTimeoutOrNull(limitMs) { done.await() } != null

object HiddenRun {
    private const val PERIODIC = "refresh"

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

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelAllWork()
    }
}
