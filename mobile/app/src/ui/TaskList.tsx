// The list every task screen shows (native-app-everyday): a recycled native list of
// rows, a tap on the circle to complete with a haptic, and the sync status under the
// rows when the app is offline or sync failed. Swipes, the grace period and the context
// menu join in tasks 2.2 and 2.3.
import * as Haptics from 'expo-haptics'
import { useCallback } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatClock } from '@shared/dates'
import { t } from '@shared/i18n'
import { completeTask } from '@shared/ops'
import { useSyncStatus } from '@shared/sync'
import type { Task } from '@shared/types'
import { useColors, type Colors } from '../theme'

/** What sync has to say when it is not simply up to date: offline, or an error. */
function useSyncNote(): string | null {
  const s = useSyncStatus()
  if (s.state === 'offline') return s.lastSyncedAt ? `${t('Offline')} · ${formatClock(s.lastSyncedAt, false)}` : t('Offline')
  if (s.state === 'error') return s.error ?? t('Sync failed')
  return null
}

interface Props {
  /** undefined until the first read answered. */
  tasks: readonly Task[] | undefined
  testID: string
}

export default function TaskList({ tasks, testID }: Props) {
  const c = useColors()
  const syncing = useSyncStatus().state === 'syncing'
  const note = useSyncNote()
  const complete = useCallback((id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void completeTask(id)
  }, [])
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={tasks as Task[] | undefined ?? []}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: c.field }]} />}
      keyExtractor={(task) => task.id}
      ListEmptyComponent={tasks === undefined || syncing ? <ActivityIndicator color={c.muted} style={styles.waiting} /> : undefined}
      ListFooterComponent={note ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: c.muted }]} testID="sync-note">{note}</Text> : undefined}
      renderItem={({ item }) => <Row c={c} onComplete={complete} task={item} />}
      style={{ backgroundColor: c.bg }}
      testID={testID}
    />
  )
}

function Row({ task, c, onComplete }: { task: Task; c: Colors; onComplete(id: string): void }) {
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={t('Complete {title}', { title: task.title })}
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
  row: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 52, paddingHorizontal: 20, paddingVertical: 12 },
  circle: { borderRadius: 12, borderWidth: 1.5, height: 24, width: 24 },
  task: { flex: 1, fontSize: 17, lineHeight: 22 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  waiting: { marginTop: 48 },
  note: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
})
