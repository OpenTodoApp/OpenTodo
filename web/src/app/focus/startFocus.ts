// "Start focus" from anywhere (OpenSpec change focus-everywhere, design D2): the
// panel header's Focus button, the task Actions menu and "Focus on this task"
// all call `startFocusOn`. It starts (or finds) the session through
// lib/focus/session.ts, opens /focus/<id>, asks for the length first in
// Countdown, and names a session it left on another task in a toast whose Undo
// brings that one back. It writes nothing but the session's time entry.
import { getTask } from '../../lib/localData'
import { readFocusPrefs } from '../../lib/focus/prefs'
import { resumeLeft, startFocus, type LeftSession } from '../../lib/focus/session'
import { primeTone } from '../../lib/focus/tone'
import { resettable } from '../../lib/moduleState'
import { createStore } from '../../lib/store'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { ACTION_TOAST_MS, showBulkToast } from '../bulk/toastStore'
import { navigate } from '../router'

/** The task whose Focus screen should open with the Countdown length dialog (read once by the screen). */
const askStore = createStore<string | null>('focusAskLength', null)
export const useAskLength = askStore.use
export const clearAskLength = (): void => askStore.set(null)
resettable('focusAskLengthStore', () => askStore.set(null))

/** The toast for a session left on another task, with Undo that returns to it and resumes it. */
async function offerReturn(left: LeftSession): Promise<void> {
  const task = await getTask(left.taskId)
  showBulkToast(t('Left {title}', { title: task?.title || t('Untitled') }), null, {
    ttl: ACTION_TOAST_MS,
    action: {
      label: t('Undo'),
      run: () => act(resumeLeft(left).then(() => navigate({ view: 'focus', id: left.taskId }))),
    },
  })
}

/**
 * Starts focus on a task and opens its Focus screen; `lengthMinutes` is the
 * Countdown length when it was already chosen (the dialog, a preset chip);
 * the Focus screen's own Start passes `force` and `navigate: false`.
 */
export async function startFocusOn(taskId: string, opts: { lengthMinutes?: number; navigate?: boolean; force?: boolean } = {}): Promise<void> {
  primeTone()
  const prefs = await readFocusPrefs()
  const r = await startFocus(taskId, prefs, { lengthMinutes: opts.lengthMinutes, force: opts.force })
  if (r.kind === 'ask') askStore.set(taskId)
  if (opts.navigate !== false) navigate({ view: 'focus', id: taskId })
  if (r.kind === 'started' && r.left) await offerReturn(r.left)
}
