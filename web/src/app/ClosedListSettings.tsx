// Settings → General → Start view and briefing → Today limit (OpenSpec change
// today-closed-list, design D5): the synced Today limit (Off, 3, 5, 7, 10 or a custom
// whole number from 1 to 20) and the Done today switch, for every mode.
import { useState } from 'react'
import { readTodayLimit, TODAY_LIMIT_CHOICES, TODAY_LIMIT_MAX } from '../lib/closedList'
import { doneTodayShown, setDoneTodayShown, setTodayLimit } from '../lib/closedListPrefs'
import { t } from '../lib/i18n'
import { useUserPrefsRow } from '../lib/localData'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { Input, Select, SettingRow, SettingsSection, Switch } from '../ui'
import { act } from './actionError'

export function ClosedListSection() {
  const row = useUserPrefsRow()
  return <ClosedListView limit={readTodayLimit(row?.today_limit)} done={doneTodayShown(row)}
    onLimit={(n) => act(setTodayLimit(n))} onDone={(on) => act(setDoneTodayShown(on))} />
}

/** Whether `raw` (typed in Custom) is a limit the account can keep: a whole number from 1 to 20. */
export function parseCustomLimit(raw: string): number | null {
  const n = Number(raw.trim())
  return raw.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= TODAY_LIMIT_MAX ? n : null
}

export function ClosedListView({ limit, done, onLimit, onDone }: { limit: number; done: boolean; onLimit: (n: number) => void; onDone: (on: boolean) => void }) {
  const preset = limit === 0 || (TODAY_LIMIT_CHOICES as readonly number[]).includes(limit)
  const [custom, setCustom] = useState(!preset)
  const [draft, setDraft] = useState(preset ? '' : String(limit))
  const [error, setError] = useState(false)
  const choice = custom ? 'custom' : String(limit)
  const save = () => {
    const n = parseCustomLimit(draft)
    setError(n === null)
    if (n !== null && n !== limit) onLimit(n)
  }
  return (
    <SettingsSection {...cardCopy('today-limit')}>
      <SettingRow {...rowCopy('today-limit', 'limit')} id="today-limit" htmlFor="today-limit-select" control={(
        <div className="flex flex-wrap items-center gap-2">
          <Select id="today-limit-select" className="sm:w-40" value={choice} data-today-limit
            onChange={(e) => {
              const v = e.target.value
              if (v === 'custom') { setCustom(true); setDraft(String(limit || '')); setError(false); return }
              setCustom(false)
              setError(false)
              onLimit(Number(v))
            }}>
            <option value="0">{t('Off')}</option>
            {TODAY_LIMIT_CHOICES.map((n) => <option key={n} value={String(n)}>{t('{n, plural, one {# task} other {# tasks}}', { n })}</option>)}
            <option value="custom">{t('Custom')}</option>
          </Select>
          {custom && (
            <Input className="w-20" type="number" min={1} max={TODAY_LIMIT_MAX} step={1} inputMode="numeric" aria-label={t('Custom limit')}
              aria-invalid={error || undefined} aria-describedby={error ? 'today-limit-error' : undefined} value={draft} data-today-limit-custom
              onChange={(e) => setDraft(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
          )}
        </div>
      )} />
      {error && <p id="today-limit-error" role="alert" className="pb-2 text-meta text-danger" data-today-limit-error>{t('Choose a whole number from 1 to 20.')}</p>}
      <SettingRow {...rowCopy('today-limit', 'done')} id="today-done" htmlFor="today-done-switch"
        control={<span data-today-done-switch><Switch id="today-done-switch" checked={done} onChange={onDone} label={t('Show done today')} hideLabel /></span>} />
    </SettingsSection>
  )
}
