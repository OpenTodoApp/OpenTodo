// The two actions of Today's Earlier group (OpenSpec change page-rhythm, design D5
// and D6): "Move all to today" and "Reschedule…", always visible in the group's
// header. Both run the bulk date path on the group's task ids, not the selection,
// as one batch with the Undo toast; read-only tasks are skipped and counted.
import { useState } from 'react'
import { applyGroupDue, type DuePick } from '../../lib/bulk'
import { t } from '../../lib/i18n'
import { Button, Dialog, Menu, MenuItem } from '../../ui'
import { DateField } from '../datetime/DateField'
import { showBulkToast } from '../bulk/toastStore'
import { act } from '../actionError'

/** Apply a date to every task of the group and offer Undo. */
export async function runGroupDue(ids: readonly string[], pick: Exclude<DuePick, null>): Promise<void> {
  if (ids.length === 0) return
  const r = await applyGroupDue(ids, pick)
  showBulkToast(r.label, r.undoId)
}

/** The Reschedule… choices: the bulk Actions menu's date items (today, tomorrow, next week, pick a date). */
export function RescheduleChoices({ ids, onPickDate }: { ids: readonly string[]; onPickDate: () => void }) {
  const run = (pick: Exclude<DuePick, null>) => () => act(runGroupDue(ids, pick))
  return (
    <>
      <MenuItem label={t('Today')} icon="calendar-check" onSelect={run('today')} />
      <MenuItem label={t('Tomorrow')} icon="calendar-days" onSelect={run('tomorrow')} />
      <MenuItem label={t('Next week')} icon="calendar-range" onSelect={run('next-week')} />
      <MenuItem label={t('Pick a date…')} icon="calendar-days" onSelect={onPickDate} />
    </>
  )
}

/** A date picked for every task of the group. */
export function GroupDateDialog({ ids, onClose }: { ids: readonly string[]; onClose: () => void }) {
  return (
    <Dialog title={t('Date for {tasks}', { tasks: t('{n, plural, one {# task} other {# tasks}}', { n: ids.length }) })} onClose={onClose}>
      <DateField label={t('Date')} autoFocus value={null} onChange={(iso) => { onClose(); if (iso) act(runGroupDue(ids, iso)) }} />
    </Dialog>
  )
}

export function EarlierActions({ ids }: { ids: readonly string[] }) {
  const [dating, setDating] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" className="text-meta" onClick={() => act(runGroupDue(ids, 'today'))} data-earlier-move>{t('Move all to today')}</Button>
      <Menu kind="menu" label={t('Reschedule…')} trigger={t('Reschedule…')} namedByContent
        triggerClassName="ui-btn ui-btn--ghost ui-btn--sm text-meta" width="sm:w-56" triggerProps={{ 'data-earlier-reschedule': true }}>
        <RescheduleChoices ids={ids} onPickDate={() => setDating(true)} />
      </Menu>
      {dating && <GroupDateDialog ids={ids} onClose={() => setDating(false)} />}
    </>
  )
}
