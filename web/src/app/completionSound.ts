import { completionSoundOn } from '../lib/completionSoundPref'
import { playCompletionTone, primeTone, supportsTone } from '../lib/focus/tone'
import { currentUserPrefsRow, getTask } from '../lib/localData'
import { setTaskCompleted } from '../lib/ops'
import { shell } from '../lib/shell'

function mobileShell() {
  const host = shell()
  return host?.platform === 'ios' || host?.platform === 'android' ? host : null
}

export function canPlayCompletionSound(): boolean {
  const host = mobileShell()
  return host ? host.capabilities.includes('completion-sound') && !!host.playCompletionSound : supportsTone()
}

/** Prepare only in the initiating gesture. The caller plays the cue after a successful write. */
export function prepareCompletionSound(completing: boolean): (() => void) | undefined {
  if (!completing || typeof document === 'undefined' || document.visibilityState === 'hidden' || !completionSoundOn(currentUserPrefsRow()) || !canPlayCompletionSound()) return
  const host = mobileShell()
  if (!host) primeTone()
  return () => {
    if (document.visibilityState === 'hidden' || !completionSoundOn(currentUserPrefsRow())) return
    try {
      if (host) host.playCompletionSound?.()
      else playCompletionTone()
    } catch {
      // Audio is best effort and never affects the already completed action.
    }
  }
}

/** Keep the direct UI action's existing write semantics and omit the cue for stale/missing rows. */
export async function setTaskCompletedWithFeedback(id: string, completed: boolean): Promise<void> {
  const cue = prepareCompletionSound(completed)
  const before = cue ? await getTask(id).catch(() => undefined) : undefined
  await setTaskCompleted(id, completed)
  if (before && !before.deleted_at && !before.completed_at) cue?.()
}
