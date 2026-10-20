// Focus preferences (OpenSpec change focus-mode, design D5): eight additive fields
// of the synced `user_prefs` row. Read through `focusPrefs`, which maps a missing,
// unknown or out-of-range value to its default without rewriting the row (a newer
// client's mode keeps working there); written one field at a time through the op
// log after a bounds check, so a change works offline and converges per field.
import { useMemo } from 'react'
import { useUserPrefsRow } from '../localData'
import { mutate } from '../ops'
import type { UserPrefs } from '../types'
import { t } from '../i18n'
import { USER_PREFS_ID } from '../userPrefs'

export const FOCUS_MODES = ['pomodoro', 'flowtime', 'countdown'] as const
export type FocusMode = (typeof FOCUS_MODES)[number]

export const AUTO_STARTS = ['none', 'breaks', 'work', 'both'] as const
export type AutoStart = (typeof AUTO_STARTS)[number]

/** The allowed range of each number field (inclusive); the break reminder also takes 0 (off). */
export const FOCUS_BOUNDS = {
  focus_work_minutes: [1, 180],
  focus_short_break_minutes: [1, 180],
  focus_long_break_minutes: [1, 180],
  focus_long_break_every: [1, 12],
  focus_break_after_minutes: [15, 240],
} as const satisfies Record<string, readonly [number, number]>
export type FocusNumberField = keyof typeof FOCUS_BOUNDS

/** The Countdown length chosen per session (5 to 180 minutes); not a preference. */
export const COUNTDOWN_BOUNDS = [5, 180] as const

/** The break reminder length the switch fills in when the stored value is 0 (off). */
export const DEFAULT_BREAK_AFTER = 90

export interface FocusPrefs {
  mode: FocusMode
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
  autoStartBreaks: boolean
  autoStartWork: boolean
  /** Minutes of continuous work before the break reminder; 0 = off. */
  breakAfterMinutes: number
  sound: boolean
}

export const FOCUS_DEFAULTS: FocusPrefs = {
  mode: 'pomodoro', workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4,
  autoStartBreaks: false, autoStartWork: false, breakAfterMinutes: 0, sound: false,
}

/** Whether a number is a whole value inside the field's range. */
export function inBounds(field: FocusNumberField, value: number): boolean {
  const [min, max] = FOCUS_BOUNDS[field]
  return Number.isInteger(value) && value >= min && value <= max
}

const num = (field: FocusNumberField, v: unknown, fallback: number): number => (typeof v === 'number' && inBounds(field, v) ? v : fallback)

/** The preferences a stored row means; the row itself is never changed. */
export function focusPrefs(row: Partial<UserPrefs> | null | undefined): FocusPrefs {
  const auto: AutoStart = AUTO_STARTS.includes(row?.focus_auto_start as AutoStart) ? (row!.focus_auto_start as AutoStart) : 'none'
  return {
    mode: FOCUS_MODES.includes(row?.focus_mode as FocusMode) ? (row!.focus_mode as FocusMode) : FOCUS_DEFAULTS.mode,
    workMinutes: num('focus_work_minutes', row?.focus_work_minutes, FOCUS_DEFAULTS.workMinutes),
    shortBreakMinutes: num('focus_short_break_minutes', row?.focus_short_break_minutes, FOCUS_DEFAULTS.shortBreakMinutes),
    longBreakMinutes: num('focus_long_break_minutes', row?.focus_long_break_minutes, FOCUS_DEFAULTS.longBreakMinutes),
    longBreakEvery: num('focus_long_break_every', row?.focus_long_break_every, FOCUS_DEFAULTS.longBreakEvery),
    autoStartBreaks: auto === 'breaks' || auto === 'both',
    autoStartWork: auto === 'work' || auto === 'both',
    breakAfterMinutes: num('focus_break_after_minutes', row?.focus_break_after_minutes, 0),
    sound: row?.focus_sound === 'on',
  }
}

/** The stored value of the two auto-start switches. */
export function autoStartValue(breaks: boolean, work: boolean): AutoStart {
  return breaks && work ? 'both' : breaks ? 'breaks' : work ? 'work' : 'none'
}

/** A number outside its field's range; nothing was written. */
export class FocusBoundsError extends RangeError {
  constructor(readonly field: FocusNumberField) {
    super(`${field} out of range`)
    this.name = 'FocusBoundsError'
  }
}

type FocusWrite =
  | { field: 'focus_mode'; value: FocusMode }
  | { field: 'focus_auto_start'; value: AutoStart }
  | { field: 'focus_sound'; value: 'off' | 'on' }
  | { field: FocusNumberField; value: number }

/** Writes one focus preference through the op log; a number out of range (0 is "off" for the reminder) is refused. */
export async function setFocusPref(w: FocusWrite): Promise<void> {
  if (w.field in FOCUS_BOUNDS) {
    const field = w.field as FocusNumberField
    const v = w.value as number
    if (!(field === 'focus_break_after_minutes' && v === 0) && !inBounds(field, v)) throw new FocusBoundsError(field)
  }
  await mutate('user_prefs', USER_PREFS_ID, { [w.field]: w.value })
}

/** A mode's name as shown (the menu, the header, Settings). */
export function modeName(mode: FocusMode): string {
  return mode === 'flowtime' ? t('Flowtime') : mode === 'countdown' ? t('Countdown') : t('Pomodoro')
}

/** The current focus preferences (the defaults while the row loads). */
export function useFocusPrefs(): FocusPrefs {
  const row = useUserPrefsRow()
  return useMemo(() => focusPrefs(row), [row])
}
