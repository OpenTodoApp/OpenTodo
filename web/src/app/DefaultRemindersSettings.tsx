import { useState } from 'react'
import { Button, Input, Select, SettingRow, SettingsSection } from '../ui'
import { useUserPrefsRow } from '../lib/localData'
import { offsetLabel } from '../lib/reminderTime'
import { msg, t, translatedList } from '../lib/i18n'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { type DefaultReminders, readDefaultReminders, setDefaultReminder } from '../lib/userPrefs'
import { MAX_DEFAULT_OFFSET } from '../lib/defaultReminder'
import { act } from './actionError'

type Kind = 'timed' | 'dated'

/** The presets of each default (default-reminders D8), in minutes from the due time (09:00 for a date only). */
const PRESETS: Record<Kind, readonly { minutes: number; label: string }[]> = {
  timed: translatedList([
    { minutes: 0, label: msg('At the due time') },
    { minutes: -10, label: msg('10 minutes before') },
    { minutes: -30, label: msg('30 minutes before') },
    { minutes: -60, label: msg('1 hour before') },
    { minutes: -1440, label: msg('1 day before') },
  ], 'label'),
  dated: translatedList([
    { minutes: 0, label: msg('On the day at 09:00') },
    { minutes: -1440, label: msg('1 day before') },
    { minutes: -2880, label: msg('2 days before') },
    { minutes: -4320, label: msg('3 days before') },
    { minutes: -10080, label: msg('1 week before') },
  ], 'label'),
}

/** Settings → Notifications → Default reminders: the two synced defaults, written through ops (default-reminders D8). */
export function DefaultRemindersSection() {
  const value = readDefaultReminders(useUserPrefsRow())
  return <DefaultRemindersView value={value} onChange={(kind, minutes) => act(setDefaultReminder(kind, minutes))} />
}

export function DefaultRemindersView({ value, onChange }: { value: DefaultReminders; onChange: (kind: Kind, minutes: number | null) => void }) {
  const [custom, setCustom] = useState<Kind | null>(null)
  const row = (kind: Kind) => {
    const current = value[kind]
    const presets = PRESETS[kind]
    const known = current === null || presets.some((p) => p.minutes === current)
    const id = `default-reminder-${kind}`
    return (
      <div key={kind}>
        <SettingRow {...rowCopy('default-reminders', kind)} htmlFor={id} id={`${id}-row`} control={
          <Select id={id} className="sm:w-56" value={custom === kind ? 'custom' : current === null ? 'none' : String(current)}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'custom') return setCustom(kind)
              setCustom(null)
              onChange(kind, v === 'none' ? null : Number(v))
            }}>
            <option value="none">{t('None')}</option>
            {presets.map((p) => <option key={p.minutes} value={String(p.minutes)}>{p.label}</option>)}
            {/* A custom value is shown as it is, so the select never misstates it. */}
            {!known && <option value={String(current)}>{offsetLabel(current)}</option>}
            <option value="custom">{t('Custom…')}</option>
          </Select>
        } />
        {custom === kind && (
          <CustomOffset initial={current ?? -30} onCancel={() => setCustom(null)} onSave={(minutes) => {
            setCustom(null)
            onChange(kind, minutes)
          }} />
        )}
      </div>
    )
  }
  return (
    <SettingsSection {...cardCopy('default-reminders')}>
      {row('timed')}
      {row('dated')}
    </SettingsSection>
  )
}

/** A custom offset: an amount in minutes, hours or days, before or after (the reminder editor's controls). */
function CustomOffset({ initial, onSave, onCancel }: { initial: number; onSave: (minutes: number) => void; onCancel: () => void }) {
  const abs = Math.abs(initial)
  const [unit, setUnit] = useState<'1' | '60' | '1440'>(abs !== 0 && abs % 1440 === 0 ? '1440' : abs !== 0 && abs % 60 === 0 ? '60' : '1')
  const [amount, setAmount] = useState(String(abs / Number(unit)))
  const [direction, setDirection] = useState<'before' | 'after'>(initial > 0 ? 'after' : 'before')
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    const n = Number(amount)
    if (!Number.isInteger(n) || n < 0) return setError(t('Enter a whole number.'))
    const minutes = n * Number(unit)
    if (minutes > MAX_DEFAULT_OFFSET) return setError(t('At most one year before or after.'))
    onSave(direction === 'before' ? -minutes : minutes)
  }
  return (
    <form className="flex flex-wrap items-center gap-2 pb-3" data-testid="default-reminder-custom"
      onSubmit={(e) => { e.preventDefault(); save() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <Input className="w-20 py-1" type="number" min={0} aria-label={t('Offset amount')} value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
      <Select className="w-auto py-1" aria-label={t('Offset unit')} value={unit} onChange={(e) => setUnit(e.target.value as '1' | '60' | '1440')}>
        <option value="1">{t('minutes')}</option>
        <option value="60">{t('hours')}</option>
        <option value="1440">{t('days')}</option>
      </Select>
      <Select className="w-auto py-1" aria-label={t('Before or after')} value={direction} onChange={(e) => setDirection(e.target.value as 'before' | 'after')}>
        <option value="before">{t('before')}</option>
        <option value="after">{t('after')}</option>
      </Select>
      <Button type="submit" variant="primary" size="sm">{t('Save')}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t('Cancel')}</Button>
      {error && <p role="alert" className="w-full text-meta text-danger">{error}</p>}
    </form>
  )
}
