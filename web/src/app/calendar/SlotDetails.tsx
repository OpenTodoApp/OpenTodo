// The details of a calendar slot (OpenSpec change calendar-slots, design D4): its
// title (editable), time and count, the full checklist with Take out, the colour
// and Delete slot, in the slot's popover.
import { useEffect, useRef, useState } from 'react'
import { DAY_MINUTES } from '../../lib/calendar'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { SLOT_DEFAULTS } from '../../lib/ops'
import { deleteSlot, editSlot, slotCount, slotName, takeOutOfSlot, type SlotView } from '../../lib/slots'
import { Button, Icon, Input } from '../../ui'
import { act } from '../actionError'
import { WorkspaceColours } from '../NewWorkspaceDialog'
import { completeWithUndo } from '../undoable'
import { formatTime } from './grid'
import { runSlot } from './slotActions'

/** The slot's popover: its title (editable), time, the full checklist, colour and Delete. */
export function SlotDetails({ view, editTitle = false, onOpenTask, onDone }: { view: SlotView; editTitle?: boolean; onOpenTask: (id: string) => void; onDone: () => void }) {
  const [title, setTitle] = useState(view.slot.title)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editTitle) input.current?.select()
  }, [editTitle])
  const save = () => { if (title.trim() !== view.slot.title) void runSlot(editSlot(view.slot, { title })) }
  const rows = [...view.open, ...view.done]
  return (
    <div className="space-y-3" data-slot-details={view.slot.id}>
      <div className="space-y-1">
        <Input ref={input} value={title} placeholder={t('Slot')} aria-label={t('Slot name')} maxLength={200} autoFocus={editTitle} data-slot-title
          onChange={(e) => setTitle(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); onDone() } }} />
        <p className="text-meta text-muted tabular-nums">{formatTime(view.start)}–{formatTime(view.end === DAY_MINUTES ? DAY_MINUTES - 1 : view.end)} · <span className={view.overfull ? 'text-warning' : ''}>{slotCount(view)}</span></p>
      </div>
      {rows.length === 0
        ? <p className="text-meta text-faint">{t('Drag small tasks here, or press s on a task and Shift+Enter over the slot.')}</p>
        : (
          <ul className="max-h-72 space-y-0.5 overflow-auto" aria-label={t('Tasks in {title}', { title: slotName(view.slot) })}>
            {rows.map((task) => (
              <li key={task.id} data-slot-details-row={task.id} className="flex min-h-6 items-center gap-1 text-meta">
                <button type="button" role="checkbox" aria-checked={!!task.completed_at} aria-label={task.title || t('Untitled')}
                  className="touch-target inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  onClick={() => act(completeWithUndo(task.id, !task.completed_at))}>
                  <Icon name={task.completed_at ? 'check' : 'circle'} size="sm" />
                </button>
                <button type="button" className={`min-h-6 min-w-0 flex-1 truncate rounded-chip text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus ${task.completed_at ? 'text-faint line-through' : ''}`}
                  onClick={() => onOpenTask(task.id)}>{task.title || t('Untitled')}</button>
                {task.estimate_minutes ? <span className="shrink-0 text-hint tabular-nums text-muted">{formatMinutes(task.estimate_minutes)}</span> : null}
                <Button variant="ghost" size="sm" icon="x" aria-label={t('Take {title} out of the slot', { title: task.title || t('Untitled') })} data-slot-take-out={task.id}
                  onClick={() => void runSlot(takeOutOfSlot(view.slot, task.id))} />
              </li>
            ))}
          </ul>
        )}
      <WorkspaceColours value={view.slot.color} onPick={(hex) => void runSlot(editSlot(view.slot, { color: hex || SLOT_DEFAULTS.color }))} />
      <Button variant="ghost" icon="trash-2" data-slot-delete onClick={() => { onDone(); void runSlot(deleteSlot(view.slot)) }}>{t('Delete slot')}</Button>
    </div>
  )
}
