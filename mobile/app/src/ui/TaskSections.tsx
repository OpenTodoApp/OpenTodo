// A task screen in sections (Today's groups, Upcoming's days): a native section list
// with sticky headings, the same rows and completion as TaskList, and the sync status
// under the rows. A section without a title has no heading.
import type { ReactElement, Ref } from 'react'
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native'
import type { Task } from '@shared/types'
import { useColors } from '../theme'
import { listStyles, TaskRow, useComplete, useSyncNote } from './TaskList'

export interface TaskSection { key: string; title?: string; data: Task[] }

interface Props {
  /** undefined until the first read answered. */
  sections: TaskSection[] | undefined
  header?: ReactElement
  listRef?: Ref<SectionList<Task, TaskSection>>
  testID: string
}

export default function TaskSections({ sections, header, listRef, testID }: Props) {
  const c = useColors()
  const complete = useComplete()
  const note = useSyncNote()
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={[listStyles.separator, { backgroundColor: c.field }]} />}
      keyExtractor={(task) => task.id}
      ListEmptyComponent={sections === undefined ? <ActivityIndicator color={c.muted} style={listStyles.waiting} /> : undefined}
      ListFooterComponent={note ? <Text accessibilityLiveRegion="polite" style={[listStyles.note, { color: c.muted }]} testID="sync-note">{note}</Text> : undefined}
      ListHeaderComponent={header}
      onScrollToIndexFailed={() => undefined}
      ref={listRef}
      renderItem={({ item }) => <TaskRow c={c} onComplete={complete} task={item} />}
      renderSectionHeader={({ section }) => (section.title
        ? <Text accessibilityRole="header" style={[styles.heading, { backgroundColor: c.bg, color: c.muted }]}>{section.title}</Text>
        : null)}
      sections={sections ?? []}
      stickySectionHeadersEnabled
      style={{ backgroundColor: c.bg }}
      testID={testID}
    />
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 6, paddingTop: 16, textTransform: 'uppercase' },
})
