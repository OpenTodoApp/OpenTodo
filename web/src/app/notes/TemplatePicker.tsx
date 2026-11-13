// From template… (OpenSpec change note-templates): a Combobox of the user's
// templates, then the built-in ones of the library, anchored to New note's
// split part. Choosing one makes a note from it in one batch with one Undo
// and opens it. Loaded with the Notes page; the built-ins load when it opens.
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { t } from '../../lib/i18n'
import { useNoteRows } from '../../lib/noteRows'
import { builtinNoteTemplates, builtinText, createFromTemplate, type BuiltinNoteTemplate, type TemplateSource } from '../../lib/noteTemplates'
import type { Note } from '../../lib/types'
import { ComboboxField, ComboboxList, Popover, useCombobox } from '../../ui'
import { withToast } from './noteActions'

type Item = { key: string; label: string; group: string; src: TemplateSource }

/** The user's templates by title, then the built-ins in the interface language. */
export function templateItems(notes: readonly Note[], builtins: readonly BuiltinNoteTemplate[]): Item[] {
  const mine = notes.filter((n) => n.template && !n.deleted_at)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    .map((n): Item => ({ key: `note:${n.id}`, label: n.title.trim() || t('Untitled note'), group: t('Your templates'), src: { kind: 'note', note: n } }))
  const lib = builtins.map((b): Item => ({ key: `builtin:${b.slug}`, label: builtinText(b).title, group: t('Built-in'), src: { kind: 'builtin', template: b } }))
  return [...mine, ...lib]
}

/** Makes a note from a template and returns its id (null when it failed). */
export async function makeFromTemplate(src: TemplateSource, projectId?: string | null): Promise<string | null> {
  return (await withToast(createFromTemplate(src, { projectId })))?.id ?? null
}

export function TemplatePicker({ open, anchor, projectId, onClose, onCreated }: {
  open: boolean; anchor: RefObject<HTMLElement | null>
  /** The project of an `in:` chip: a built-in goes there. */
  projectId?: string | null
  onClose: () => void; onCreated: (id: string) => void
}) {
  const notes = useNoteRows()
  const [builtins, setBuiltins] = useState<BuiltinNoteTemplate[]>([])
  useEffect(() => { if (open) void builtinNoteTemplates().then(setBuiltins) }, [open])
  const items = useMemo(() => templateItems(notes, builtins), [notes, builtins])
  const state = useCombobox<Item>({
    source: items, getKey: (i) => i.key, getLabel: (i) => i.label, getGroup: (i) => i.group,
    onPick: (i) => { onClose(); void makeFromTemplate(i.src, projectId).then((id) => { if (id) onCreated(id) }) },
    onClose,
  })
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label={t('From template…')} align="end" width="sm:w-80" className="p-2">
      <div className="space-y-1" data-template-picker>
        <ComboboxField state={state} label={t('From template…')} placeholder={t('Find a template…')} expanded autoFocus />
        <ComboboxList state={state} label={t('Templates')} emptyText={t('No templates yet.')} />
      </div>
    </Popover>
  )
}
