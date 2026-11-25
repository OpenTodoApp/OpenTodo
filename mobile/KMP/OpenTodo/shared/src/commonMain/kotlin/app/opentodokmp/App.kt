package app.opentodokmp

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import app.opentodokmp.connection.ConnectionManager
import app.opentodokmp.connection.ConnectionScreen

@Composable
fun App() {
    LaunchedEffect(Unit) { ConnectionManager.restore() }
    MaterialTheme { ConnectionScreen() }
}
