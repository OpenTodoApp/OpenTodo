import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../db'
import { applyOps, resetDeviceId } from '../ops'
import type { Op } from '../types'
import { autoStartValue, FOCUS_DEFAULTS, FocusBoundsError, focusPrefs, setFocusPref } from './prefs'

// Focus preferences (OpenSpec focus-mode, task 1.2): defaults, values from a newer
// client, bounds before a write, per-field convergence of two devices.

let n = 0
beforeEach(() => {
  useDatabase(`focus-prefs-${Date.now()}-${n++}`)
  resetDeviceId()
})

describe('focus preferences', () => {
  it('Defaults: Pomodoro, 25, 5 and 15 minutes, a long break every 4, no auto-start, reminder and sound off', () => {
    expect(focusPrefs(null)).toEqual(FOCUS_DEFAULTS)
    expect(FOCUS_DEFAULTS).toEqual({ mode: 'pomodoro', workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4, autoStartBreaks: false, autoStartWork: false, breakAfterMinutes: 0, sound: false })
    expect(focusPrefs({ focus_mode: '', focus_work_minutes: 0, focus_auto_start: '' })).toEqual(FOCUS_DEFAULTS)
  })

  it('Unknown mode from a newer client: runs Pomodoro and keeps the stored value', async () => {
    await applyOps([{ id: 'o1', entity: 'user_prefs', entityId: 'me', field: 'focus_mode', value: 'interval', ts: Date.now(), device: 'newer' } as Op])
    const row = await db.userPrefs.get('me')
    expect(focusPrefs(row).mode).toBe('pomodoro')
    expect(row?.focus_mode).toBe('interval')
    expect(await db.outbox.count()).toBe(0)
  })

  it('reads out-of-range numbers and unknown switches as the defaults', () => {
    const p = focusPrefs({ focus_work_minutes: 400, focus_long_break_every: 13, focus_break_after_minutes: 5, focus_auto_start: 'sometimes', focus_sound: 'loud' })
    expect(p).toMatchObject({ workMinutes: 25, longBreakEvery: 4, breakAfterMinutes: 0, autoStartBreaks: false, autoStartWork: false, sound: false })
    expect(focusPrefs({ focus_auto_start: 'both', focus_sound: 'on', focus_break_after_minutes: 90 })).toMatchObject({ autoStartBreaks: true, autoStartWork: true, sound: true, breakAfterMinutes: 90 })
    expect([autoStartValue(true, true), autoStartValue(true, false), autoStartValue(false, true), autoStartValue(false, false)]).toEqual(['both', 'breaks', 'work', 'none'])
  })

  it('Bounds: 0 and 400 minutes are refused and nothing is written; the reminder takes 0 as off', async () => {
    await expect(setFocusPref({ field: 'focus_work_minutes', value: 0 })).rejects.toBeInstanceOf(FocusBoundsError)
    await expect(setFocusPref({ field: 'focus_work_minutes', value: 400 })).rejects.toBeInstanceOf(FocusBoundsError)
    await expect(setFocusPref({ field: 'focus_long_break_every', value: 2.5 })).rejects.toBeInstanceOf(FocusBoundsError)
    expect(await db.outbox.count()).toBe(0)
    await setFocusPref({ field: 'focus_break_after_minutes', value: 0 })
    await setFocusPref({ field: 'focus_work_minutes', value: 50 })
    expect((await db.outbox.toArray()).map((o) => `${o.field}=${o.value}`)).toEqual(['focus_break_after_minutes=0', 'focus_work_minutes=50'])
    expect(focusPrefs(await db.userPrefs.get('me')).workMinutes).toBe(50)
  })

  it('Concurrent edits: the laptop\'s mode and the phone\'s work length both survive, in either order', async () => {
    const laptop = { id: 'l1', entity: 'user_prefs', entityId: 'me', field: 'focus_mode', value: 'flowtime', ts: 100, device: 'laptop' } as Op
    const phone = { id: 'p1', entity: 'user_prefs', entityId: 'me', field: 'focus_work_minutes', value: 30, ts: 90, device: 'phone' } as Op
    await applyOps([laptop])
    await applyOps([phone])
    const a = focusPrefs(await db.userPrefs.get('me'))
    useDatabase(`focus-prefs-other-${n++}`)
    await applyOps([phone])
    await applyOps([laptop])
    const b = focusPrefs(await db.userPrefs.get('me'))
    expect(a).toEqual(b)
    expect(a).toMatchObject({ mode: 'flowtime', workMinutes: 30 })
  })
})
