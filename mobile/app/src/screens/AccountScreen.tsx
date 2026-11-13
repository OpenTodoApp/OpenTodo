// Signed in (task 4.4): who, on which server, and Sign out. Today takes this screen's
// place in task 4.6, and Sign out moves to the app's settings.
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { SignedIn } from '../auth/account'
import { useColors } from '../theme'

interface Props {
  signed: SignedIn
  onSignOut(): Promise<void>
}

export default function AccountScreen({ signed, onSignOut }: Props) {
  const c = useColors()
  const [busy, setBusy] = useState(false)
  const { user, server } = signed.account
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.text }]} testID="account-name">{user.name || user.email}</Text>
      <Text style={[styles.note, { color: c.muted }]}>{new URL(server).host}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => { setBusy(true); void onSignOut() }}
        style={({ pressed }) => [styles.button, { backgroundColor: c.field, opacity: pressed ? 0.6 : 1 }]}
        testID="sign-out"
      >
        {busy ? <ActivityIndicator color={c.muted} /> : <Text style={[styles.buttonText, { color: c.error }]}>Sign out</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 34, fontWeight: '700' },
  note: { fontSize: 15, lineHeight: 20 },
  button: { alignItems: 'center', borderRadius: 12, marginTop: 8, paddingVertical: 15 },
  buttonText: { fontSize: 17, fontWeight: '600' },
})
