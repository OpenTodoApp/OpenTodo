// The task panel's custom fields (OpenSpec change custom-fields, "Fields in the
// detail panel"): one row per live definition of the task's project, each with
// the editor of its type. Edits are ordinary ops on `fields.<id>`, applied at once.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Combobox, Icon, Input, Switch } from '../../ui'
import { db } from '../../lib/db'
import { formatValue, liveFields, matchesType, parseOptions, validateValue } from '../../lib/fields'
import { updateTask } from '../../lib/ops'
import type { FieldDef, FieldValue, Task } from '../../lib/types'
import { DateField } from '../datetime/DateField'

/** The browser locale's decimal separator, for number input. */
export function decimalSeparator(locale?: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.'
}

function save(task: Task, def: FieldDef, value: FieldValue) {
  return updateTask(task.id, { fields: { [def.id]: value } })
}

/** Text, number and link: a text input that commits on Enter or blur, with an inline error. */
function TextEditor({ task, def, value, note }: { task: Task; def: FieldDef; value: FieldValue; note: boolean }) {
  const shown = def.type === 'number' ? formatValue(def, value) : value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(shown); setError(null) }, [shown])
  const commit = () => {
    if (draft === shown) return setError(null)
    const r = validateValue(def, draft, decimalSeparator())
    if (!r.ok) return setError(r.message)
    setError(null)
    void save(task, def, r.value)
  }
  const id = `field-${def.id}`
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-1">
        <Input id={id} value={draft} inputMode={def.type === 'number' ? 'decimal' : def.type === 'link' ? 'url' : undefined}
          aria-invalid={!!error} aria-describedby={[error && `${id}-error`, note && `${id}-note`].filter(Boolean).join(' ') || undefined} placeholder={def.type === 'link' ? 'https://' : ''}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape' && draft !== shown) { e.stopPropagation(); setDraft(shown); setError(null) } }} />
        {def.type === 'link' && typeof value === 'string' && value && (
          <a href={value} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon" aria-label={`Open ${def.name}`} data-field-open>
            <Icon name="external-link" size="sm" />
          </a>
        )}
      </span>
      {error && <span id={`${id}-error`} role="alert" className="text-meta text-danger">{error}</span>}
    </span>
  )
}

/** The note beside a stored value that does not match its definition's type. */
const MISMATCH: Record<string, string> = { number: 'not a number', date: 'not a date', link: 'not a link', checkbox: 'not yes or no', choice: 'not an option' }

const CLEAR = '\u0000clear'

function Editor({ task, def, value, note }: { task: Task; def: FieldDef; value: FieldValue; note: boolean }) {
  switch (def.type) {
    case 'date':
      return <DateField label={def.name} hideLabel value={typeof value === 'string' ? value : null} onChange={(iso) => void save(task, def, iso)} />
    case 'choice': {
      const options = parseOptions(def.options)
      const current = typeof value === 'string' && value ? value : null
      const items = [CLEAR, ...options, ...(current && !options.includes(current) ? [current] : [])]
      return (
        <Combobox<string> label={def.name} placeholder={current ?? 'Choose…'} source={items} getKey={(o) => o} getLabel={(o) => (o === CLEAR ? 'Clear' : o)}
          pinned={[CLEAR]} selected={current ? [current] : []} rankContext={`field:${def.id}`} emptyText="No option matches."
          onPick={(o) => { const next = o === CLEAR ? null : o; if (next !== current) void save(task, def, next) }} />
      )
    }
    case 'checkbox':
      return <Switch checked={value === true} label={def.name} hideLabel onChange={(on) => void save(task, def, on ? true : null)} />
    default:
      return <TextEditor task={task} def={def} value={value} note={note} />
  }
}

export function FieldsGroup({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const defs = useLiveQuery(() => (task.project_id ? db.fields.where('project_id').equals(task.project_id).toArray() : Promise.resolve([] as FieldDef[])), [task.project_id], [] as FieldDef[])
  const live = liveFields(task.project_id, defs)
  if (live.length === 0) return null
  return (
    <section aria-label="Fields" data-fields-group>
      <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted"><Icon name="list" className="text-faint" />Fields</h3>
      <dl className="space-y-1.5">
        {live.map((d) => {
          const value = task.fields?.[d.id] ?? null
          const mismatch = !matchesType(d, value)
          return (
            <div key={d.id} className="flex items-center gap-3" data-field={d.id}>
              <dt className="w-28 shrink-0 truncate text-meta text-muted">
                {d.type === 'date' || d.type === 'checkbox' || readOnly ? d.name : <label htmlFor={`field-${d.id}`}>{d.name}</label>}
              </dt>
              <dd className="flex min-w-0 flex-1 flex-col gap-0.5">
                {readOnly ? (
                  d.type === 'link' && typeof value === 'string' && value
                    ? <a href={value} target="_blank" rel="noopener noreferrer" className="text-accent underline">{value}</a>
                    : <span className="text-body text-default">{formatValue(d, value) || <span className="text-faint">Empty</span>}</span>
                ) : <Editor task={task} def={d} value={value} note={mismatch} />}
                {mismatch && <span id={`field-${d.id}-note`} className="text-meta text-muted" data-field-mismatch>({MISMATCH[d.type] ?? 'not valid'})</span>}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
