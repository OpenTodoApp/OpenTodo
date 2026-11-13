// When a task is done: the quick choices (native-app-everyday D5). The natural-language
// line, the calendar, the time and the recurrence join this sheet in task 4.2.
import { useNavigation } from '@react-navigation/native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { DuePick } from '@shared/bulk'
import { db } from '@shared/db'
import { t } from '@shared/i18n'
import { useColors } from '../theme'
import { useRowActions } from '../ui/RowActions'

const CHOICES: { pick: DuePick; label: () => string; id: string }[] = [
  { pick: 'today', label: () => t('Today'), id: 'today' },
  { pick: 'tomorrow', label: () => t('Tomorrow'), id: 'tomorrow' },
  { pick: 'next-week', label: () => t('Next week'), id: 'next-week' },
  { pick: null, label: () => t('No date'), id: 'none' },
]

export default function ScheduleSheet({ id }: { id: string }) {
  const c = useColors()
  const navigation = useNavigation()
  const actions = useRowActions()
  const choose = async (pick: DuePick) => {
    navigation.goBack()
    const task = await db.tasks.get(id)
    if (task) actions.schedule(task, pick)
  }
  return (
    <View style={[styles.sheet, { backgroundColor: c.bg }]}>
      {CHOICES.map((choice) => (
        <Pressable accessibilityRole="button" key={choice.id} onPress={() => { void choose(choice.pick) }} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.field : c.bg }]} testID={`when-${choice.id}`}>
          <Text style={[styles.label, { color: c.text }]}>{choice.label()}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: 24 },
  row: { justifyContent: 'center', minHeight: 52, paddingHorizontal: 20 },
  label: { fontSize: 17 },
})
