package app.opentodokmp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import app.opentodokmp.connection.AndroidConnectionHost
import app.opentodokmp.connection.ConnectionManager

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        AndroidConnectionHost.attach(this)
        setContent { App() }
        intent?.data?.let { ConnectionManager.handleAuthCallback(it.toString()) }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.let { ConnectionManager.handleAuthCallback(it.toString()) }
    }
}
