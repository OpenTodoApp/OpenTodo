// Settings → General → Focus (OpenSpec change focus-mode, design D5; settings-
// navigation "Account and General section contents", screen id settings/focus):
// the timer mode, the three lengths, the long-break cycle, the two auto-start
// switches, the break reminder and the sound; since focus-everywhere (D5, D6)
// also the Countdown presets, the background noise and this device's volume. Each row writes one synced
// `user_prefs` field after its bounds check; a value out of range is refused with
// the allowed range and nothing is written.
import { useState } from 'react'
import { Button, Input, Select, SettingRow, SettingsSection, Switch } from '../../ui'
import { autoStartValue, COUNTDOWN_BOUNDS, DEFAULT_BREAK_AFTER, FOCUS_BOUNDS, FOCUS_MODES, FOCUS_NOISES, inBounds, MAX_PRESETS, modeName, presetInBounds, presetsValue, setFocusPref, useFocusPrefs, useNoiseVolume, writeNoiseVolume, type FocusMode, type FocusNoise, type FocusNumberField, type FocusPrefs } from '../../lib/focus/prefs'
import { msg, t, translatedMap } from '../../lib/i18n'
import { act } from '../actionError'
import { cardCopy, rowCopy } from '../../lib/settingsCopy'
import { useResetOnChange } from '../../lib/useResetOnChange'

export function FocusSection() {
  const prefs = useFocusPrefs()
  return <FocusSettingsView prefs={prefs} />
}

/** A minutes (or count) field: commits a whole number inside its range on change, else shows the range. */
function NumberRow({ field, label, value, unit = 'minutes', description }: { field: FocusNumberField; value: number; unit?: 'minutes' | 'sessions'; label: string; description?: string }) {
  const [text, setText] = useState(String(value))
  useResetOnChange([value], () => setText(String(value)))
  const [min, max] = FOCUS_BOUNDS[field]
  const n = Number(text)
  const valid = text.trim() !== '' && inBounds(field, n)
  const id = `focus-${field}`
  const range = unit === 'minutes' ? t('From {min} to {max} minutes', { min, max }) : t('From {min} to {max} sessions', { min, max })
  return (
    <SettingRow label={label} htmlFor={id} description={valid ? description : undefined} status={valid ? undefined : <span className="text-danger" role="alert" data-focus-range={field}>{range}</span>} control={
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} className="sm:w-24" value={text} aria-invalid={!valid || undefined}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== '' && inBounds(field, v) && v !== value) act(setFocusPref({ field, value: v }))
        }} />
    } />
  )
}

const NOISE_LABEL = translatedMap<FocusNoise>({ off: msg('Off'), white: msg('White'), pink: msg('Pink'), brown: msg('Brown') })

const padPresets = (list: readonly number[]): string[] => Array.from({ length: MAX_PRESETS }, (_, i) => (list[i] !== undefined ? String(list[i]) : ''))

/** The Countdown presets (focus-everywhere D5): four fields, empty ones skipped; a value out of range is refused with the range and nothing is written. */
function PresetsRow({ presets }: { presets: readonly number[] }) {
  const [texts, setTexts] = useState(() => padPresets(presets))
  useResetOnChange([presets.join(',')], () => setTexts(padPresets(presets)))
  const [min, max] = COUNTDOWN_BOUNDS
  const bad = (text: string) => text.trim() !== '' && !presetInBounds(Number(text))
  const invalid = texts.some(bad)
  const commit = (next: string[]) => {
    setTexts(next)
    if (next.some(bad)) return
    const list = next.filter((x) => x.trim() !== '').map(Number)
    const value = list.length ? presetsValue(list) : ''
    if (value !== presets.join(',')) act(setFocusPref({ field: 'focus_presets', value }))
  }
  return (
    <SettingRow {...rowCopy('focus', 'presets')} description={invalid ? undefined : rowCopy('focus', 'presets').description}
      status={invalid ? <span className="text-danger" role="alert" data-focus-range="focus_presets">{t('From {min} to {max} minutes', { min, max })}</span> : undefined} control={
        <div className="flex flex-wrap items-center gap-1.5" data-focus-presets-edit>
          {texts.map((text, i) => (
            <Input key={i} type="number" inputMode="numeric" min={min} max={max} className="w-16" value={text} aria-invalid={bad(text) || undefined}
              aria-label={t('Preset {n}', { n: i + 1 })} onChange={(e) => commit(texts.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <Button size="sm" variant="ghost" onClick={() => act(setFocusPref({ field: 'focus_presets', value: '' }))} data-focus-presets-reset>{t('Reset')}</Button>
        </div>
      } />
  )
}

/** The noise choice, and under it this device's volume with Preview (focus-everywhere D6). */
function NoiseRows({ noise }: { noise: FocusNoise }) {
  const volume = useNoiseVolume()
  const preview = () => { void import('../../lib/focus/noise').then((m) => m.previewNoise(noise === 'off' ? 'brown' : noise, volume)) }
  return (
    <>
      <SettingRow {...rowCopy('focus', 'noise')} htmlFor="focus-noise" control={
        <Select id="focus-noise" className="sm:w-40" value={noise} onChange={(e) => act(setFocusPref({ field: 'focus_noise', value: e.target.value as FocusNoise }))}>
          {FOCUS_NOISES.map((n) => <option key={n} value={n}>{NOISE_LABEL[n]}</option>)}
        </Select>
      } />
      {noise !== 'off' && (
        <SettingRow {...rowCopy('focus', 'volume')} htmlFor="focus-noise-volume" control={
          <div className="flex items-center gap-2">
            <input id="focus-noise-volume" type="range" min={0} max={100} step={5} value={volume} className="min-w-0 flex-1 accent-(--ot-accent) sm:w-32"
              onChange={(e) => writeNoiseVolume(Number(e.target.value))} data-focus-noise-volume />
            <Button size="sm" variant="secondary" onClick={preview} data-focus-noise-preview>{t('Preview')}</Button>
          </div>
        } />
      )}
    </>
  )
}

export function FocusSettingsView({ prefs }: { prefs: FocusPrefs }) {
  const setAuto = (breaks: boolean, work: boolean) => act(setFocusPref({ field: 'focus_auto_start', value: autoStartValue(breaks, work) }))
  const reminderOn = prefs.breakAfterMinutes > 0
  return (
    // Copy: SETTINGS_COPY.focus; Learn more opens the focus guide (settings/focus).
    <SettingsSection {...cardCopy('focus')} testId="focus-settings">
      <SettingRow {...rowCopy('focus', 'mode')} htmlFor="focus-mode" control={
        <Select id="focus-mode" className="sm:w-40" value={prefs.mode} onChange={(e) => act(setFocusPref({ field: 'focus_mode', value: e.target.value as FocusMode }))}>
          {FOCUS_MODES.map((m) => <option key={m} value={m}>{modeName(m)}</option>)}
        </Select>
      } />
      <NumberRow field="focus_work_minutes" {...rowCopy('focus', 'work')} value={prefs.workMinutes} />
      <NumberRow field="focus_short_break_minutes" {...rowCopy('focus', 'shortBreak')} value={prefs.shortBreakMinutes} />
      <NumberRow field="focus_long_break_minutes" {...rowCopy('focus', 'longBreak')} value={prefs.longBreakMinutes} />
      <NumberRow field="focus_long_break_every" {...rowCopy('focus', 'longEvery')} value={prefs.longBreakEvery} unit="sessions" />
      <SettingRow {...rowCopy('focus', 'autoBreaks')} control={<Switch checked={prefs.autoStartBreaks} onChange={(on) => setAuto(on, prefs.autoStartWork)} label={t('Start breaks automatically')} hideLabel />} />
      <SettingRow {...rowCopy('focus', 'autoWork')} control={<Switch checked={prefs.autoStartWork} onChange={(on) => setAuto(prefs.autoStartBreaks, on)} label={rowCopy('focus', 'autoWork').label} hideLabel />} />
      <SettingRow {...rowCopy('focus', 'reminder')} id="focus-break-reminder" control={
        <Switch checked={reminderOn} onChange={(on) => act(setFocusPref({ field: 'focus_break_after_minutes', value: on ? DEFAULT_BREAK_AFTER : 0 }))} label={t('Break reminder')} hideLabel />
      } />
      {reminderOn && <NumberRow field="focus_break_after_minutes" {...rowCopy('focus', 'remindAfter')} value={prefs.breakAfterMinutes} />}
      {!reminderOn && <p className="pb-3 text-meta text-muted" data-focus-reminder-off>{t('Off. When on, the reminder comes after {n} minutes of work.', { n: DEFAULT_BREAK_AFTER })}</p>}
      <SettingRow {...rowCopy('focus', 'sound')} control={
        <Switch checked={prefs.sound} onChange={(on) => act(setFocusPref({ field: 'focus_sound', value: on ? 'on' : 'off' }))} label={t('Sound at the end of a session')} hideLabel />
      } />
      <PresetsRow presets={prefs.presets} />
      <NoiseRows noise={prefs.noise} />
    </SettingsSection>
  )
}
