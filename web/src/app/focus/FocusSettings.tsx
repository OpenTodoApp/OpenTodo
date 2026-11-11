// Settings → General → Focus (OpenSpec change focus-mode, design D5; settings-
// navigation "Account and General section contents", screen id settings/focus):
// the timer mode, the three lengths, the long-break cycle, the two auto-start
// switches, the break reminder and the sound (Off, Short or Long, focus-end-alert); since focus-everywhere (D5, D6)
// also the Countdown presets, the background noise and this device's volume. Each row writes one synced
// `user_prefs` field after its bounds check; a value out of range is refused with
// the allowed range and nothing is written. settings-foundation D8: the lengths
// belong together, so they are one form with the save bar; every other row saves at once.
import { useCallback, useState } from 'react'
import { Button, Input, NumberInput, Select, SettingRow, SettingsSection, Switch, useDraft, type Draft } from '../../ui'
import { SettingsSaveBar } from '../SettingsSaveBar'
import { autoStartValue, COUNTDOWN_BOUNDS, DEFAULT_BREAK_AFTER, FOCUS_BOUNDS, FOCUS_MODES, FOCUS_NOISES, FOCUS_SOUNDS, MAX_PRESETS, modeName, presetInBounds, presetsValue, setFocusPref, setFocusSound, soundChoice, useFocusPrefs, useNoiseVolume, writeNoiseVolume, type FocusMode, type FocusNoise, type FocusNumberField, type FocusSound, type FocusPrefs } from '../../lib/focus/prefs'
import { msg, t, translatedMap } from '../../lib/i18n'
import { act, actionErrorMessage } from '../actionError'
import { cardCopy, rowCopy } from '../../lib/settingsCopy'
import { useResetOnChange } from '../../lib/useResetOnChange'

export function FocusSection() {
  const prefs = useFocusPrefs()
  return <FocusSettingsView prefs={prefs} />
}

/** The lengths form (settings-foundation D8): the fields belong together, so they save with the save bar. */
type Lengths = Record<FocusNumberField, number>
const lengthsOf = (p: FocusPrefs): Lengths => ({
  focus_work_minutes: p.workMinutes, focus_short_break_minutes: p.shortBreakMinutes, focus_long_break_minutes: p.longBreakMinutes,
  focus_long_break_every: p.longBreakEvery, focus_break_after_minutes: p.breakAfterMinutes,
})

/** A minutes (or count) field of the lengths form, its range checked by NumberInput. */
function NumberRow({ field, label, description, unit = 'minutes', form }: { field: FocusNumberField; label: string; description?: string; unit?: 'minutes' | 'sessions'; form: Draft<Lengths> }) {
  const [min, max] = FOCUS_BOUNDS[field]
  const { setValid } = form
  const valid = useCallback((ok: boolean) => setValid(field, ok), [setValid, field])
  return (
    <SettingRow label={label} description={description} control={
      <NumberInput key={form.epoch} id={`focus-${field}`} label={label} hideLabel min={min} max={max} unit={unit === 'minutes' ? t('min') : t('sessions')}
        value={form.draft[field]} onValidityChange={valid} onChange={(v) => form.set({ [field]: v ?? min } as Partial<Lengths>)} />
    } />
  )
}

const SOUND_LABEL = translatedMap<FocusSound>({ off: msg('Off'), short: msg('Short'), long: msg('Long') })

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
  const saved = lengthsOf(prefs)
  const form = useDraft(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      for (const field of Object.keys(saved) as FocusNumberField[]) {
        if (field === 'focus_break_after_minutes' && !reminderOn) continue
        if (form.draft[field] !== saved[field]) await setFocusPref({ field, value: form.draft[field] })
      }
    } catch (err) {
      setError(actionErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    // Copy: SETTINGS_COPY.focus; Learn more opens the focus guide (settings/focus).
    <SettingsSection {...cardCopy('focus')} testId="focus-settings">
      <SettingRow {...rowCopy('focus', 'mode')} htmlFor="focus-mode" control={
        <Select id="focus-mode" className="sm:w-40" value={prefs.mode} onChange={(e) => act(setFocusPref({ field: 'focus_mode', value: e.target.value as FocusMode }))}>
          {FOCUS_MODES.map((m) => <option key={m} value={m}>{modeName(m)}</option>)}
        </Select>
      } />
      <NumberRow field="focus_work_minutes" {...rowCopy('focus', 'work')} form={form} />
      <NumberRow field="focus_short_break_minutes" {...rowCopy('focus', 'shortBreak')} form={form} />
      <NumberRow field="focus_long_break_minutes" {...rowCopy('focus', 'longBreak')} form={form} />
      <NumberRow field="focus_long_break_every" {...rowCopy('focus', 'longEvery')} unit="sessions" form={form} />
      <SettingRow {...rowCopy('focus', 'autoBreaks')} control={<Switch checked={prefs.autoStartBreaks} onChange={(on) => setAuto(on, prefs.autoStartWork)} label={t('Start breaks automatically')} hideLabel />} />
      <SettingRow {...rowCopy('focus', 'autoWork')} control={<Switch checked={prefs.autoStartWork} onChange={(on) => setAuto(prefs.autoStartBreaks, on)} label={rowCopy('focus', 'autoWork').label} hideLabel />} />
      <SettingRow {...rowCopy('focus', 'reminder')} id="focus-break-reminder" control={
        <Switch checked={reminderOn} onChange={(on) => act(setFocusPref({ field: 'focus_break_after_minutes', value: on ? DEFAULT_BREAK_AFTER : 0 }))} label={t('Break reminder')} hideLabel />
      } />
      {reminderOn && <NumberRow field="focus_break_after_minutes" {...rowCopy('focus', 'remindAfter')} form={form} />}
      {!reminderOn && <p className="pb-3 text-meta text-muted" data-focus-reminder-off>{t('Off. When on, the reminder comes after {n} minutes of work.', { n: DEFAULT_BREAK_AFTER })}</p>}
      <SettingRow {...rowCopy('focus', 'sound')} htmlFor="focus-sound" control={
        <Select id="focus-sound" className="sm:w-40" value={soundChoice(prefs)} onChange={(e) => act(setFocusSound(e.target.value as FocusSound))}>
          {FOCUS_SOUNDS.map((s) => <option key={s} value={s}>{SOUND_LABEL[s]}</option>)}
        </Select>
      } />
      <PresetsRow presets={prefs.presets} />
      <NoiseRows noise={prefs.noise} />
      {/* User preferences sync through the op log, so the lengths save offline too. */}
      <SettingsSaveBar dirty={form.dirty} invalid={form.invalid} busy={saving} error={error} onDiscard={form.reset} onSave={() => void save()} />
    </SettingsSection>
  )
}
