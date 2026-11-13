// A past day's menu (OpenSpec change habits-home, design D6): Done, Tiny, Skipped
// and Clear on a scheduled day before the current occurrence, in the thread and the
// month grid. The current state is marked; Clear is offered only when a record exists.
import type { ReactNode } from 'react'
import type { DayCell } from '../../lib/habits'
import type { DayChoice } from '../../lib/habitActions'
import { t } from '../../lib/i18n'
import { ActionMenu, type ActionItem } from '../menus/ActionMenu'

export function DayMenu({ cell, label, onPick, trigger, triggerClassName }: {
  cell: Pick<DayCell, 'date' | 'state'>
  label: string
  onPick: (choice: DayChoice) => void
  trigger?: ReactNode
  triggerClassName?: string
}) {
  const item = (id: Exclude<DayChoice, 'clear'>, text: string, state: string): ActionItem =>
    ({ kind: 'check', id, label: text, checked: cell.state === state, onSelect: () => onPick(id) })
  const items: ActionItem[] = [
    item('done', t('Done'), 'done'),
    item('tiny', t('Tiny version'), 'tiny'),
    item('skipped', t('Skipped'), 'skipped'),
    ...(cell.state !== 'missed' ? [{ kind: 'action' as const, id: 'clear', label: t('Clear'), icon: 'x' as const, onSelect: () => onPick('clear') }] : []),
  ]
  return (
    <ActionMenu label={label} title={label} groups={[{ items }]} align="start" width="sm:w-48"
      trigger={trigger ?? <span className="sr-only">{label}</span>} triggerClassName={triggerClassName} triggerProps={{ 'data-day': cell.date, 'data-state': cell.state }} />
  )
}
