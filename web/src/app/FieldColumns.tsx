// The columns layout of a project's list (OpenSpec custom-fields, "Columns layout
// in the list view"): the same rows as the list with one read-only cell per live
// field definition, under a sticky header row. Editing stays in the task panel,
// so cells are not focusable and the list keys (j/k, Enter) are unchanged.
import type { ReactNode } from 'react'
import { formatValue, matchesType, taskFields } from '../lib/fields'
import type { FieldDef, Task } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'
import { TruncatedText } from '../ui'

/** The grid columns: the task, then one column per field. */
export function columnsTemplate(n: number): string {
  return `minmax(14rem, 1fr) repeat(${n}, minmax(6rem, 9rem))`
}

export function FieldColumnsTable({ defs, children }: { defs: readonly FieldDef[]; children: ReactNode }) {
  return (
    <div role="table" aria-label={t('Tasks and fields')} className="mb-4 overflow-x-auto" data-field-columns data-scroll-x>
      <div role="rowgroup" className="sticky top-0 z-10 bg-canvas">
        <div role="row" className="grid items-end gap-2 border-b border-default pb-1 text-meta font-semibold text-muted" style={{ gridTemplateColumns: columnsTemplate(defs.length) }}>
          <span role="columnheader" className="pl-15">{t('Task')}</span>
          {defs.map((d) => <span key={d.id} role="columnheader" className="user-text truncate" data-column={d.id}>{d.name}</span>)}
        </div>
      </div>
      {children}
    </div>
  )
}

/** One row of the table: the list row as the first cell, then the values. */
export function FieldColumnsRow({ task, defs, row }: { task: Task; defs: readonly FieldDef[]; row: ReactNode }) {
  const { resolved } = useDateTimeFormat()
  const values = taskFields(task)
  return (
    <div role="row" className="grid items-start gap-2" style={{ gridTemplateColumns: columnsTemplate(defs.length) }} data-columns-row={task.id}>
      <div role="cell" className="min-w-0"><ul>{row}</ul></div>
      {defs.map((d) => {
        const v = values[d.id]
        const ok = matchesType(d, v)
        const text = v === null || v === undefined ? '' : ok ? formatValue(d, v, resolved) : String(v)
        return (
          <div key={d.id} role="cell" className={`user-text min-w-0 pt-2 text-meta ${ok ? 'text-default' : 'text-faint italic'} ${d.type === 'number' ? 'tabular-nums' : ''}`}
            data-cell={d.id}>
            <TruncatedText className="block" text={text} />{!ok && <span className="sr-only">{' '}{t('(does not match the field type)')}</span>}
          </div>
        )
      })}
    </div>
  )
}
