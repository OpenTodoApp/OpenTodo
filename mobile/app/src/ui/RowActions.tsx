// A task row's actions and their Undo (native-app-everyday D3). Completing writes at
// once; the row then stays where it was, drawn completed, for a grace period, and a
// toast offers Undo for the last action. One provider serves every list of a tab.
import * as Haptics from 'expo-haptics'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { DuePick } from '@shared/bulk'
import { t } from '@shared/i18n'
import type { Task } from '@shared/types'
import { completeTask, scheduleTask, trashTask, undo } from '../data/actions'
import { useColors } from '../theme'

/** How long a completed row stays in place, and the toast with it. */
export const GRACE_MS = 5000

export interface RowActions {
  complete(task: Task): void
  trash(task: Task): void
  schedule(task: Task, pick: DuePick): void
  /** The tasks completed a moment ago, still shown in their place. */
  lingering: ReadonlyMap<string, Task>
  /** The last action, while its Undo is offered. */
  toast: { text: string } | null
  undo(): void
}

const Context = createContext<RowActions | null>(null)

export function useRowActions(): RowActions {
  const actions = useContext(Context)
  if (!actions) throw new Error('useRowActions outside RowActionsProvider')
  return actions
}

interface Toast { text: string; undoId: string; task: string }

export function RowActionsProvider({ children }: { children: ReactNode }) {
  const [lingering, setLingering] = useState<ReadonlyMap<string, Task>>(new Map())
  const [toast, setToast] = useState<Toast | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer) }, [])

  const release = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setLingering((now) => {
      if (!now.has(id)) return now
      const next = new Map(now)
      next.delete(id)
      return next
    })
    setToast((now) => (now?.task === id ? null : now))
  }, [])

  const offer = useCallback((task: Task, text: string, undoId: string | null) => {
    if (!undoId) return
    setToast({ text, undoId, task: task.id })
    timers.current.set(task.id, setTimeout(() => release(task.id), GRACE_MS))
  }, [release])

  const onUndo = useCallback(() => {
    if (!toast) return
    const { undoId, task } = toast
    release(task)
    void undo(undoId)
  }, [toast, release])

  const actions = useMemo<RowActions>(() => ({
    lingering,
    toast,
    undo: onUndo,
    complete(task) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setLingering((now) => new Map(now).set(task.id, task))
      void completeTask(task.id).then((id) => (id ? offer(task, t('Completed'), id) : release(task.id)), () => release(task.id))
    },
    trash(task) {
      void trashTask(task.id).then((id) => offer(task, t('Deleted'), id), () => undefined)
    },
    schedule(task, pick) {
      void scheduleTask(task, pick).then((id) => offer(task, t('Rescheduled'), id), () => undefined)
    },
  }), [lingering, toast, onUndo, offer, release])

  return <Context.Provider value={actions}>{children}</Context.Provider>
}

/** The toast of the last action with its Undo, over the bottom of a tab's content. */
export function ActionToast({ right = 16 }: { right?: number }) {
  const c = useColors()
  const { toast, undo: onUndo } = useRowActions()
  if (!toast) return null
  return (
    <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.text, right }]} testID="toast">
      <Text style={[styles.toastText, { color: c.bg }]}>{toast.text}</Text>
      <Pressable accessibilityRole="button" hitSlop={12} onPress={onUndo} testID="undo">
        <Text style={[styles.undo, { color: c.bg }]}>{t('Undo')}</Text>
      </Pressable>
    </View>
  )
}

/**
 * `sections` with the tasks completed a moment ago put back where they were in
 * `previous` (the sections as last shown): same section, same place, until their grace
 * period ends. A task whose section is gone gets its section back.
 */
export function withLingering<S extends { key: string; data: Task[] }>(sections: S[], previous: S[], lingering: ReadonlyMap<string, Task>): S[] {
  if (!lingering.size) return sections
  const shown = new Set(sections.flatMap((s) => s.data.map((task) => task.id)))
  const missing = [...lingering.keys()].filter((id) => !shown.has(id))
  if (!missing.length) return sections
  const out = sections.map((s) => ({ ...s, data: [...s.data] }))
  for (const before of previous) {
    before.data.forEach((task, index) => {
      if (!missing.includes(task.id)) return
      let section = out.find((s) => s.key === before.key)
      if (!section) {
        section = { ...before, data: [] }
        // Keep the sections in the order they were in.
        const after = previous.slice(previous.indexOf(before) + 1).map((s) => s.key)
        const at = out.findIndex((s) => after.includes(s.key))
        out.splice(at < 0 ? out.length : at, 0, section)
      }
      section.data.splice(Math.min(index, section.data.length), 0, lingering.get(task.id)!)
    })
  }
  return out
}

const styles = StyleSheet.create({
  toast: { alignItems: 'center', borderRadius: 12, elevation: 4, flexDirection: 'row', justifyContent: 'space-between', bottom: 16, left: 16, minHeight: 48, paddingHorizontal: 16, position: 'absolute' },
  toastText: { fontSize: 15 },
  undo: { fontSize: 15, fontWeight: '700' },
})
