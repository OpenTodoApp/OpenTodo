// "Fields…" from the project menu (OpenSpec change custom-fields, "Managing
// definitions"): the project's custom fields, added, renamed, given options,
// reordered and deleted. Every change is an ordinary op on the `field` entity, so
// it works offline and converges; editors and above manage, viewers never see it.
import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react'
import { Button, ConfirmDialog, Field, IconButton, Input, Notice, Select, Textarea } from '../ui'
import { db } from '../lib/db'
import {
  createField, deleteField, FIELD_TYPES, FieldError, liveFields, MAX_FIELDS, parseOptions, renameField, reorderField, setFieldOptions, tasksWithValue,
} from '../lib/fields'
import type { FieldDef, FieldType, Project } from '../lib/types'
import { HelpLink } from './help/HelpLink'
import { Dialog } from './overlay/Dialog'

export const TYPE_LABEL: Record<FieldType, string> = { text: 'Text', number: 'Number', date: 'Date', choice: 'Choice', link: 'Link', checkbox: 'Checkbox' }

const message = (err: unknown) => (err instanceof FieldError || err instanceof Error ? err.message : String(err))

/** Old option names matched to new ones by position, for a rename that keeps task values (custom-fields D5). */
export function optionRenames(before: readonly string[], after: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (before.length !== after.length) return out
  before.forEach((b, i) => { if (after[i] && after[i] !== b && !before.includes(after[i])) out[b] = after[i] })
  return out
}

function FieldRow({ def, first, last }: { def: FieldDef; first: boolean; last: boolean }) {
  const [name, setName] = useState(def.name)
  const [options, setOptions] = useState(parseOptions(def.options).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const saveName = async () => {
    if (name.trim() === def.name) return setError(null)
    try { await renameField(def.id, name); setError(null) } catch (err) { setError(message(err)); nameRef.current?.focus() }
  }
  const saveOptions = async () => {
    const before = parseOptions(def.options)
    const after = options.split('\n').map((o) => o.trim()).filter(Boolean)
    if (after.join('\n') === before.join('\n')) return
    try { await setFieldOptions(def.id, after, optionRenames(before, after)); setError(null) } catch (err) { setError(message(err)) }
  }
  const onKey = (e: KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    void reorderField(def.id, e.key === 'ArrowUp' ? (e.shiftKey ? 'top' : -1) : (e.shiftKey ? 'bottom' : 1))
  }

  return (
    <li className="space-y-2 py-3" data-field-row={def.id} onKeyDown={onKey}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name" className="min-w-0 flex-1">
          <Input ref={nameRef} value={name} maxLength={60} aria-invalid={!!error} onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveName() } }} />
        </Field>
        <span className="pb-2 text-meta text-muted" data-field-type={def.type}>{TYPE_LABEL[def.type as FieldType] ?? def.type}</span>
        <span className="flex items-center pb-1">
          <IconButton icon="arrow-up" label={`Move ${def.name} up`} size="sm" disabled={first} onClick={() => void reorderField(def.id, -1)} />
          <IconButton icon="arrow-down" label={`Move ${def.name} down`} size="sm" disabled={last} onClick={() => void reorderField(def.id, 1)} />
          <IconButton icon="trash-2" label={`Delete ${def.name}`} size="sm" onClick={() => void tasksWithValue(def.id).then(setDeleting)} />
        </span>
      </div>
      {def.type === 'choice' && (
        <Field label="Options" description="One per line. Renaming an option in place updates the tasks that hold it.">
          <Textarea rows={Math.min(8, Math.max(3, options.split('\n').length))} value={options} onChange={(e) => setOptions(e.target.value)} onBlur={() => void saveOptions()} />
        </Field>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {deleting !== null && (
        <ConfirmDialog title={`Delete the field “${def.name}”?`} confirmLabel="Delete field"
          consequence={deleting === 0 ? 'No task holds a value for it.' : `${deleting} ${deleting === 1 ? 'task holds a value' : 'tasks hold values'} for it; the values stay in their history.`}
          onConfirm={() => deleteField(def.id)} onCancel={() => setDeleting(null)} />
      )}
    </li>
  )
}

export function FieldsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const defs = useLiveQuery(() => db.fields.where('project_id').equals(project.id).toArray(), [project.id], [] as FieldDef[])
  const live = liveFields(project.id, defs)
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [options, setOptions] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    try {
      await createField(project.id, { name, type, ...(type === 'choice' ? { options: options.split('\n').map((o) => o.trim()).filter(Boolean).join('\n') } : {}) })
      setName(''); setOptions(''); setError(null)
      nameRef.current?.focus()
    } catch (err) {
      setError(message(err))
      nameRef.current?.focus()
    }
  }

  return (
    <Dialog title={<span className="user-text">Fields of “{project.name}”</span>} label={`Fields of ${project.name}`} onClose={onClose} size="md" testId="fields-dialog">
      <p className="text-meta text-muted">Fields add your own columns to every task of this project, such as a cost, a client or a link. <span className="ui-kbd">Alt</span>+<span className="ui-kbd">Up</span> or <span className="ui-kbd">Down</span> moves the focused field.</p>
      <HelpLink screen="fields-dialog" topic="Custom fields" />
      {live.length > 0 ? (
        <ul className="divide-y divide-default" aria-label="Fields" data-fields-list>
          {live.map((d, i) => <FieldRow key={d.id} def={d} first={i === 0} last={i === live.length - 1} />)}
        </ul>
      ) : <p className="py-3 text-meta text-faint">No fields yet.</p>}
      {live.length < MAX_FIELDS ? (
        <form onSubmit={(e) => void add(e)} className="mt-3 space-y-2 border-t border-default pt-3" data-field-add>
          <h3 className="text-body font-medium text-default">Add a field</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Name" className="min-w-0 flex-1">
              <Input ref={nameRef} value={name} maxLength={60} required aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null) }} data-autofocus />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
          </div>
          {type === 'choice' && (
            <Field label="Options" description="One per line, up to 50.">
              <Textarea rows={3} value={options} onChange={(e) => setOptions(e.target.value)} />
            </Field>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Done</Button>
            <Button variant="primary" type="submit">Add field</Button>
          </div>
        </form>
      ) : <Notice>A project has at most {MAX_FIELDS} fields.</Notice>}
    </Dialog>
  )
}
