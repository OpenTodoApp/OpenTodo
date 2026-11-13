// A task screen (Today's groups, Upcoming's days, the Inbox as one group): a native
// section list with sticky headings, rows that swipe (ui/TaskRow), and the sync status
// under the rows. A section without a title has no heading. A task completed a moment
// ago stays in its place until its grace period ends (ui/RowActions).
import { useNavigation, type NavigationProp } from '@react-navigation/native'
import { useCallback, useRef, useState, type ReactElement, type Ref } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { formatClock } from '@shared/dates'
import { t } from '@shared/i18n'
import { syncNow, useSyncStatus } from '@shared/sync'
import type { Task } from '@shared/types'
import { useColors } from '../theme'
import { useRowActions, withLingering } from './RowActions'
import TaskRow from './TaskRow'

export interface TaskSection { key: string; title?: string; data: Task[] }

/** What sync has to say when it is not simply up to date: offline, or an error. */
function useSyncNote(): string | null {
  const s = useSyncStatus()
  if (s.state === 'offline') return s.lastSyncedAt ? `${t('Offline')} · ${formatClock(s.lastSyncedAt, false)}` : t('Offline')
  if (s.state === 'error') return s.error ?? t('Sync failed')
  return null
}

interface Props {
  /** undefined until the first read answered. */
  sections: TaskSection[] | undefined
  header?: ReactElement
  listRef?: Ref<SectionList<Task, TaskSection>>
  testID: string
}

export default function TaskSections({ sections, header, listRef, testID }: Props) {
  const c = useColors()
  const actions = useRowActions()
  const navigation = useNavigation<NavigationProp<{ Schedule: { id: string } }>>()
  const note = useSyncNote()
  // The sections as last shown, so a task that just left them can keep its place.
  const previous = useRef<TaskSection[]>([])
  const shown = sections && withLingering(sections, previous.current, actions.lingering)
  if (shown) previous.current = shown
  // Pull to sync (D3): the system's refresh control, shown until the exchange ends.
  const [pulling, setPulling] = useState(false)
  const pull = useCallback(() => {
    setPulling(true)
    void syncNow().catch(() => undefined).finally(() => setPulling(false))
  }, [])
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: c.field }]} />}
      keyExtractor={(task) => task.id}
      ListEmptyComponent={sections === undefined ? <ActivityIndicator color={c.muted} style={styles.waiting} /> : undefined}
      ListFooterComponent={note ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: c.muted }]} testID="sync-note">{note}</Text> : undefined}
      ListHeaderComponent={header}
      onScrollToIndexFailed={() => undefined}
      ref={listRef}
      refreshControl={<RefreshControl onRefresh={pull} refreshing={pulling} tintColor={c.muted} />}
      renderItem={({ item }) => (
        <TaskRow
          c={c}
          done={actions.lingering.has(item.id)}
          onComplete={actions.complete}
          onDelete={actions.trash}
          onSchedule={(task) => navigation.navigate('Schedule', { id: task.id })}
          task={item}
        />
      )}
      renderSectionHeader={({ section }) => (section.title
        ? <Text accessibilityRole="header" style={[styles.heading, { backgroundColor: c.bg, color: c.muted }]}>{section.title}</Text>
        : null)}
      sections={shown ?? []}
      stickySectionHeadersEnabled
      style={{ backgroundColor: c.bg }}
      testID={testID}
    />
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 6, paddingTop: 16, textTransform: 'uppercase' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  waiting: { marginTop: 48 },
  note: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
})
