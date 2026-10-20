// Settings → General → Focus (OpenSpec change focus-mode, design D5; settings-
// navigation "Account and General section contents", screen id settings/focus):
// the timer mode, the three lengths, the long-break cycle, the two auto-start
// switches, the break reminder and the sound. Each row writes one synced
// `user_prefs` field after its bounds check; a value out of range is refused with
// the allowed range and nothing is written.
import { useEffect, useState } from 'react'
import { Button, Input, Select, SettingRow, SettingsSection, Switch } from '../../ui'
import { autoStartValue, DEFAULT_BREAK_AFTER, FOCUS_BOUNDS, FOCUS_MODES, inBounds, modeName, setFocusPref, useFocusPrefs, type FocusMode, type FocusNumberField, type FocusPrefs } from '../../lib/focus/prefs'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { openHelp } from '../../lib/helpRequest'

export function FocusSection() {
  const prefs = useFocusPrefs()
  return <FocusSettingsView prefs={prefs} />
}

/** A minutes (or count) field: commits a whole number inside its range on change, else shows the range. */
function NumberRow({ field, label, value, unit = 'minutes', description }: { field: FocusNumberField; label: string; value: number; unit?: 'minutes' | 'sessions'; description?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
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

export function FocusSettingsView({ prefs }: { prefs: FocusPrefs }) {
  const setAuto = (breaks: boolean, work: boolean) => act(setFocusPref({ field: 'focus_auto_start', value: autoStartValue(breaks, work) }))
  const reminderOn = prefs.breakAfterMinutes > 0
  return (
    <SettingsSection title={t('Focus')} headingId="focus-heading" testId="focus-settings"
      description={t('The timer of the Focus screen: its mode, the lengths, breaks and the sound. Synced to your devices.')}>
      <SettingRow label={t('Timer mode')} htmlFor="focus-mode" description={t('Pomodoro alternates work and breaks, Flowtime counts up until you stop, Countdown runs a length you choose each time.')} control={
        <Select id="focus-mode" className="sm:w-40" value={prefs.mode} onChange={(e) => act(setFocusPref({ field: 'focus_mode', value: e.target.value as FocusMode }))}>
          {FOCUS_MODES.map((m) => <option key={m} value={m}>{modeName(m)}</option>)}
        </Select>
      } />
      <NumberRow field="focus_work_minutes" label={t('Work session')} value={prefs.workMinutes} description={t('Pomodoro work length in minutes')} />
      <NumberRow field="focus_short_break_minutes" label={t('Short break')} value={prefs.shortBreakMinutes} />
      <NumberRow field="focus_long_break_minutes" label={t('Long break')} value={prefs.longBreakMinutes} />
      <NumberRow field="focus_long_break_every" label={t('Long break after')} value={prefs.longBreakEvery} unit="sessions" description={t('Work sessions before a long break')} />
      <SettingRow label={t('Start breaks automatically')} control={<Switch checked={prefs.autoStartBreaks} onChange={(on) => setAuto(on, prefs.autoStartWork)} label={t('Start breaks automatically')} hideLabel />} />
      <SettingRow label={t('Start the next session automatically')} control={<Switch checked={prefs.autoStartWork} onChange={(on) => setAuto(prefs.autoStartBreaks, on)} label={t('Start the next session automatically')} hideLabel />} />
      <SettingRow label={t('Break reminder')} id="focus-break-reminder" description={t('A notice on any screen after a long stretch of work without a break.')} control={
        <Switch checked={reminderOn} onChange={(on) => act(setFocusPref({ field: 'focus_break_after_minutes', value: on ? DEFAULT_BREAK_AFTER : 0 }))} label={t('Break reminder')} hideLabel />
      } />
      {reminderOn && <NumberRow field="focus_break_after_minutes" label={t('Remind me after')} value={prefs.breakAfterMinutes} />}
      {!reminderOn && <p className="pb-3 text-meta text-muted" data-focus-reminder-off>{t('Off. When on, the reminder comes after {n} minutes of work.', { n: DEFAULT_BREAK_AFTER })}</p>}
      <SettingRow label={t('Sound')} description={t('A short tone when a session or a break ends, while the app is shown.')} control={
        <Switch checked={prefs.sound} onChange={(on) => act(setFocusPref({ field: 'focus_sound', value: on ? 'on' : 'off' }))} label={t('Sound at the end of a session')} hideLabel />
      } />
      <SettingRow label={t('How Focus works')} description={t('The screen, the three modes, the keys and what is logged as time.')} control={
        <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={(e) => openHelp('settings/focus', e.currentTarget)} data-focus-guide>{t('Open the focus guide')}</Button>
      } />
    </SettingsSection>
  )
}
