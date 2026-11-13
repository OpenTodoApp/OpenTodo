// A standalone note open for editing (OpenSpec change notes-overview, design D7):
// the title, the note editor (entity `note`: every command but mentions, images and
// Make subtask; the Formatting toggle on a computer, the touch formatting row on
// phones), then Project and Labels. In the docked panel on a computer (/notes/<id>),
// as a page on a phone. A viewer of a shared project gets it read-only, without
// conversions. The title saves on the note editor's cadence (notes-save-cadence):
// a timed save pushed later, leaving the field pushes at once.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLabels, useMembershipMap, useProjects, useUserPrefsRow } from '../../lib/localData'
import { createLabel } from '../../lib/labels'
import { useNoteRow } from '../../lib/noteRows'
import { setNoteProject, toggleNoteLabel } from '../../lib/noteOps'
import { mutate } from '../../lib/ops'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { pushPendingNotes } from '../../lib/sync'
import type { Label, Note } from '../../lib/types'
import { resettable } from '../../lib/moduleState'
import { useResetOnChange } from '../../lib/useResetOnChange'
import { Combobox, LabelChip, PageBody, PageHeader } from '../../ui'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { LinkedRefs, Markdown } from '../Markdown'
import { PanelFrame } from '../PanelFrame'
import { applyPanelWidth, NOTE_PANEL_WIDTH } from '../panel'
import { PanelResizeHandle } from '../sidePanel'
import { ProjectPickerField } from '../ProjectPickerField'
import { navigate } from '../router'
import { isFavourite, setFavourite } from '../../lib/favourites'
import { deleteNote, turnNoteIntoTask } from './noteActions'
import { NoteMenu } from './NoteRow'
import { openConnections, useConnected } from '../signals'

const NotesEditor = lazy(() => import('../NotesEditor'))

/** The note whose body takes the caret when it opens next (a note written from the search field, notes-home D3). */
let bodyFocus: string | null = null
resettable('noteBodyFocus', () => { bodyFocus = null })
export function focusBodyOnOpen(id: string): void {
  bodyFocus = id
}
function takeBodyFocus(id: string): boolean {
  if (bodyFocus !== id) return false
  bodyFocus = null
  return true
}

/** Debounce of the title's timed save, as the note editor's (NotesEditor SAVE_MS). */
const TITLE_SAVE_MS = 400

/** Whether the signed-in account may change this note (not a viewer of its shared project). */
export function useNoteEditable(note: Pick<Note, 'project_id'> | null | undefined): boolean {
  const memberships = useMembershipMap()
  return !!note && canEditTasks(roleOf(note.project_id, memberships))
}

function TitleInput({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const [value, setValue] = useState(note.title)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  // Another device's title arrives while the field is not being edited.
  useResetOnChange([note.id, note.title], () => { if (!focused.current || !dirty.current) setValue(note.title) })
  const save = (push: 'now' | 'deferred') => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return void (push === 'now' && pushPendingNotes())
    dirty.current = false
    act(mutate('note', note.id, { title: value.trim() }, { push }))
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => saveRef.current('now'), [note.id])
  if (readOnly) return <h2 className="user-text text-h3 text-strong" data-note-title-field>{note.title.trim() || t('Untitled note')}</h2>
  return (
    <input className="user-text w-full min-w-0 rounded-control bg-transparent px-1 py-1 text-h3 font-semibold text-strong placeholder:text-faint focus-visible:outline-2 focus-visible:outline-focus"
      aria-label={t('Title')} placeholder={t('Untitled note')} value={value} maxLength={500} data-note-title-field
      onFocus={() => { focused.current = true }}
      onChange={(e) => {
        setValue(e.target.value)
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => saveRef.current('deferred'), TITLE_SAVE_MS)
      }}
      onKeyDown={(e) => {
        // Enter moves on to the note, as a title does.
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.closest('[data-note-form]')?.querySelector('.notes-editor') as HTMLElement | null)?.focus() }
      }}
      onBlur={() => { focused.current = false; save('now') }} />
  )
}

function LabelsField({ note, readOnly, labels }: { note: Note; readOnly: boolean; labels: readonly Label[] }) {
  const byId = new Map(labels.map((l) => [l.id, l]))
  const chosen = (note.labels ?? []).map((id) => byId.get(id)).filter((l): l is Label => !!l && !l.deleted_at)
  return (
    <div className="space-y-1" data-note-labels>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chosen.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} onRemove={readOnly ? undefined : () => act(toggleNoteLabel(note.id, l.id))} />)}
        </div>
      )}
      {!readOnly && (
        <Combobox<Label> label={t('Labels')} placeholder={t('Add label…')} emptyText={t('No labels yet. Type a name and press Enter.')}
          source={labels.filter((l) => !l.deleted_at)} getKey={(l) => l.id} getLabel={(l) => l.name} multiple selected={note.labels ?? []} rankContext="label"
          renderLeading={(l) => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />}
          onPick={(l) => act(toggleNoteLabel(note.id, l.id))}
          onCreate={(name) => act((async () => toggleNoteLabel(note.id, await createLabel({ name })))())} />
      )}
    </div>
  )
}

/** The note's fields: title, editor, Project, Labels. */
export function NoteForm({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const projects = useProjects()
  const labels = useLabels()
  const project = projects.find((p) => p.id === note.project_id)
  const [focusBody] = useState(() => takeBodyFocus(note.id))
  return (
    <div className="space-y-4" data-note-form={note.id}>
      <TitleInput note={note} readOnly={readOnly} />
      <Suspense fallback={<div className="notes-host" aria-busy="true"><div className="notes-editor">{note.description ? <Markdown source={note.description} /> : <p className="text-faint">{t('Add notes…')}</p>}</div></div>}>
        <NotesEditor key={note.id} note={{ ...note, entity: 'note' }} readOnly={readOnly} autoFocus={focusBody} outline="auto" />
      </Suspense>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
        <span className="pt-2 text-meta text-muted">{t('Project')}</span>
        {readOnly
          ? <span className="pt-2 text-body">{project?.name ?? t('No project')}</span>
          : <ProjectPickerField label={t('Project')} projects={projects} value={note.project_id ?? null} inbox={false} noneLabel={t('No project')} rankContext="note.project"
              onChange={(id) => act(setNoteProject(note.id, id).then((next) => { if (next !== note.id) navigate({ view: 'notes', id: next }, { replace: true }) }))} />}
        <span className="pt-2 text-meta text-muted">{t('Labels')}</span>
        <LabelsField note={note} readOnly={readOnly} labels={labels} />
      </div>
      <LinkedRefs kind="note" id={note.id} />
    </div>
  )
}

/** Back to the list, which closes the panel or leaves the phone's note page. */
const toList = () => navigate({ view: 'notes' })

/** The note's menu: Pin or Unpin always (a pin is personal), the conversions when the note may change. */
function NoteActions({ note, editable }: { note: Note; editable: boolean }) {
  const pinned = isFavourite(useUserPrefsRow(), 'note', note.id)
  const connected = useConnected('note', note.id)
  return (
    <NoteMenu pinned={pinned} onPin={() => act(setFavourite('note', note.id, !pinned))}
      onConnections={connected ? () => openConnections('note', note.id) : undefined}
      onTurnIntoTask={editable ? () => void turnNoteIntoTask(note.id).then((id) => { if (id) toList() }) : undefined}
      onDelete={editable ? () => { toList(); void deleteNote(note.id) } : undefined} />
  )
}

/**
 * While the note is docked, the root says so and carries the width this device chose
 * for it (note-pane-width D1): `:root[data-note-split]` sizes the slot from it, apart
 * from the docked task's width. Before paint, so the pane opens at its width.
 */
function useNoteSplit() {
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-note-split', '')
    applyPanelWidth(NOTE_PANEL_WIDTH)
    return () => root.removeAttribute('data-note-split')
  }, [])
}

/**
 * The docked panel on a computer: a non-task occupant of the shell's panel slot, resized
 * by its left edge like the docked task (D1). The text keeps a readable column, centred
 * when the pane is wide (D2).
 */
export function NotePanel({ id }: { id: string }) {
  const note = useNoteRow(id)
  const editable = useNoteEditable(note)
  useNoteSplit()
  // A note that is gone (deleted here or on another device) leaves the slot.
  useEffect(() => { if (note === null || note?.deleted_at) toList() }, [note])
  if (!note || note.deleted_at) return null
  return (
    <PanelFrame title={t('Note')} testId="note" onClose={toList} actions={<NoteActions note={note} editable={editable} />}
      edge={<PanelResizeHandle store={NOTE_PANEL_WIDTH} label={t('Resize the note')} />}>
      <div data-outline-room>
        <div className="note-column px-2 pt-2 pb-12 lg:px-4" data-note-column>
          <NoteForm note={note} readOnly={!editable} />
        </div>
      </div>
    </PanelFrame>
  )
}

/** The note as a page on a phone. */
export function NotePage({ id }: { id: string }) {
  const note = useNoteRow(id)
  const editable = useNoteEditable(note)
  if (note === undefined) return null
  if (!note || note.deleted_at) {
    return (
      <PageBody width="form">
        <PageHeader title={t('Note')} back={{ label: t('Notes'), onClick: toList }} />
        <p className="py-6 text-body text-muted">{t('This note no longer exists.')}</p>
      </PageBody>
    )
  }
  return (
    <PageBody width="form" data-note-page={id}>
      <PageHeader title={note.title.trim() || t('Untitled note')} back={{ label: t('Notes'), onClick: toList }} menu={<NoteActions note={note} editable={editable} />} />
      <NoteForm note={note} readOnly={!editable} />
    </PageBody>
  )
}
