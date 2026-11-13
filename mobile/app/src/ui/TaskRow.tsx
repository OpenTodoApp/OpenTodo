// A task row (native-app-everyday D3): the circle and a full swipe right complete, a
// swipe left shows Schedule and Delete, and each action is also an accessibility action
// of the row, so VoiceOver and TalkBack reach them without the gesture.
import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import { formatTime, localDueOf } from '@shared/dates'
import { t } from '@shared/i18n'
import type { Task } from '@shared/types'
import type { Colors } from '../theme'

interface Props {
  task: Task
  c: Colors
  /** Completed a moment ago: drawn completed, in place, until its grace period ends. */
  done: boolean
  onComplete(task: Task): void
  onSchedule(task: Task): void
  onDelete(task: Task): void
}

export default function TaskRow({ task, c, done, onComplete, onSchedule, onDelete }: Props) {
  const swipe = useRef<SwipeableMethods>(null)
  // The do-on time, in the viewer's zone, when the task has one.
  const due = task.due ? localDueOf(task.due) : null
  const time = due?.time ? formatTime(due.time) : null
  const act = (fn: (task: Task) => void) => () => { swipe.current?.close(); fn(task) }
  return (
    <ReanimatedSwipeable
      enabled={!done}
      friction={1.5}
      leftThreshold={96}
      onSwipeableOpen={(direction) => { if (direction === 'right') act(onComplete)() }}
      overshootLeft={false}
      overshootRight={false}
      ref={swipe}
      renderLeftActions={() => (
        <View style={[styles.complete, { backgroundColor: c.done }]}>
          <Text style={styles.actionText}>{t('Complete')}</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.right}>
          <Pressable accessibilityRole="button" onPress={act(onSchedule)} style={[styles.action, { backgroundColor: c.accent }]} testID={`schedule-${task.title}`}>
            <Text style={styles.actionText}>{t('Schedule')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={act(onDelete)} style={[styles.action, { backgroundColor: c.error }]} testID={`delete-${task.title}`}>
            <Text style={styles.actionText}>{t('Delete')}</Text>
          </Pressable>
        </View>
      )}
      testID={`row-${task.title}`}
    >
      <View
        accessibilityActions={done ? [] : [
          { name: 'complete', label: t('Complete') },
          { name: 'schedule', label: t('Schedule') },
          { name: 'delete', label: t('Delete') },
        ]}
        accessible={false}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'complete') onComplete(task)
          if (nativeEvent.actionName === 'schedule') onSchedule(task)
          if (nativeEvent.actionName === 'delete') onDelete(task)
        }}
        style={[styles.row, { backgroundColor: c.bg }]}
      >
        <Pressable
          accessibilityLabel={t('Complete {title}', { title: task.title })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: done }}
          disabled={done}
          hitSlop={10}
          onPress={() => onComplete(task)}
          style={({ pressed }) => [styles.circle, { borderColor: done ? c.done : c.muted, backgroundColor: done ? c.done : pressed ? c.field : 'transparent' }]}
          testID={`complete-${task.title}`}
        />
        <View style={styles.text}>
          <Text numberOfLines={2} style={[styles.title, { color: done ? c.muted : c.text, textDecorationLine: done ? 'line-through' : 'none' }]}>{task.title}</Text>
          {time && <Text style={[styles.when, { color: c.muted }]}>{time}</Text>}
        </View>
      </View>
    </ReanimatedSwipeable>
  )
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 52, paddingHorizontal: 20, paddingVertical: 12 },
  circle: { borderRadius: 12, borderWidth: 1.5, height: 24, width: 24 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 22 },
  when: { fontSize: 13 },
  complete: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  right: { flexDirection: 'row' },
  action: { alignItems: 'center', justifyContent: 'center', minWidth: 96, paddingHorizontal: 16 },
  actionText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
})
