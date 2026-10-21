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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Runs the web app briefly in a hidden web view (native-shells D4): hourly so it syncs and
 * hands over a fresh schedule and widget data, and once for a notification's Snooze or
 * Dismiss, which the web app applies as its own reminder ops. At most 30 seconds.
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
                // The hidden run never leaves the server's origin.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    Bridge.originOf(request.url) != origin
            }
            Bridge(applicationContext, origin, null).install(web)
            web.loadUrl(origin + path)
            try { delay(LIMIT_MS) } finally { web.stopLoading(); web.destroy() }
        }
        return Result.success()
    }

    companion object { const val LIMIT_MS = 30_000L }
}

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
