// @vitest-environment happy-dom
// actionErrorMessage (OpenSpec change client-sync-robustness, "Clearer feedback for
// refused actions"): local refusals read in the interface language, anything else is
// shown as it came. The errors come from the real lib functions, so rewording a
// sentence there cannot silently break its translation.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../lib/db'
import { applyLanguagePreference, t } from '../lib/i18n'
import { LOCAL_ERRORS } from '../lib/localErrors'
import { createProject, createSubtask, createTask, moveProject, resetDeviceId, restoreTask } from '../lib/ops'
import { addReminder } from '../lib/reminders'
import { startTracking, updateTimeEntry } from '../lib/timeEntries'
import { setCurrentUserId } from '../lib/sharing'
import { actionErrorMessage } from './actionError'

let n = 0
beforeEach(async () => {
  useDatabase(`action-error-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('u1')
})
afterEach(() => applyLanguagePreference('en', ['en-US']))

/** The error a lib call refuses with. */
async function refusal(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (e) {
    return e
  }
  throw new Error('expected the call to refuse')
}

// Each refusal a person can cause, raised by the real function that throws it.
const REFUSALS: [string, string, () => Promise<unknown>, string][] = [
  [LOCAL_ERRORS.projectNotFound, 'That project is not available any more.', () => moveProject('missing', null), 'Ce projet n’est plus disponible.'],
  [LOCAL_ERRORS.parentProjectNotFound, 'The parent project is not available any more.', async () => moveProject(await createProject({ name: 'p' }), 'missing'), 'Le projet parent n’est plus disponible.'],
  [LOCAL_ERRORS.taskNotFound, 'That task is not available any more.', () => restoreTask('missing'), 'Cette tâche n’est plus disponible.'],
  [LOCAL_ERRORS.parentTaskNotFound, 'The parent task is not available any more.', () => createSubtask('missing', 'child'), 'La tâche parente n’est plus disponible.'],
  [LOCAL_ERRORS.timeEntryNotFound, 'That time entry is not available any more.', () => updateTimeEntry('missing', { note: 'x' }), 'Cette entrée de temps n’est plus disponible.'],
  [LOCAL_ERRORS.reminderTimeRequired, 'Set a time for the reminder first.', async () => addReminder(await createTask({ title: 'a' }), { kind: 'absolute', fire_at: 0 }), 'Définissez d’abord une heure pour le rappel.'],
  [LOCAL_ERRORS.offsetNotWhole, 'The reminder offset must be whole minutes.', async () => addReminder(await createTask({ title: 'a' }), { kind: 'relative', offset_minutes: 1.5 }), 'Le décalage du rappel doit être un nombre entier de minutes.'],
]

describe('actionErrorMessage', () => {
  it.each(REFUSALS)('translates the refusal %s raised by the lib', async (sentence, english, run, french) => {
    const err = await refusal(run)
    expect((err as Error).message).toBe(sentence)
    expect(actionErrorMessage(err)).toBe(english)
    await applyLanguagePreference('fr', ['en-US'])
    expect(actionErrorMessage(err)).toBe(french)
  })

  it('translates "not signed in" when nobody is signed in', async () => {
    useDatabase(`action-error-signed-out-${Date.now()}-${n++}`) // no sign-in recorded on this device
    const err = await refusal(() => startTracking('t1'))
    expect((err as Error).message).toBe(LOCAL_ERRORS.notSignedIn)
    await applyLanguagePreference('fr', ['en-US'])
    expect(actionErrorMessage(err)).toBe(t('Sign in to continue.'))
    expect(actionErrorMessage(err)).not.toBe('Sign in to continue.')
  })

  it('leaves an unknown message unchanged', async () => {
    await applyLanguagePreference('fr', ['en-US'])
    expect(actionErrorMessage(new Error('the server is on fire'))).toBe('the server is on fire')
  })

  it('falls back to the generic sentence for a value that is not an Error, or has no message', async () => {
    expect(actionErrorMessage('boom')).toBe('The change could not be saved.')
    expect(actionErrorMessage(undefined)).toBe('The change could not be saved.')
    expect(actionErrorMessage(new Error(''))).toBe('The change could not be saved.')
    await applyLanguagePreference('fr', ['en-US'])
    expect(actionErrorMessage(42)).toBe(t('The change could not be saved.'))
    expect(actionErrorMessage(42)).not.toBe('The change could not be saved.')
  })

  it('translates every sentence the lib exports', async () => {
    await applyLanguagePreference('fr', ['en-US'])
    for (const sentence of Object.values(LOCAL_ERRORS)) expect(actionErrorMessage(new Error(sentence))).not.toBe(sentence)
  })
})
