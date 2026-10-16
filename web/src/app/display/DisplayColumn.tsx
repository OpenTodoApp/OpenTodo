// One group of rows on a display (OpenSpec change display-mode, design D3, D5):
// a heading and large rows with a checkbox where the account may toggle. The
// rows reuse the list's checkbox look and its priority and due marks but not
// TaskRow, which carries drag handles, menus and hover controls a display must
// not show. Shared by the signed-in display and the public link display.
import { Icon } from '../../ui'

export interface DisplayRowData {
  /** Unique on the screen (a task can sit in two groups of a saved view). */
  key: string
  id: string
  title: string
  done: boolean
  priority: number
  /** Due label ("Today 09:00", "14 Oct"), when the task has one. */
  due?: string | null
  overdue?: boolean
  /** Parent title of a subtask, or the assignee. */
  context?: string | null
  depth?: number
  /** The account may complete or reopen it (display-mode "Toggling tasks on a display"). */
  editable: boolean
}

/** Icons follow the display's type scale. */
const EM = { width: '0.8em', height: '0.8em' }
const PRIORITY_MARK: Record<number, string> = { 1: 'text-p1', 2: 'text-p2', 3: 'text-p3' }

export function DisplayColumn({ id, heading, rows, empty, focusKey, onFocusRow, onToggle }: {
  id: string
  heading?: string | null
  rows: DisplayRowData[]
  /** Shown when there are no rows; the group is left out when absent. */
  empty?: string
  focusKey: string | null
  onFocusRow: (key: string) => void
  onToggle: (row: DisplayRowData) => void
}) {
  if (rows.length === 0 && !empty) return null
  const headingId = `display-group-${id}`
  return (
    <section aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : 'Tasks'} data-display-group={id} className="min-w-0">
      {heading && <h2 id={headingId} className="display-heading mb-1 border-b-2 border-default pb-1">{heading}</h2>}
      {rows.length === 0 ? (
        <p className="display-meta py-2">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <DisplayRow key={r.key} row={r} focused={focusKey === r.key} onFocus={() => onFocusRow(r.key)} onToggle={() => onToggle(r)} />
          ))}
        </ul>
      )}
    </section>
  )
}

function DisplayRow({ row, focused, onFocus, onToggle }: { row: DisplayRowData; focused: boolean; onFocus: () => void; onToggle: () => void }) {
  const title = row.title || 'Untitled'
  const state = row.done ? 'done' : row.overdue ? 'overdue' : 'open'
  const label = [title, row.due ? `due ${row.due}` : null, row.priority < 4 ? `priority ${row.priority}` : null, state].filter(Boolean).join(', ')
  return (
    <li tabIndex={focused ? 0 : -1} aria-label={label} className="display-row" data-display-row={row.key} data-task-id={row.id}
      data-done={row.done || undefined} data-editable={row.editable || undefined} onFocus={onFocus}
      style={row.depth ? { paddingInlineStart: `${row.depth * 1.25}em` } : undefined}>
      {row.editable ? (
        <button type="button" role="checkbox" aria-checked={row.done} tabIndex={-1} aria-label={`${row.done ? 'Reopen' : 'Complete'} ${title}`}
          className="display-check" data-display-check onClick={(e) => { e.stopPropagation(); onToggle() }}>
          <span className={`display-check-mark ${row.done ? 'border-input bg-faint text-on-accent' : 'border-input'}`}>
            {row.done && <Icon name="check" style={EM} />}
          </span>
        </button>
      ) : (
        row.done && <span className="display-check" aria-hidden><Icon name="check" style={EM} /></span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`display-task user-text block ${row.done ? 'text-faint line-through' : 'text-default'}`}>{title}</span>
        {(row.due || row.context) && (
          <span className="display-meta block">
            {row.due && <span className={row.overdue && !row.done ? 'font-semibold text-danger' : ''}>{row.due}</span>}
            {row.due && row.context && ' · '}
            {row.context && <span className="user-text">{row.context}</span>}
          </span>
        )}
      </span>
      {row.priority < 4 && (
        <span className={`shrink-0 ${PRIORITY_MARK[row.priority] ?? ''}`} data-priority={row.priority} aria-hidden>
          <Icon name="flag" style={EM} />
        </span>
      )}
    </li>
  )
}
