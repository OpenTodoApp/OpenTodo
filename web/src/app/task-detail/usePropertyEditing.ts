// Which property chip of the task panel is being edited, and which empty ones the
// Add menu revealed (OpenSpec change ux-overhaul, design D4), split out of
// Properties (web-component-structure). List keys (`b`, `Shift+N`, `d`, `e`) open
// the panel with an editor through the focus signals handled here.
import { type RefObject, useEffect, useRef, useState } from 'react'
import { blockedByFocus, deadlineFocus, deferFocus, estimateFocus, locationFocus } from '../signals'

/** The properties the Add menu can offer, in its order. */
export type Optional = 'deadline' | 'when' | 'evening' | 'reminders' | 'estimate' | 'repeat' | 'labels' | 'assignee' | 'blocked-by' | 'parent' | 'section' | 'location'

export interface ChipEditing {
  editing: boolean
  onEditingChange: (on: boolean) => void
}

export function usePropertyEditing(taskId: string, has: Record<Optional, boolean>, section: RefObject<HTMLElement | null>) {
  // Which optional property is being edited (one at a time), and which empty ones the
  // Add menu made visible until their editor closes without a value.
  const [editing, setEditingState] = useState<string | null>(null)
  const [shown, setShown] = useState<Set<Optional>>(() => new Set())
  const isEditing = (id: string) => editing === id
  const setEditing = (id: string, on: boolean) => setEditingState((cur) => (on ? id : cur === id ? null : cur))
  const reveal = (id: Optional) => { setShown((s) => new Set(s).add(id)); setEditingState(id) }
  // Another task starts with no editor open and nothing revealed (before the focus signals below).
  useEffect(() => { setEditingState(null); setShown(new Set()) }, [taskId])

  // `b`, `Shift+N`, `d` and `e` on a list row open the panel with that editor (task-dependencies 3.3,
  // someday-and-evening 3.3, deadlines 3.2, time-blocking).
  useEffect(() => {
    const subs = [
      [blockedByFocus, 'blocked-by'], [deferFocus, 'when'], [deadlineFocus, 'deadline'], [locationFocus, 'location'],
    ] as const
    for (const [ch, id] of subs) if (ch.take(taskId)) reveal(id)
    if (estimateFocus.take(taskId)) { estimateFocus.set(taskId); reveal('estimate') }
    const offs = subs.map(([ch, id]) => ch.subscribe((item) => { if (item === taskId && ch.take(item)) reveal(id) }))
    offs.push(estimateFocus.subscribe((entry) => { if (entry === taskId) reveal('estimate') }))
    return () => offs.forEach((off) => off())
  }, [taskId])

  // A chip the Add menu revealed leaves again when its editor closes without a value.
  // The value arrives through the live query a moment after the write, so the check
  // waits a beat; when the chip goes, focus moves to the Add control that made it.
  const hasRef = useRef(has)
  hasRef.current = has
  const shownRef = useRef(shown)
  shownRef.current = shown
  const settleRevealed = (id: Optional) => {
    if (!shownRef.current.has(id)) return
    window.setTimeout(() => {
      if (!shownRef.current.has(id)) return
      // With a value the chip stays as a set property but is no longer only revealed,
      // so clearing the value later removes it (web-lint-and-test-hygiene).
      const kept = hasRef.current[id]
      setShown((s) => { const n = new Set(s); n.delete(id); return n })
      if (!kept) section.current?.querySelector<HTMLElement>('[data-add-property] button[aria-haspopup]')?.focus()
    }, 50)
  }
  const chipProps = (id: Optional): ChipEditing => ({
    editing: isEditing(id),
    onEditingChange: (on: boolean) => {
      setEditing(id, on)
      if (!on) settleRevealed(id)
    },
  })
  /** Editing state of a chip that is always present (no reveal to settle). */
  const fixedChip = (id: string): ChipEditing => ({ editing: isEditing(id), onEditingChange: (on) => setEditing(id, on) })
  return { editing, isEditing, visible: (id: Optional) => has[id] || shown.has(id), reveal, chipProps, fixedChip }
}
