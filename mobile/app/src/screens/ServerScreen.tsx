// The first screen: the server's address, then sign-in (OpenSpec change
// native-app-foundation, task 4.4). Continue checks the server (design D11) and opens
// the system's authentication sheet on it (D5); what goes wrong is said beside the
// field, and the address stays for correction.
import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { begin, type AccountDeps, type SignedIn } from '../auth/account'
import { signIn, SIGN_IN_MESSAGES, type SignInDeps } from '../auth/signIn'
import { checkServer, UPDATE_GUIDE } from '../server'
import { useColors } from '../theme'

interface Props {
  account: AccountDeps
  sheet: SignInDeps
  onSignedIn(signed: SignedIn): void
}

type Problem = { message: string; update?: boolean }

export default function ServerScreen({ account, sheet, onSignedIn }: Props) {
  const c = useColors()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  /** The first thing that stops sign-in, or null when the account is signed in. */
  const connect = async (): Promise<Problem | null> => {
    const server = await checkServer(address)
    if (!server.ok) return { message: server.message, update: server.problem === 'needs-update' }
    const result = await signIn(server.url, sheet)
    if (!result.ok) return result.message ? { message: result.message } : null
    try {
      onSignedIn(await begin(server.url, result.tokens, account))
      return null
    } catch {
      return { message: SIGN_IN_MESSAGES.failed }
    }
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    const stopped = await connect().catch((): Problem => ({ message: SIGN_IN_MESSAGES.failed }))
    setProblem(stopped)
    setBusy(false)
  }

  const off = busy || !address.trim()
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
          onChangeText={(s) => { setAddress(s); setProblem(null) }}
          onSubmitEditing={submit}
          placeholder="todo.example.com"
          placeholderTextColor={c.muted}
          returnKeyType="go"
          style={[styles.field, { backgroundColor: c.field, color: c.text }]}
          testID="server-address"
          textContentType="URL"
          value={address}
        />
        {problem && (
          <View accessibilityLiveRegion="polite">
            <Text style={[styles.note, { color: c.error }]}>{problem.message}</Text>
            {problem.update && (
              <Text accessibilityRole="link" onPress={() => Linking.openURL(UPDATE_GUIDE)} style={[styles.note, { color: c.accent }]}>
                How to update the server
              </Text>
            )}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: off }}
          disabled={off}
          onPress={submit}
          style={({ pressed }) => [styles.button, { backgroundColor: c.accent, opacity: pressed || !address.trim() ? 0.6 : 1 }]}
          testID="server-continue"
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
