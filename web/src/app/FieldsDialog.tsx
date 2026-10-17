// The "Fields…" dialog of a project (OpenSpec custom-fields, "Managing
// definitions"): list, add, rename, edit options, reorder (drag or Alt+↑/↓) and
// delete the project's field definitions. Every action is an ordinary op through
// lib/fields.ts, so it works offline and converges; every action is reachable
// with the keyboard. Offered to editors and above only (the project menu hides it
// from viewers).
import { useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useProjectFieldRows, useProjectTaskRows } from '../lib/localData'
import {
  countValues, createField, deleteField, FIELD_TYPES, FieldError, liveFields, MAX_FIELDS, parseOptions, renameField, reorderField, setFieldOptions,
} from '../lib/fields'
import type { FieldDef, FieldType, Project, Task } from '../lib/types'
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Select, Textarea, Dialog } from '../ui'
import { HelpLink } from './help/HelpLink'
import { t } from '../lib/i18n'
import { act } from './actionError'

const typeLabel = (item: string) => FIELD_TYPES.find((x) => x.type === item)?.label ?? item

export function FieldsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const defs = useProjectFieldRows(project.id)
  const tasks = useProjectTaskRows(project.id)
  const live = useMemo(() => liveFields(project.id, defs), [project.id, defs])
  const [removing, setRemoving] = useState<FieldDef | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const focusRow = (id: string) => window.setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-field-def="${id}"] [data-field-handle]`)?.focus(), 30)
  const move = async (id: string, delta: -1 | 1) => {
    if (await reorderField(id, delta)) focusRow(id)
  }
  const onHandleKey = (e: KeyboardEvent, id: string) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      act(move(id, e.key === 'ArrowUp' ? -1 : 1))
    }
  }
  const onDrop = async (e: DragEvent, target: string) => {
    e.preventDefault()
    const from = live.findIndex((d) => d.id === dragId)
    const to = live.findIndex((d) => d.id === target)
    setDragId(null)
    if (from < 0 || to < 0 || from === to) return
    const id = live[from].id
    for (let i = 0; i < Math.abs(to - from); i++) await reorderField(id, to > from ? 1 : -1)
  }

  return (
    <Dialog title={t('Fields of {name}', { name: project.name })} onClose={onClose} size="md" testId="fields-dialog">
      <div className="space-y-4">
        <p className="text-meta text-muted">
          {t('Typed values every task of this project can hold, shown in the task panel, on cards and in the columns layout, and usable in filters. At most {max} fields.', { max: MAX_FIELDS })}{' '}<HelpLink screen="project-fields" topic={t('Custom fields')} />
        </p>
        {live.length === 0 ? (
          <p className="text-body text-faint">{t('No fields yet.')}</p>
        ) : (
          <ul ref={listRef} className="divide-y divide-default rounded-card border border-default" aria-label={t('Fields')}>
            {live.map((d, i) => (
              <FieldItem key={d.id} def={d} first={i === 0} last={i === live.length - 1} dragging={dragId === d.id}
                onMove={(delta) => act(move(d.id, delta))} onHandleKey={(e) => onHandleKey(e, d.id)}
                onDragStart={() => setDragId(d.id)} onDrop={(e) => void onDrop(e, d.id)}
                onDelete={() => setRemoving(d)} tasks={tasks} />
            ))}
          </ul>
        )}
        <AddField projectId={project.id} disabled={live.length >= MAX_FIELDS} />
      </div>
      {removing && (
        <ConfirmDialog title={t('Delete the field “{name}”?', { name: removing.name })} confirmLabel={t('Delete field')}
          consequence={valuesText(countValues(removing.id, tasks))}
          onConfirm={() => deleteField(removing.id)} onCancel={() => setRemoving(null)} />
      )}
    </Dialog>
  )
}

/** The delete confirmation (spec: it states how many tasks hold a value). */
export function valuesText(n: number): string {
  if (n === 0) return t('No task holds a value for it.')
  return t('{n, plural, one {Values on # task are kept but hidden.} other {Values on # tasks are kept but hidden.}}', { n })
}

function FieldItem({ def, first, last, dragging, tasks, onMove, onHandleKey, onDragStart, onDrop, onDelete }: {
  def: FieldDef; first: boolean; last: boolean; dragging: boolean; tasks: Task[]
  onMove: (delta: -1 | 1) => void; onHandleKey: (e: KeyboardEvent) => void
  onDragStart: () => void; onDrop: (e: DragEvent) => void; onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(def.name)
  const [error, setError] = useState<string | null>(null)
  const [editingOptions, setEditingOptions] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const saveName = async () => {
    try {
      await renameField(def.id, name)
      setError(null)
      setRenaming(false)
    } catch (err) {
      setError(err instanceof FieldError ? err.message : String(err))
      nameRef.current?.focus()
    }
  }
  return (
    <li data-field-def={def.id} className={`space-y-2 px-3 py-2 ${dragging ? 'opacity-50' : ''}`}
      draggable={!renaming && !editingOptions} onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="flex items-center gap-2">
        <button type="button" data-field-handle aria-label={t('Move {name} (Alt+Up or Alt+Down)', { name: def.name })} onKeyDown={onHandleKey}
          className="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon shrink-0 cursor-grab">
          <Icon name="grip-vertical" />
        </button>
        {renaming ? (
          <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); void saveName() }}>
            <Input ref={nameRef} autoFocus value={name} aria-label={t('Rename {name}', { name: def.name })} aria-invalid={!!error || undefined} className="py-1.5"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setName(def.name); setError(null); setRenaming(false) } }} />
            <Button type="submit" size="sm" variant="primary">{t('Save')}</Button>
          </form>
        ) : (
          <span className="user-text min-w-0 flex-1 truncate text-body text-default">{def.name}</span>
        )}
        <span className="shrink-0 text-meta text-faint" data-field-type>{typeLabel(def.type)}</span>
        {!renaming && <IconButton icon="pencil" size="sm" label={t('Rename {name}', { name: def.name })} onClick={() => { setName(def.name); setRenaming(true) }} />}
        {def.type === 'choice' && <IconButton icon="list" size="sm" label={t('Edit the options of {name}', { name: def.name })} aria-expanded={editingOptions} onClick={() => setEditingOptions((v) => !v)} />}
        <IconButton icon="arrow-up" size="sm" label={t('Move {name} up', { name: def.name })} disabled={first} onClick={() => onMove(-1)} />
        <IconButton icon="arrow-down" size="sm" label={t('Move {name} down', { name: def.name })} disabled={last} onClick={() => onMove(1)} />
        <IconButton icon="trash-2" size="sm" label={t('Delete {name}', { name: def.name })} onClick={onDelete} />
      </div>
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      {editingOptions && <OptionsEditor def={def} tasks={tasks} onDone={() => setEditingOptions(false)} />}
    </li>
  )
}

/**
 * The options of a choice field, one per line. A line changed in place (same
 * position, same number of lines) is a rename: tasks holding the old text are
 * rewritten on this device (spec "Rename an option").
 */
function OptionsEditor({ def, tasks, onDone }: { def: FieldDef; tasks: Task[]; onDone: () => void }) {
  const [text, setText] = useState(parseOptions(def.options).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const renames = useMemo(() => renamedOptions(def.options, text), [def.options, text])
  const affected = tasks.filter((task) => !task.deleted_at && typeof task.fields?.[def.id] === 'string' && (task.fields[def.id] as string) in renames).length
  const save = async () => {
    try {
      await setFieldOptions(def.id, text, renames)
      onDone()
    } catch (err) {
      setError(err instanceof FieldError ? err.message : String(err))
    }
  }
  return (
    <div className="space-y-2">
      <Field label={t('Options, one per line')} error={error ?? undefined}
        description={affected > 0 ? t('{n, plural, one {# task will be updated.} other {# tasks will be updated.}}', { n: affected }) : undefined}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onDone}>{t('Cancel')}</Button>
        <Button size="sm" variant="primary" onClick={save}>{t('Save options')}</Button>
      </div>
    </div>
  )
}

/** Options renamed in place: same count of lines, a line at the same position changed. */
export function renamedOptions(before: string, after: string): Record<string, string> {
  const a = parseOptions(before)
  const b = parseOptions(after)
  const out: Record<string, string> = {}
  if (a.length !== b.length) return out
  a.forEach((o, i) => { if (o !== b[i] && !b.includes(o)) out[o] = b[i] })
  return out
}

function AddField({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [options, setOptions] = useState('')
  const [error, setError] = useState<{ message: string; field: string } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLTextAreaElement>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await createField(projectId, { name, type, options })
      setName('')
      setOptions('')
      setError(null)
      nameRef.current?.focus()
    } catch (err) {
      const f = err instanceof FieldError ? err.field : 'name'
      setError({ message: err instanceof Error ? err.message : String(err), field: f })
      // Keep focus on the input that needs fixing (spec "Duplicate name").
      ;(f === 'options' ? optionsRef.current : nameRef.current)?.focus()
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-card border border-dashed border-input p-3" aria-label={t('Add a field')}>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label={t('Name')} error={error?.field === 'name' ? error.message : undefined}>
          <Input ref={nameRef} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} placeholder={t('Cost')} />
        </Field>
        <Field label={t('Type')}>
          <Select value={type} disabled={disabled} onChange={(e) => setType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </Select>
        </Field>
      </div>
      {type === 'choice' && (
        <Field label={t('Options, one per line')} error={error?.field === 'options' ? error.message : undefined}>
          <Textarea ref={optionsRef} value={options} rows={3} onChange={(e) => setOptions(e.target.value)} placeholder={t('Quote\nOrdered\nDone')} />
        </Field>
      )}
      {error && error.field === 'type' && <p role="alert" className="text-meta text-danger">{error.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" icon="plus" disabled={disabled}>{disabled ? t('At most {MAX_FIELDS} fields', { MAX_FIELDS }) : t('Add field')}</Button>
      </div>
    </form>
  )
}
