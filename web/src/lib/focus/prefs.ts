// Focus preferences (OpenSpec change focus-mode, design D5; focus-everywhere D5,
// D6): ten additive fields of the synced `user_prefs` row, plus the noise volume
// in device storage. Read through `focusPrefs`, which maps a missing,
// unknown or out-of-range value to its default without rewriting the row (a newer
// client's mode keeps working there); written one field at a time through the op
// log after a bounds check, so a change works offline and converges per field.
import { useMemo, useSyncExternalStore } from 'react'
import { readString, removeItem, writeString } from '../deviceStorage'
import { createSignal } from '../store'
import { db } from '../db'
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
  /** Countdown presets in minutes, in the user's order (focus-everywhere D5). */
  presets: number[]
  /** Background noise during work (focus-everywhere D6). */
  noise: FocusNoise
}

export const FOCUS_DEFAULTS: FocusPrefs = {
  mode: 'pomodoro', workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4,
  autoStartBreaks: false, autoStartWork: false, breakAfterMinutes: 0, sound: false,
  presets: [10, 20, 40], noise: 'off',
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
    presets: parsePresets(row?.focus_presets),
    noise: FOCUS_NOISES.includes(row?.focus_noise as FocusNoise) ? (row!.focus_noise as FocusNoise) : 'off',
  }
}

/** Background noise choices (focus-everywhere D6); the stored '' reads as off. */
export const FOCUS_NOISES = ['off', 'white', 'pink', 'brown'] as const
export type FocusNoise = (typeof FOCUS_NOISES)[number]

/** Countdown presets (focus-everywhere D5): up to four, each a whole number of minutes in COUNTDOWN_BOUNDS. */
export const MAX_PRESETS = 4
export const DEFAULT_PRESETS: readonly number[] = [10, 20, 40]

/** Whether a preset length is a whole number of minutes from 5 to 180. */
export function presetInBounds(v: number): boolean {
  return Number.isInteger(v) && v >= COUNTDOWN_BOUNDS[0] && v <= COUNTDOWN_BOUNDS[1]
}

/** The stored list as minutes: unreadable or out-of-range entries are ignored, duplicates dropped, at most four; nothing readable is the default. */
export function parsePresets(raw: string | null | undefined): number[] {
  const out: number[] = []
  for (const part of (raw ?? '').split(',')) {
    const text = part.trim()
    if (!/^\d+$/.test(text)) continue
    const v = Number(text)
    if (presetInBounds(v) && !out.includes(v)) out.push(v)
    if (out.length === MAX_PRESETS) break
  }
  return out.length ? out : [...DEFAULT_PRESETS]
}

/** A preset list outside the rules; nothing was written. */
export class FocusPresetsError extends RangeError {
  constructor() {
    super('focus_presets out of range')
    this.name = 'FocusPresetsError'
  }
}

/** The stored value of a preset list, refused (FocusPresetsError) when empty, longer than four or out of range; duplicates are dropped. An empty list stores '' (the default). */
export function presetsValue(list: readonly number[]): string {
  if (list.length > MAX_PRESETS || !list.every(presetInBounds)) throw new FocusPresetsError()
  return [...new Set(list)].join(',')
}

/** The device's noise volume (focus-everywhere D6): 0 to 100, never synced, removed at sign-out. */
export const NOISE_VOLUME_KEY = 'ot.focus.noiseVolume'
export const DEFAULT_NOISE_VOLUME = 40

/** The stored volume, or the default when absent or unreadable. */
export function readNoiseVolume(): number {
  const v = Number(readString(NOISE_VOLUME_KEY) ?? 'x')
  return Number.isInteger(v) && v >= 0 && v <= 100 ? v : DEFAULT_NOISE_VOLUME
}

const volumeChanged = createSignal()

/** Stores the device's volume (clamped to 0-100). */
export function writeNoiseVolume(v: number): void {
  writeString(NOISE_VOLUME_KEY, String(Math.max(0, Math.min(100, Math.round(v)))))
  volumeChanged.notify()
}

/** Removes the device's volume (sign-out). */
export function forgetNoiseVolume(): void {
  removeItem(NOISE_VOLUME_KEY)
  volumeChanged.notify()
}

/** The device's noise volume, live. */
export function useNoiseVolume(): number {
  return useSyncExternalStore(volumeChanged.subscribe, readNoiseVolume, readNoiseVolume)
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
  | { field: 'focus_presets'; value: string }
  | { field: 'focus_noise'; value: FocusNoise }
  | { field: FocusNumberField; value: number }

/** Writes one focus preference through the op log; a number out of range (0 is "off" for the reminder) is refused. */
export async function setFocusPref(w: FocusWrite): Promise<void> {
  if (w.field in FOCUS_BOUNDS) {
    const field = w.field as FocusNumberField
    const v = w.value as number
    if (!(field === 'focus_break_after_minutes' && v === 0) && !inBounds(field, v)) throw new FocusBoundsError(field)
  }
  if (w.field === 'focus_presets' && w.value !== '') presetsValue(w.value.split(',').map(Number))
  await mutate('user_prefs', USER_PREFS_ID, { [w.field]: w.value })
}

/** A mode's name as shown (the menu, the header, Settings). */
export function modeName(mode: FocusMode): string {
  return mode === 'flowtime' ? t('Flowtime') : mode === 'countdown' ? t('Countdown') : t('Pomodoro')
}

/** The stored focus preferences, read once (an action outside React). */
export async function readFocusPrefs(): Promise<FocusPrefs> {
  return focusPrefs(await db.userPrefs.get(USER_PREFS_ID))
}

/** The current focus preferences (the defaults while the row loads). */
export function useFocusPrefs(): FocusPrefs {
  const row = useUserPrefsRow()
  return useMemo(() => focusPrefs(row), [row])
}
