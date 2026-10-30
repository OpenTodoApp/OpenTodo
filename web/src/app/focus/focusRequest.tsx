// Today's focus by touch (OpenSpec change phone-touch-focus, design D3): what a
// task's menus offer (Add to focus, Put in a slot, Remove from focus), and the
// picker the shell mounts once and loads only when asked for: a task for an empty
// slot, or a slot for a task. The rules and the writes (lib/focusEdit) load with
// the first use, so the menus cost the first load only this file.
import { lazy, Suspense } from 'react'
import { readFocusStyle, type BentoSlot } from '../../lib/bento'
import { t } from '../../lib/i18n'
import { useReviewRow, useUserPrefsRow } from '../../lib/localData'
import { storedFocus } from '../../lib/review'
import { createStore } from '../../lib/store'
import type { Review, Task, UserPrefs } from '../../lib/types'
import { MenuItem } from '../../ui'
import { act } from '../actionError'
import { PanelBoundary } from '../PanelBoundary'
import { useToday } from '../useViews'

/** A task for a slot (`slot` null: any room, by the rules), or a slot for one task. */
export type FocusPickRequest = { mode: 'task'; slot: BentoSlot | null } | { mode: 'slot'; taskId: string }

const requested = createStore<FocusPickRequest | null>('focusPicker', null)

/** Opens the picker. */
export function requestFocusPick(r: FocusPickRequest): void {
  requested.set(r)
}

/** The focus command a task offers: Add (Three tasks), Slot (Bento), Remove, or none. */
export type FocusMenuState = 'add' | 'slot' | 'remove' | null

export function focusMenuState(task: Pick<Task, 'id' | 'completed_at' | 'deleted_at'> | undefined, review: Pick<Review, 'focus' | 'focus_date'> | null | undefined,
  prefs: Partial<UserPrefs> | null | undefined, today: string): FocusMenuState {
  // A completed or deleted task has left the focus already (weekly-review "Daily check").
  if (!task || task.completed_at || task.deleted_at) return null
  if (storedFocus(review, today).includes(task.id)) return 'remove'
  return readFocusStyle(prefs) === 'bento' ? 'slot' : 'add'
}

export function focusMenuLabel(state: Exclude<FocusMenuState, null>): string {
  return state === 'remove' ? t('Remove from focus') : state === 'slot' ? t('Put in a slot') : t('Add to focus')
}

/** Runs the command on `id` by the rules `f` follows, with a toast and Undo. */
export function runFocusPress(id: string): void {
  act(import('./focusActions').then((m) => m.pressFromMenu(id)))
}

/** The command of a task's menu (panel, page, Focus screen); the focus is personal, so viewers too. */
export function FocusMenuItem({ task }: { task: Task }) {
  const review = useReviewRow()
  const prefs = useUserPrefsRow()
  const today = useToday()
  const state = focusMenuState(task, review, prefs, today)
  if (!state) return null
  return <MenuItem label={focusMenuLabel(state)} icon={state === 'remove' ? 'x' : 'sun'} data-focus-menu={state} onSelect={() => runFocusPress(task.id)} />
}

const FocusPicker = lazy(() => import('./FocusPicker'))

/** Mounted once by the shell. */
export function FocusPickerHost() {
  const r = requested.use()
  if (!r) return null
  return <PanelBoundary><Suspense fallback={null}><FocusPicker key={r.mode === 'slot' ? `slot:${r.taskId}` : `task:${r.slot ?? ''}`} request={r} onClose={() => requested.set(null)} /></Suspense></PanelBoundary>
}
