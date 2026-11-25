package app.opentodokmp.connection

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun ConnectionScreen() {
    var serverUrl by remember { mutableStateOf((ConnectionManager.state as? ConnectionState.Connected)?.server.orEmpty()) }
    val state = ConnectionManager.state
    LaunchedEffect(state) { if (state is ConnectionState.Connected) serverUrl = state.server }
    val busy = state is ConnectionState.Checking || state is ConnectionState.SigningIn || state is ConnectionState.Exchanging

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 40.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start,
        ) {
            Text("OpenTodo", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            Text(
                if (state is ConnectionState.Connected) "You’re connected" else "Your tasks, your server.",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (state is ConnectionState.Connected) "This app connects directly to your OpenTodo server." else "Connect to your OpenTodo server to get started. Your data stays with your server and syncs across your devices.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(28.dp))
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Server address") },
                placeholder = { Text("https://todo.example.com") },
                singleLine = true,
                enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                supportingText = { Text("Use HTTPS for public servers. HTTP is allowed for local servers.") },
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { ConnectionManager.connect(serverUrl) },
                modifier = Modifier.fillMaxWidth(),
                enabled = serverUrl.isNotBlank() && !busy,
            ) {
                if (busy) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp)
                else Text(if (state is ConnectionState.Connected) "Connect to another server" else "Continue")
            }
            when (state) {
                is ConnectionState.Checking -> StatusText("Checking ${state.server}…")
                is ConnectionState.SigningIn -> StatusText("Continue sign-in in your browser. Return here when done.")
                is ConnectionState.Exchanging -> StatusText("Finishing sign-in…")
                is ConnectionState.Connected -> StatusText("Connected to ${state.server}")
                is ConnectionState.Error -> StatusText(state.message, error = true)
                ConnectionState.Start -> Unit
            }
        }
    }
}

@Composable
private fun StatusText(text: String, error: Boolean = false) {
    Spacer(Modifier.height(16.dp))
    Text(
        text,
        modifier = Modifier.padding(horizontal = 4.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
