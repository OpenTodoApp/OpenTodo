// Settings → General → Priorities (OpenSpec change priority-names, screen id
// settings/priorities): one field per level beside its colour, in order 1 to 4,
// then Reset. A name applies as it is typed, through one synced user_prefs field
// per level (lib/priorityWrites); an empty field is the default name, which the
// field's label already shows. The stored priority of every task stays the number.
import { useState } from 'react'
import { useUserPrefsRow } from '../lib/localData'
import { defaultPriorityName, PRIORITY_NAME_MAX } from '../lib/priority'
import { priorityNameValue, resetPriorityNames, setPriorityName } from '../lib/priorityWrites'
import { cardCopy, noticeCopy } from '../lib/settingsCopy'
import { t } from '../lib/i18n'
import type { UserPrefs } from '../lib/types'
import { useResetOnChange } from '../lib/useResetOnChange'
import { Button, Input, SettingRow, SettingsSection } from '../ui'
import { act } from './actionError'

const LEVELS = [1, 2, 3, 4] as const
type Level = (typeof LEVELS)[number]

/** The level's ring, as in the task's facts: the p1–p4 tokens. */
const RING: Record<Level, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-p4' }

/** The stored names to edit: a value this device cannot decrypt reads as empty. */
function storedNames(row: (Partial<UserPrefs> & { _e2ee?: { raw?: Record<string, unknown> } }) | null | undefined): string[] {
  return LEVELS.map((n) => {
    const f = `priority_name_${n}` as const
    const v = row?.[f]
    return typeof v === 'string' && !row?._e2ee?.raw?.[f] ? v : ''
  })
}

export function PrioritiesSection() {
  const names = storedNames(useUserPrefsRow())
  return <PrioritiesView names={names} onChange={(n, text) => act(setPriorityName(n, text))} onReset={() => act(resetPriorityNames())} />
}

/** One level's field: local text while typing (a space between words survives), the trimmed name written on each change. */
function NameRow({ n, value, onChange }: { n: Level; value: string; onChange: (text: string) => void }) {
  const [text, setText] = useState(value)
  useResetOnChange([value], () => { if (priorityNameValue(text) !== value) setText(value) })
  const id = `priority-name-${n}`
  const full = [...text].length >= PRIORITY_NAME_MAX
  return (
    <SettingRow htmlFor={id} label={
      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full border-2 ${RING[n]}`} />{defaultPriorityName(n)}</span>
    } status={full ? <span className="text-meta text-muted" role="status" data-priority-name-full={n}>{noticeCopy('priorities', 'tooLong', { values: { n: PRIORITY_NAME_MAX } })}</span> : undefined}
      control={
        <Input id={id} className="max-sm:min-h-11 sm:w-56" value={text} maxLength={PRIORITY_NAME_MAX} autoComplete="off" spellCheck={false} data-priority-name={n}
          onChange={(e) => {
            setText(e.target.value)
            if (priorityNameValue(e.target.value) !== value) onChange(e.target.value)
          }} />
      } />
  )
}

/** Presentational part of the card, rendered without data for tests and stories. */
export function PrioritiesView({ names, onChange, onReset }: { names: readonly string[]; onChange: (n: Level, text: string) => void; onReset: () => void }) {
  return (
    <SettingsSection {...cardCopy('priorities')} testId="priorities-settings">
      {LEVELS.map((n) => <NameRow key={n} n={n} value={names[n - 1] ?? ''} onChange={(text) => onChange(n, text)} />)}
      <div className="py-3">
        <Button size="sm" variant="ghost" className="max-sm:min-h-11" onClick={onReset} data-priority-names-reset>{t('Reset')}</Button>
      </div>
    </SettingsSection>
  )
}
