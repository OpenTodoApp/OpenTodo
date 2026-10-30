// Bento in the Daily check (OpenSpec change bento-daily-check, design D5, D8): the
// three slot rows of today's focus and the slot menu. The rows list the slots in the
// chosen order, an empty slot in the faint tone, then the Not sized tasks. The menu
// is a dialog, a bottom sheet below 640 px, listing the free slots and, only for a
// task the user may edit, Set estimate…, which sets the estimate and then places
// the task by it.
import { useState, type ReactNode } from 'react'
import { BENTO_SLOTS, slotOrder, type BentoOrder, type BentoRead, type BentoSlot } from '../../lib/bento'
import { SLOT_HINTS, SLOT_NAMES } from '../../lib/bentoSlots'
import { ESTIMATE_PRESETS, formatMinutes, parseDuration } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { Button, Dialog, Input } from '../../ui'

// The slot's name lines up with the task titles (row padding, leading slot, check box and gaps).
const LABEL = 'pl-15 pr-2 text-hint font-semibold uppercase tracking-wide text-faint'

/**
 * The slot rows: each slot is its name over the held task (`row` renders a TaskRow),
 * or one faint 44 px row saying what fits in it; the Not sized tasks follow.
 */
export function BentoSlotRows({ read, order, row }: { read: BentoRead; order: BentoOrder; row: (task: Task) => ReactNode }) {
  return (
    <ul data-bento-slots>
      {slotOrder(order).map((slot) => {
        const task = read.slots[slot]
        if (!task) {
          return (
            <li key={slot} className="flex min-h-11 items-center pl-15 pr-2 text-body text-faint" data-bento-slot={slot} data-bento-empty={slot}>
              {SLOT_HINTS[slot]}
            </li>
          )
        }
        return (
          <li key={slot} className="pt-1" data-bento-slot={slot}>
            <p className={LABEL} aria-hidden="true">{SLOT_NAMES[slot]}</p>
            <ul aria-label={SLOT_NAMES[slot]}>{row(task)}</ul>
          </li>
        )
      })}
      {read.unsized.length > 0 && (
        <li className="pt-1" data-bento-slot="none">
          <p className={LABEL} aria-hidden="true">{t('Not sized')}</p>
          <ul aria-label={t('Not sized')}>{read.unsized.map((task) => row(task))}</ul>
        </li>
      )}
    </ul>
  )
}

/** The slot menu for one task: the free slots, then Set estimate… when the task may be edited. */
export function SlotChooser({ task, free, editable, onPick, onEstimate, onClose }: {
  task: Task
  free: readonly BentoSlot[]
  editable: boolean
  onPick: (slot: BentoSlot) => void
  onEstimate: (minutes: number) => void
  onClose: () => void
}) {
  const [estimating, setEstimating] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const save = (minutes: number | null) => {
    if (minutes === null) { setError(true); return }
    onEstimate(minutes)
  }
  return (
    <Dialog title={estimating ? t('Set estimate') : t('Choose a slot')} label={t('Choose a slot for {title}', { title: task.title })} size="sm" placement="sheet" onClose={onClose} testId="bento-chooser">
      <p className="mb-3 truncate text-meta text-muted user-text">{task.title}</p>
      {!estimating ? (
        <div className="flex flex-col gap-2">
          {free.length === 0 && <p className="text-body text-muted">{t('Every slot is full.')}</p>}
          {BENTO_SLOTS.filter((s) => free.includes(s)).map((slot) => (
            <Button key={slot} variant="secondary" className="min-h-11 w-full justify-start" data-bento-pick={slot} onClick={() => onPick(slot)}>
              <span className="font-semibold">{SLOT_NAMES[slot]}</span>
              <span className="ml-2 text-meta text-muted">{SLOT_HINTS[slot]}</span>
            </Button>
          ))}
          {editable && free.length > 0 && (
            <Button variant="ghost" className="min-h-11 w-full justify-start" icon="clock" data-bento-estimate onClick={() => setEstimating(true)}>{t('Set estimate…')}</Button>
          )}
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(parseDuration(draft.trim())) }}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('Estimate presets')}>
            {ESTIMATE_PRESETS.map((m) => (
              <Button key={m} size="sm" variant="secondary" className="min-h-11 min-w-11 font-mono" data-bento-preset={m} onClick={() => save(m)}>{formatMinutes(m)}</Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input className="w-32" aria-label={t('Estimate')} placeholder={t('e.g. 45m, 1h30')} value={draft} autoFocus
              aria-invalid={error || undefined} aria-describedby={error ? 'bento-estimate-error' : undefined}
              onChange={(e) => { setDraft(e.target.value); setError(false) }} />
            <Button type="submit" variant="primary">{t('Set')}</Button>
          </div>
          {error && <p id="bento-estimate-error" role="alert" className="text-meta text-danger">{t('Use minutes or hours, for example 20, 45m, 1h30 (up to one week).')}</p>}
        </form>
      )}
    </Dialog>
  )
}
