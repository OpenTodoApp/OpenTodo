import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, db, syncedTables, useDatabase } from '../db'
import { resetDeviceId } from '../ops'
import { FOCUS_DEFAULTS } from './prefs'
import { readFocus, transitionFocus, writeFocus } from './state'
import { finish, idleState, start } from './timer'

// The timer row (OpenSpec focus-mode, task 2.2; sync-focus-sessions task 2.1).

const T0 = new Date(2026, 9, 20, 9, 0).getTime()
let n = 0
beforeEach(() => {
  useDatabase(`focus-state-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('focus state on the device', () => {
  it('a reload keeps the row (a new connection reads it back)', async () => {
    const s = start(idleState('a', 'pomodoro', T0), T0, FOCUS_DEFAULTS)
    await writeFocus(s)
    const name = db.name
    db.close()
    useDatabase(name)
    expect(await readFocus()).toMatchObject({ ...s, remote: false })
  })

  it('two concurrent transitions of one run write once', async () => {
    const s = start(idleState('a', 'pomodoro', T0), T0, FOCUS_DEFAULTS)
    await writeFocus(s)
    const end = (r: typeof s) => (r.phase === 'work' ? finish(r, FOCUS_DEFAULTS) : null)
    const [one, two] = await Promise.all([transitionFocus(s.startedAt, end), transitionFocus(s.startedAt, end)])
    expect([one, two].filter(Boolean)).toHaveLength(1)
    expect((await readFocus())?.phase).toBe('done')
    // A run that moved on is left alone.
    expect(await transitionFocus(T0 - 1, end)).toBeNull()
  })

  it('is not a synced table: a write is one focus_run op on the preferences row (sync-focus-sessions D1); sign-out empties the row', async () => {
    await writeFocus(idleState('a', 'pomodoro', T0))
    expect((await db.outbox.toArray()).map((o) => `${o.entity}.${o.field}`)).toEqual(['user_prefs.focus_run'])
    expect(syncedTables().map((t) => t.name)).not.toContain('focus')
    await clearLocalData()
    expect(await readFocus()).toBeNull()
  })
})
