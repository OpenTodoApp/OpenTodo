// The inline editor of one proposed item (OpenSpec change assistant-generative-ui
// D6; assistant-proposal-editing D2): the fields its proposal sets, checked as in
// the app. The list opens it from each row's pencil, and so do the calendar,
// outline and map shapes.
import { useState, type KeyboardEvent } from 'react'
import type { ReviewItem } from '../../lib/assistant'
import { checkEdit, editableFields, type EditableField, type ItemEdits } from '../../lib/assistantShape'
import { t } from '../../lib/i18n'
import { priorityName } from '../../lib/priority'
import { Field, Input, Select } from '../../ui'

export type OnEdit = (index: number, edits: ItemEdits) => void

const FIELD_LABEL: Record<EditableField, () => string> = {
  title: () => t('Title'),
  due: () => t('Do on'),
  time: () => t('Time'),
  start: () => t('Start'),
  deadline: () => t('Deadline'),
  priority: () => t('Priority'),
}

const EDIT_ERROR: Record<string, () => string> = {
  empty: () => t('Enter a title.'),
  long: () => t('The title is too long.'),
  date: () => t('Enter a date.'),
  time: () => t('Enter a time.'),
  priority: () => t('Choose a priority.'),
}

/** The value an editable field holds in the proposal, as its input shows it. */
function proposedValue(item: ReviewItem, field: EditableField): string {
  const p = item.change.patch
  if (field === 'title') return String((item.change.entity === 'project' ? p.name : p.title) ?? '')
  if (field === 'due') return String((p.due as { date?: string } | null)?.date ?? '')
  if (field === 'time') return String((p.due as { time?: string } | null)?.time ?? '')
  return String(p[field] ?? '')
}

const INPUT_TYPE: Partial<Record<EditableField, string>> = { title: 'text', time: 'time' }

export function ItemEditor({ item, index, onEdit, onClose, focus }: { item: ReviewItem; index: number; onEdit: OnEdit; onClose: () => void; focus?: EditableField }) {
  const fields = editableFields(item)
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, proposedValue(item, f)])))
  const errors = Object.fromEntries(fields.map((f) => [f, checkEdit(f, draft[f] ?? '')]))
  const first = focus && fields.includes(focus) ? focus : fields[0]
  const done = () => {
    if (fields.some((f) => errors[f])) return
    const changed: ItemEdits = {}
    for (const f of fields) if (draft[f] !== proposedValue(item, f)) changed[f] = draft[f]
    if (Object.keys(changed).length) onEdit(index, changed)
    onClose()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter and Esc belong to the editor here, not to the card (apply, discard).
    const inField = (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT'
    if (e.key === 'Enter' && inField) { e.preventDefault(); e.stopPropagation(); done() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
  }
  return (
    <div className="space-y-2 border-t border-soft bg-sunken px-3 py-2" onKeyDown={onKeyDown} data-assistant-editor>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f} label={FIELD_LABEL[f]()} error={errors[f] ? EDIT_ERROR[errors[f]!]() : undefined} className={f === 'title' ? 'sm:col-span-2' : ''}>
            {f === 'priority' ? (
              <Select value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} data-edit-field={f}>
                {['1', '2', '3', '4'].map((v) => <option key={v} value={v}>{priorityName(Number(v))}</option>)}
              </Select>
            ) : (
              <Input type={INPUT_TYPE[f] ?? 'date'} value={draft[f]} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} data-edit-field={f} autoFocus={f === first} />
            )}
          </Field>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={done} data-edit-done>{t('Done')}</button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClose}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
