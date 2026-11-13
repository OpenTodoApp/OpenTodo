// Upcoming (native-app-everyday D1): the next 14 days as list sections, from the shared
// Upcoming rule over the phone's database, with one row of chrome under the title: the
// week strip, whose days jump to their section.
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View, type SectionList } from 'react-native'
import { addDaysISO, formatDateHeading, formatDateParts } from '@shared/dates'
import type { Task } from '@shared/types'
import { useLive } from '../data/useLive'
import { useToday } from '../data/useToday'
import { upcomingDays } from '../storage/lists'
import { useColors } from '../theme'
import TaskSections, { type TaskSection } from '../ui/TaskSections'

export default function UpcomingScreen() {
  const today = useToday()
  const days = useLive(() => upcomingDays(today), ['tasks', 'projects'], [today])
  const list = useRef<SectionList<Task, TaskSection>>(null)
  const sections = days?.map((d): TaskSection => ({ key: d.date, title: formatDateHeading(d.date, today), data: d.tasks }))
  const jump = (date: string) => {
    const index = (sections ?? []).findIndex((s) => s.key >= date)
    if (index >= 0) list.current?.scrollToLocation({ sectionIndex: index, itemIndex: 0, viewOffset: 0 })
  }
  return (
    <TaskSections
      header={<WeekStrip busy={new Set((sections ?? []).map((s) => s.key))} onDay={jump} today={today} />}
      listRef={list}
      sections={sections}
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
})
