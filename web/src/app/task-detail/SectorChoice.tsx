// The When popover's Sector segment (OpenSpec change time-sectors, design D6):
// This week to Next quarter, each with its period and dates in muted text, then
// "Later…", a small period picker for a week, a month or a quarter further out.
// Choosing writes the sector and clears the do-on date, the start and the evening
// in one batch with Undo (D2); Clear is the popover's footer. A repeating task
// keeps its date, and a viewer reads the sector as text.
import { useState } from 'react'
import { logicalToday } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { laterPeriods, sectorChoices, sectorLabel } from '../../lib/sectorNames'
import type { Period } from '../../lib/sectors'
import type { Task } from '../../lib/types'
import { sectorUndoable } from '../../lib/undoActions'
import { useResetOnChange } from '../../lib/useResetOnChange'
import { Icon } from '../../ui'
import { act } from '../actionError'
import { showUndoToast } from '../bulk/toastStore'
import { useDateTimeFormat } from '../DateTimePrefsProvider'

const KINDS: { kind: Period['kind']; label: () => string }[] = [
  { kind: 'week', label: () => t('Week') },
  { kind: 'month', label: () => t('Month') },
  { kind: 'quarter', label: () => t('Quarter') },
]

/** Plans one task for a sector (or '' to clear it) with an Undo toast. */
export async function setSectorWithUndo(id: string, sector: string, name = ''): Promise<void> {
  const r = await sectorUndoable([id], sector, name)
  if (r.entry) showUndoToast(r.label, r.entry.id)
}

function Choice({ checked, name, detail, onPick, sector }: { checked: boolean; name: string; detail: string; onPick: () => void; sector: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} data-sector-choice={sector} onClick={onPick}
      className={`flex min-h-8 w-full min-w-0 flex-wrap items-baseline gap-x-2 rounded-control px-2 py-1 text-left text-body ${checked ? 'bg-selected font-medium text-strong' : 'text-default hover:bg-sunken dark:hover:bg-raised'}`}>
      <Icon name={checked ? 'check' : 'calendar-range'} size="xs" className={`self-center ${checked ? '' : 'text-faint'}`} />
      <span>{name}</span>
      <span className="text-meta font-normal text-muted">{detail}</span>
    </button>
  )
}

export function SectorChoice({ task, readOnly, onChosen }: { task: Task; readOnly: boolean; onChosen?: () => void }) {
  const dt = useDateTimeFormat()
  const today = logicalToday()
  const current = sectorLabel(task.sector, today, dt.resolved)
  const [later, setLater] = useState<Period['kind'] | null>(null)
  useResetOnChange([task.id], () => setLater(null))
  if (readOnly) return <p className="text-body text-default" data-sector-text>{current?.text ?? t('No time sector')}</p>
  if (task.recurrence) {
    return (
      <div className="space-y-1" data-sector-disabled>
        {current && <p className="text-body text-default">{current.text}</p>}
        <p className="text-meta text-muted">{t('Repeating tasks keep a date')}</p>
      </div>
    )
  }
  const pick = (sector: string, name: string) => act(setSectorWithUndo(task.id, sector, name).then(() => onChosen?.()))
  const choices = sectorChoices(today, dt.resolved)
  return (
    <div className="space-y-2" data-sector-segment>
      {task.due && task.sector && current && (
        <p className="text-meta text-muted" data-sector-ignored>{t('Sector: {name} (ignored while dated)', { name: current.text })}</p>
      )}
      <div role="radiogroup" aria-label={t('Time sector')} className="flex flex-col gap-0.5">
        {choices.map((c) => (
          <Choice key={c.word} sector={c.sector} checked={task.sector === c.sector} name={c.name} detail={c.detail} onPick={() => pick(c.sector, c.name)} />
        ))}
        {current && !choices.some((c) => c.sector === task.sector) && (
          <Choice sector={task.sector!} checked name={current.text} detail={current.carried ? t('carried over') : ''} onPick={() => onChosen?.()} />
        )}
      </div>
      <div className="space-y-1.5" data-sector-later>
        <div role="radiogroup" aria-label={t('Later…')} className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-meta text-muted">{t('Later…')}</span>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" role="radio" aria-checked={later === k.kind} data-sector-kind={k.kind}
              className={`min-h-8 rounded-control border px-2 py-1 text-meta ${later === k.kind ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-default text-muted hover:bg-sunken dark:hover:bg-raised'}`}
              onClick={() => setLater((v) => (v === k.kind ? null : k.kind))}>{k.label()}</button>
          ))}
        </div>
        {later && (
          <div role="radiogroup" aria-label={KINDS.find((k) => k.kind === later)!.label()} className="flex flex-col gap-0.5" data-sector-periods>
            {laterPeriods(later, today, dt.resolved).map((p) => (
              <Choice key={p.sector} sector={p.sector} checked={task.sector === p.sector} name={p.name} detail={p.detail} onPick={() => pick(p.sector, p.name)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
