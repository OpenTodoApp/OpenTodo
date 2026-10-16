// The "Fields" group of the task panel (OpenSpec custom-fields, "Fields in the
// detail panel"): one row per live definition of the task's project, in position
// order, each with an editor for its type. Every edit is one `fields.<id>` op,
// applied locally first. A value that no longer fits its definition's type is
// shown as text with a note; the next edit replaces it.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { db } from '../../lib/db'
import { formatValue, liveFields, matchesType, parseOptions, setFieldValue, taskFields, validateValue } from '../../lib/fields'
import type { FieldDef, FieldValue, Task } from '../../lib/types'
import { ComboboxPanel, Icon, Input, Switch } from '../../ui'
import { DateField } from '../datetime/DateField'
import { Popover } from '../overlay/Popover'

const NOT_A: Record<string, string> = { number: 'not a number', date: 'not a date', checkbox: 'not on or off', text: 'not text', link: 'not a link', choice: 'not an option' }

export function FieldsGroup({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const projectId = task.project_id
  const defs = useLiveQuery(
    () => (projectId ? db.fields.where('project_id').equals(projectId).toArray() : Promise.resolve([] as FieldDef[])),
    [projectId], [] as FieldDef[],
  )
  const live = liveFields(projectId, defs)
  if (live.length === 0) return null
  const values = taskFields(task)
  return (
    <section aria-label="Fields" data-fields-group className="space-y-1.5">
      <h3 className="flex items-center gap-2 text-meta font-semibold text-muted">
        <Icon name="list" className="text-faint" />Fields
      </h3>
      <div className="space-y-1.5">
        {live.map((def) => <FieldRow key={def.id} task={task} def={def} value={values[def.id]} readOnly={readOnly} />)}
      </div>
    </section>
  )
}

function FieldRow({ task, def, value, readOnly }: { task: Task; def: FieldDef; value: FieldValue | undefined; readOnly: boolean }) {
  const id = useId()
  const noteId = `${id}-note`
  const errId = `${id}-err`
  const [error, setError] = useState<string | null>(null)
  const mismatch = !matchesType(def, value)
  const describedBy = [mismatch ? noteId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  const write = async (raw: string | boolean | null) => {
    const v = validateValue(def, raw)
    if (!v.ok) {
      setError(v.message)
      return false
    }
    setError(null)
    if (v.value !== (value ?? null)) await setFieldValue(task.id, def.id, v.value)
    return true
  }
  let editor
  if (mismatch) {
    editor = <TextEditor id={id} def={def} value={value} readOnly={readOnly} describedBy={describedBy} invalid={!!error} onCommit={write} onReset={() => setError(null)} />
  } else {
    switch (def.type) {
      case 'checkbox':
        editor = <Switch id={id} label={def.name} hideLabel checked={value === true} disabled={readOnly} describedBy={describedBy} onChange={(on) => void write(on)} />
        break
      case 'date':
        editor = <DateField label={def.name} hideLabel value={typeof value === 'string' ? value : null} disabled={readOnly} onChange={(iso) => void write(iso)} />
        break
      case 'choice':
        editor = <ChoiceEditor id={id} def={def} value={typeof value === 'string' ? value : null} readOnly={readOnly} onPick={(v) => void write(v)} />
        break
      default:
        editor = <TextEditor id={id} def={def} value={value} readOnly={readOnly} describedBy={describedBy} invalid={!!error} onCommit={write} onReset={() => setError(null)} />
    }
  }
  return (
    <div className="grid grid-cols-[minmax(5rem,9rem)_minmax(0,1fr)] items-start gap-2" data-field-row={def.id}>
      <label htmlFor={id} className="truncate pt-1.5 text-meta text-muted">{def.name}</label>
      <div className="min-w-0 space-y-0.5">
        {editor}
        {mismatch && <p id={noteId} className="text-meta text-faint">({NOT_A[def.type] ?? 'does not match the field'})</p>}
        {error && <p id={errId} role="alert" className="text-meta text-danger">{error}</p>}
      </div>
    </div>
  )
}

/** Text, number and link: edited as text, written on Enter or when focus leaves. */
function TextEditor({ id, def, value, readOnly, describedBy, invalid, onCommit, onReset }: {
  id: string; def: FieldDef; value: FieldValue | undefined; readOnly: boolean; describedBy?: string; invalid: boolean
  onCommit: (raw: string) => Promise<boolean>; onReset: () => void
}) {
  const mismatch = !matchesType(def, value)
  const shown = value === null || value === undefined ? '' : mismatch ? String(value) : formatValue(def, value)
  const [draft, setDraft] = useState(shown)
  const editing = useRef(false)
  // A new value from outside (another device) replaces the text unless it is being edited.
  useEffect(() => { if (!editing.current) setDraft(shown) }, [shown])
  const commit = async () => {
    editing.current = false
    if (draft === shown) return
    const ok = await onCommit(draft)
    if (!ok) editing.current = true
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Escape' && draft !== shown) {
      e.stopPropagation()
      editing.current = false
      setDraft(shown)
      onReset()
    }
  }
  const link = def.type === 'link' && typeof value === 'string' && !mismatch && /^https?:\/\//i.test(value)
  return (
    <div className="flex items-center gap-1">
      <Input id={id} value={draft} readOnly={readOnly} aria-describedby={describedBy} aria-invalid={invalid || undefined}
        inputMode={def.type === 'number' ? 'decimal' : undefined} type={def.type === 'link' ? 'url' : 'text'}
        placeholder={readOnly ? '' : 'Empty'} className="min-w-0 flex-1 py-1.5"
        onFocus={() => { editing.current = true }}
        onChange={(e) => { editing.current = true; setDraft(e.target.value) }}
        onBlur={() => void commit()} onKeyDown={onKeyDown} />
      {link && (
        <a href={value} target="_blank" rel="noopener noreferrer" aria-label={`Open ${def.name} link`}
          className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon shrink-0" data-field-open>
          <Icon name="external-link" />
        </a>
      )}
    </div>
  )
}

const CLEAR = '\u0000clear'

/** A choice: a button showing the value that opens the options (Enter, Space or Alt+Down). */
function ChoiceEditor({ id, def, value, readOnly, onPick }: { id: string; def: FieldDef; value: string | null; readOnly: boolean; onPick: (v: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const options = parseOptions(def.options)
  const items = value ? [...options, CLEAR] : options
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
    }
  }
  const close = () => {
    setOpen(false)
    anchor.current?.focus()
  }
  return (
    <>
      <button ref={anchor} id={id} type="button" disabled={readOnly} aria-haspopup="dialog" aria-expanded={open}
        className="ui-input flex min-w-0 py-1.5 items-center justify-between gap-2 text-left disabled:cursor-default"
        onClick={() => setOpen(true)} onKeyDown={onKeyDown}>
        <span className={`truncate ${value ? 'text-default' : 'text-faint'}`}>{value ?? (readOnly ? '' : 'Empty')}</span>
        {!readOnly && <Icon name="chevron-down" size="xs" className="shrink-0 text-faint" />}
      </button>
      <Popover open={open} onClose={close} anchor={anchor} label={def.name} align="start" width="sm:w-72" className="p-2">
        <ComboboxPanel<string> label={def.name} placeholder="Find an option…" source={items}
          getKey={(o) => o} getLabel={(o) => (o === CLEAR ? 'Clear' : o)} pinned={value ? [CLEAR] : []} selected={value ? [value] : []}
          emptyText="No option matches." onPick={(o) => { onPick(o === CLEAR ? null : o); close() }} onClose={close} />
      </Popover>
    </>
  )
}
