// The first screen: the server's address (OpenSpec change native-app-foundation,
// task 4.4's server half). Sign-in, the local database and sync follow in later
// changes; until then a server that passes the check is only confirmed.
import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native'
import { checkServer, UPDATE_GUIDE, type ServerCheck } from './server'

const palette = {
  light: { bg: '#ffffff', text: '#1c1c1e', muted: '#6e6e73', field: '#f2f2f7', accent: '#0a66d8', error: '#c4281c' },
  dark: { bg: '#000000', text: '#f5f5f7', muted: '#98989d', field: '#1c1c1e', accent: '#4c9bff', error: '#ff6b5e' },
}

export default function App() {
  const c = palette[useColorScheme() === 'dark' ? 'dark' : 'light']
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ServerCheck | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setResult(await checkServer(address))
    setBusy(false)
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>Your server</Text>
        <TextInput
          accessibilityLabel="Server address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          editable={!busy}
          inputMode="url"
          keyboardType="url"
          onChangeText={(s) => { setAddress(s); setResult(null) }}
          onSubmitEditing={submit}
          placeholder="todo.example.com"
          placeholderTextColor={c.muted}
          returnKeyType="go"
          style={[styles.field, { backgroundColor: c.field, color: c.text }]}
          textContentType="URL"
          value={address}
        />
        {result && !result.ok && (
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.note, { color: c.error }]}>{result.message}</Text>
            {result.problem === 'needs-update' && (
              <Text accessibilityRole="link" onPress={() => Linking.openURL(UPDATE_GUIDE)} style={[styles.note, { color: c.accent }]}>
                How to update the server
              </Text>
            )}
          </View>
        )}
        {result?.ok && <Text style={[styles.note, { color: c.muted }]}>OpenTodo {result.version}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || !address.trim() }}
          disabled={busy || !address.trim()}
          onPress={submit}
          style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed || !address.trim() ? 0.6 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: '700', marginBottom: 8 },
  field: { borderRadius: 12, fontSize: 17, paddingHorizontal: 16, paddingVertical: 14 },
  note: { fontSize: 15, lineHeight: 20 },
  button: { alignItems: 'center', borderRadius: 12, marginTop: 8, paddingVertical: 15 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
})
