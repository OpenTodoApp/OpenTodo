// Today, in its smallest form (OpenSpec change native-app-foundation, task 4.6): the
// shared Today rule over the phone's database, a native list, and completing a task
// with a tap and a haptic. It proves the path end to end: sign-in, sync, a local write,
// the op reaching the server. The real screen is native-app-everyday's.
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatClock, logicalToday } from '@shared/dates'
import { completeTask } from '@shared/ops'
import { platform } from '@shared/platform'
import { useSyncStatus } from '@shared/sync'
import type { Task } from '@shared/types'
import type { SignedIn } from '../auth/account'
import { useLive } from '../data/useLive'
import { todayTasks } from '../storage/lists'
import { useColors, type Colors } from '../theme'

interface Props {
  signed: SignedIn
  onSignOut(): void
}

/** The day Today shows, read again when the app comes to the front (past midnight). */
function useToday(): string {
  const [today, setToday] = useState(() => logicalToday())
  useEffect(() => platform.visibility.onChange((visible) => { if (visible) setToday(logicalToday()) }), [])
  return today
}

/** What sync has to say when it is not simply up to date: offline, or an error. */
function useSyncNote(): string | null {
  const s = useSyncStatus()
  if (s.state === 'offline') return s.lastSyncedAt ? `Offline · synced ${formatClock(s.lastSyncedAt, false)}` : 'Offline'
  if (s.state === 'error') return s.error ?? 'Sync failed'
  return null
}

export default function TodayScreen({ signed, onSignOut }: Props) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const today = useToday()
  const tasks = useLive(() => todayTasks(today), ['tasks', 'projects'], [today])
  const syncing = useSyncStatus().state === 'syncing'
  const note = useSyncNote()
  const { user, server } = signed.account

  const complete = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void completeTask(id)
  }, [])

  const account = () =>
    Alert.alert(user.name || user.email, new URL(server).host, [
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
      { text: 'Cancel', style: 'cancel' },
    ])

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>Today</Text>
        <Pressable accessibilityLabel="Account" accessibilityRole="button" hitSlop={12} onPress={account} style={[styles.avatar, { backgroundColor: c.field }]} testID="account">
          <Text style={[styles.initial, { color: c.muted }]}>{(user.name || user.email).trim().charAt(0).toUpperCase()}</Text>
        </Pressable>
      </View>
      <FlatList
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        data={tasks ?? []}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: c.field }]} />}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={tasks === undefined || syncing ? <ActivityIndicator color={c.muted} style={styles.waiting} /> : undefined}
        renderItem={({ item }) => <Row c={c} onComplete={complete} task={item} />}
        testID="today-list"
      />
      {note && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: c.muted, paddingBottom: insets.bottom + 8 }]} testID="sync-note">{note}</Text>}
    </View>
  )
}

function Row({ task, c, onComplete }: { task: Task; c: Colors; onComplete(id: string): void }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Complete ${task.title}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        hitSlop={10}
        onPress={() => onComplete(task.id)}
        style={({ pressed }) => [styles.circle, { borderColor: c.muted, backgroundColor: pressed ? c.field : 'transparent' }]}
        testID={`complete-${task.title}`}
      />
      <Text numberOfLines={2} style={[styles.task, { color: c.text }]}>{task.title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8, paddingTop: 12 },
  title: { fontSize: 34, fontWeight: '700' },
  avatar: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  initial: { fontSize: 15, fontWeight: '600' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 52, paddingHorizontal: 20, paddingVertical: 12 },
  circle: { borderRadius: 12, borderWidth: 1.5, height: 24, width: 24 },
  task: { flex: 1, fontSize: 17, lineHeight: 22 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  waiting: { marginTop: 48 },
  note: { fontSize: 13, paddingTop: 8, textAlign: 'center' },
})
