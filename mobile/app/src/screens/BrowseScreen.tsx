// Browse: the rest of the app, one level down. For now the account and Sign out;
// projects, labels, saved views, notes and the Logbook join in task 5.1, Settings in 5.3.
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { t } from '@shared/i18n'
import type { SignedIn } from '../auth/account'
import { useColors } from '../theme'

interface Props {
  signed: SignedIn
  onSignOut(): void
}

export default function BrowseScreen({ signed, onSignOut }: Props) {
  const c = useColors()
  const [busy, setBusy] = useState(false)
  const { user, server } = signed.account
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: c.bg }} testID="browse">
      <View style={[styles.group, { backgroundColor: c.field }]}>
        <View style={styles.cell}>
          <Text style={[styles.primary, { color: c.text }]} testID="account-name">{user.name || user.email}</Text>
          <Text style={[styles.secondary, { color: c.muted }]}>{new URL(server).host}</Text>
        </View>
      </View>
      <View style={[styles.group, { backgroundColor: c.field }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => { setBusy(true); onSignOut() }}
          style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.6 : 1 }]}
          testID="sign-out"
        >
          {busy ? <ActivityIndicator color={c.muted} /> : <Text style={[styles.primary, { color: c.error }]}>{t('Sign out')}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  group: { borderRadius: 12, marginHorizontal: 16, marginTop: 16 },
  cell: { gap: 2, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  primary: { fontSize: 17 },
  secondary: { fontSize: 14 },
})
