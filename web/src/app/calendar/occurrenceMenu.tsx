// The menu of a projected occurrence (OpenSpec change series-exceptions, design D4):
// Open, Complete this occurrence, Skip this occurrence (Skip this day for a habit)
// and Move to…, opened by a right-click, a long press, Shift+F10 or the menu key.
// A viewer of the shared project and a completion-relative series get Open only.
// Loaded on first use, so the first load carries none of it.
import { useState } from 'react'
import { t } from '../../lib/i18n'
import { useMembershipMap, useTask } from '../../lib/localData'
import { actOnOccurrenceUndoable, moveOccurrenceFromView } from '../../lib/occurrenceActions'
import type { Projection } from '../../lib/occurrences'
import type { OccurrenceAction } from '../../lib/seriesPlan'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { Dialog, Field, Input, Menu, MenuItem } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { setPanelTaskId } from '../panel'

/** Act on one occurrence with the Undo toast; a refusal (no longer an occurrence) shows nothing. */
export async function actOnProjection(seriesId: string, occurrence: string, action: OccurrenceAction): Promise<void> {
  const r = await actOnOccurrenceUndoable(seriesId, occurrence, action)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}

/**
 * A projection dropped on a day (and, on the Day and Week grid, a time): this
 * occurrence moves alone, at the series' time unless the drop names one, read in the
 * viewer's zone like any drop (absolute-datetimes).
 */
export async function moveProjection(p: Pick<Projection, 'seriesId' | 'occurrence'>, date: string, time?: string | null): Promise<void> {
  const r = await moveOccurrenceFromView(p.seriesId, p.occurrence, date, time)
  if (r?.entry) showUndoToast(r.label, r.entry.id)
}

/** Whether the signed-in person may act on the series' occurrences (not a viewer, a calendar rule). */
function useCanAct(p: Projection): boolean {
  const series = useTask(p.seriesId)
  const memberships = useMembershipMap()
  return !p.afterCompletion && !!series && canEditTasks(roleOf(series.project_id, memberships))
}

export default function OccurrenceMenu({ p, x, y, onClose }: { p: Projection; x: number; y: number; onClose: () => void }) {
  const canAct = useCanAct(p)
  const [moving, setMoving] = useState(false)
  return (
    <>
      {!moving && (
        // The hidden trigger sits at the pointer, so the panel opens there (as the add menu's does).
        <Menu kind="menu" label={t('Occurrence actions')} trigger={<span className="sr-only" />} triggerClassName="sr-only"
          triggerProps={{ style: { position: 'fixed', left: x, top: y } }} align="start" width="sm:w-64" open
          onOpenChange={(open) => { if (!open) onClose() }}>
          <MenuItem label={t('Open')} icon="panel-right" data-occurrence-action="open" onSelect={() => setPanelTaskId(p.seriesId, p.occurrence)} />
          {canAct && (
            <>
              <MenuItem label={t('Complete this occurrence')} icon="check" data-occurrence-action="complete" onSelect={() => act(actOnProjection(p.seriesId, p.occurrence, { kind: 'complete' }))} />
              <MenuItem label={p.habit ? t('Skip this day') : t('Skip this occurrence')} icon="arrow-right" data-occurrence-action="skip"
                onSelect={() => act(actOnProjection(p.seriesId, p.occurrence, { kind: 'skip' }))} />
              <MenuItem label={t('Move to…')} icon="calendar-days" data-occurrence-action="move" onSelect={() => setMoving(true)} />
            </>
          )}
        </Menu>
      )}
      {moving && <MoveOccurrenceDialog p={p} onClose={onClose} />}
    </>
  )
}

/** Move to…: a day and a time for this occurrence alone. */
export function MoveOccurrenceDialog({ p, onClose }: { p: Pick<Projection, 'seriesId' | 'occurrence' | 'date' | 'time'>; onClose: () => void }) {
  const [date, setDate] = useState(p.date)
  const [time, setTime] = useState(p.time ?? '')
  return (
    <Dialog title={t('Move this occurrence')} onClose={onClose}>
      <form className="space-y-3" data-move-occurrence onSubmit={(e) => {
        e.preventDefault()
        if (!date) return
        act(moveProjection(p, date, time || null))
        onClose()
      }}>
        <Field label={t('Day')}><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('Time')} description={t('Leave empty for no time.')}><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={onClose}>{t('Cancel')}</button>
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--md">{t('Move')}</button>
        </div>
      </form>
    </Dialog>
  )
}
