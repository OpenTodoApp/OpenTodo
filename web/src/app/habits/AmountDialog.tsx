// Set amount (OpenSpec change habit-targets, design D2): the day's exact amount of
// an amount habit. The device writes its own tally as the amount minus what the
// other devices counted, never below zero, and the check-in follows the amount.
import { useState, type FormEvent } from 'react'
import { changeAmount } from '../../lib/habitActions'
import { formatDate } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useLiveTasks } from '../../lib/liveTasks'
import { Button, Dialog, Field, Input } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { useToday } from '../useViews'
import { amountTarget } from './amountStore'

export function AmountHost() {
  const target = amountTarget.use()
  return target ? <AmountDialog seriesId={target.seriesId} date={target.date} onClose={() => amountTarget.set(null)} /> : null
}

export function AmountDialog({ seriesId, date, onClose }: { seriesId: string; date: string; onClose: () => void }) {
  const series = useLiveTasks()?.find((x) => x.id === seriesId)
  const today = useToday()
  const [value, setValue] = useState('')
  if (!series) return null
  const n = Number(value)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!(n >= 0) || value === '') return
    act(changeAmount(seriesId, { exact: n }, { date }).then((r) => { if (r?.entry) showUndoToast(r.label, r.entry.id); onClose() }))
  }
  return (
    <Dialog title={`${series.title || t('Untitled')} · ${formatDate(date, 'full', undefined, today)}`} onClose={onClose} testId="habit-amount">
      <form className="space-y-4" onSubmit={submit}>
        <Field label={series.habit_unit ? t('Amount ({unit})', { unit: series.habit_unit }) : t('Amount')}>
          <Input autoFocus type="number" inputMode="decimal" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(series.habit_amount ?? '')} data-habit-set-amount />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" size="sm" disabled={value === '' || !(n >= 0)} data-habit-amount-save>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
