// Upcoming (native-app-everyday D1): the next 14 days as list sections, from the shared
// Upcoming rule over the phone's database, with one row of chrome under the title: the
// week strip, whose days jump to their section.
import { useRef } from 'react'
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import { addDaysISO, formatDateHeading, formatDateParts } from '@shared/dates'
import type { Task } from '@shared/types'
import { useLive } from '../data/useLive'
import { useToday } from '../data/useToday'
import { upcomingDays, type UpcomingDay } from '../storage/lists'
import { useColors } from '../theme'
import { listStyles, TaskRow, useComplete, useSyncNote } from '../ui/TaskList'

type Section = { date: string; data: Task[] }

export default function UpcomingScreen() {
  const c = useColors()
  const today = useToday()
  const days = useLive(() => upcomingDays(today), ['tasks', 'projects'], [today])
  const complete = useComplete()
  const note = useSyncNote()
  const list = useRef<SectionList<Task, Section>>(null)
  const sections: Section[] = (days ?? []).map((d: UpcomingDay) => ({ date: d.date, data: d.tasks }))
  const jump = (date: string) => {
    const index = sections.findIndex((s) => s.date >= date)
    if (index >= 0) list.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 0 })
  }
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      ItemSeparatorComponent={() => <View style={[listStyles.separator, { backgroundColor: c.field }]} />}
      keyExtractor={(task) => task.id}
      ListEmptyComponent={days === undefined ? <ActivityIndicator color={c.muted} style={listStyles.waiting} /> : undefined}
      ListFooterComponent={note ? <Text accessibilityLiveRegion="polite" style={[listStyles.note, { color: c.muted }]} testID="sync-note">{note}</Text> : undefined}
      ListHeaderComponent={<WeekStrip busy={new Set(sections.map((s) => s.date))} onDay={jump} today={today} />}
      onScrollToIndexFailed={() => undefined}
      ref={list}
      renderItem={({ item }) => <TaskRow c={c} onComplete={complete} task={item} />}
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" style={[styles.day, { backgroundColor: c.bg, color: c.muted }]}>{formatDateHeading(section.date, today)}</Text>
      )}
      sections={sections}
      stickySectionHeadersEnabled
      style={{ backgroundColor: c.bg }}
      testID="upcoming"
    />
  )
}

/** The seven days after today: the weekday's letter over the day's number, bold when the day has tasks. */
function WeekStrip({ today, busy, onDay }: { today: string; busy: ReadonlySet<string>; onDay(date: string): void }) {
  const c = useColors()
  return (
    <View style={styles.strip}>
      {Array.from({ length: 7 }, (_, i) => addDaysISO(today, i + 1)).map((date) => (
        <Pressable
          accessibilityLabel={formatDateHeading(date, today)}
          accessibilityRole="button"
          disabled={!busy.has(date)}
          key={date}
          onPress={() => onDay(date)}
          style={styles.stripDay}
          testID={`day-${date}`}
        >
          <Text style={[styles.weekday, { color: c.muted }]}>{formatDateParts(date, { weekday: 'narrow' })}</Text>
          <Text style={[styles.number, { color: busy.has(date) ? c.text : c.muted, fontWeight: busy.has(date) ? '600' : '400' }]}>{Number(date.slice(8))}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8 },
  stripDay: { alignItems: 'center', flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  weekday: { fontSize: 12 },
  number: { fontSize: 17 },
  day: { fontSize: 13, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 6, paddingTop: 16, textTransform: 'uppercase' },
})
