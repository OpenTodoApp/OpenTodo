// A daily note (OpenSpec change daily-notes): the note of one day, opened at
// /notes/day/<day>. A day with a note shows it as any note, with ‹ and › (and
// [ and ] outside text fields) to the previous and next day. A day without one
// shows its draft, the filled template, and writes the note only at the first
// change (D3): the key typed or the text pasted is applied once the editor opens.
import { useEffect, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { dailyDraft, dailyNoteId, dailyTemplateOf, dailyTitle, ensureDailyNote, shiftDay, type DailyDraft } from '../../lib/dailyNotes'
import { t } from '../../lib/i18n'
import { useUserPrefsRow } from '../../lib/localData'
import { useNoteRow, useNoteRows } from '../../lib/noteRows'
import { useMe } from '../../lib/sharing'
import { IconButton, PageBody, PageHeader } from '../../ui'
import { act } from '../actionError'
import { Markdown } from '../Markdown'
import { PanelFrame } from '../PanelFrame'
import { navigate } from '../router'
import { useShortcutScope } from '../shortcuts'
import { NoteActions, NoteForm, typeOnOpen, useNoteEditable } from './NoteEditor'

const toList = () => navigate({ view: 'notes' })
const goDay = (day: string) => navigate({ view: 'notes', day }, { replace: true })

/** [ and ] outside text fields: the previous and the next day. */
function useDayKeys(day: string) {
  useShortcutScope('view', {
    'notes.day-prev': () => goDay(shiftDay(day, -1)),
    'notes.day-next': () => goDay(shiftDay(day, 1)),
  }, { view: 'notes' })
}

/** ‹ and › in the note's header. */
function DayNav({ day }: { day: string }) {
  return (
    <span className="inline-flex items-center" data-daily-nav>
      <IconButton size="sm" icon="chevron-left" label={t('Previous day')} shortcut="[" onClick={() => goDay(shiftDay(day, -1))} data-daily-prev />
      <IconButton size="sm" icon="chevron-right" label={t('Next day')} shortcut="]" onClick={() => goDay(shiftDay(day, 1))} data-daily-next />
    </span>
  )
}

/** The day's note, or its draft, with the note id once the account is known. */
function useDaily(day: string) {
  const me = useMe()
  const prefs = useUserPrefsRow()
  const notes = useNoteRows()
  const id = me ? dailyNoteId(me, day) : null
  const note = useNoteRow(id)
  const [draft, setDraft] = useState<DailyDraft | null>(null)
  const template = dailyTemplateOf(prefs, notes)
  const key = JSON.stringify(template)
  useEffect(() => {
    let live = true
    void dailyDraft(day, template).then((d) => { if (live) setDraft(d) })
    return () => { live = false }
  }, [day, key]) // eslint-disable-line react-hooks/exhaustive-deps -- the template by its content
  const live = note && !note.deleted_at ? note : null
  return { id, note: live, loading: note === undefined, draft, prefs }
}

/** The draft: the filled template, ready to type; nothing is written until the first change (D3). */
export function DraftBody({ day, draft }: { day: string; draft: DailyDraft }) {
  const prefs = useUserPrefsRow()
  const [busy, setBusy] = useState(false)
  const start = (text: string) => {
    if (busy) return
    setBusy(true)
    act(ensureDailyNote(day, prefs).then((id) => { if (id) typeOnOpen(id, text) }).finally(() => setBusy(false)))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key.length === 1 || e.key === 'Enter') {
      e.preventDefault()
      start(e.key === 'Enter' ? '' : e.key)
    }
  }
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    start(e.clipboardData.getData('text/plain'))
  }
  return (
    <div className="notes-host" data-daily-draft={day}>
      <div className="notes-editor" role="textbox" aria-multiline="true" aria-label={t('Notes')} aria-busy={busy || undefined} tabIndex={0} onKeyDown={onKeyDown} onPaste={onPaste}>
        {draft.description ? <Markdown source={draft.description} /> : <p className="text-faint">{t('Add notes…')}</p>}
      </div>
    </div>
  )
}

function DailyContent({ day }: { day: string }) {
  const { note, loading, draft } = useDaily(day)
  const editable = useNoteEditable(note)
  if (note) return <NoteForm note={note} readOnly={!editable} />
  if (loading || !draft) return null
  return (
    <div className="space-y-4" data-daily-day={day}>
      <h2 className="user-text px-1 py-1 text-h3 font-semibold text-strong">{draft.title}</h2>
      <DraftBody day={day} draft={draft} />
    </div>
  )
}

function DailyActions({ day }: { day: string }) {
  const { note } = useDaily(day)
  const editable = useNoteEditable(note)
  return <><DayNav day={day} />{note && <NoteActions note={note} editable={editable} />}</>
}

/** The daily note in the docked panel on a computer. */
export function DailyNotePanel({ day }: { day: string }) {
  useDayKeys(day)
  return (
    <PanelFrame title={dailyTitle(day)} testId="daily-note" onClose={toList} actions={<DailyActions day={day} />}>
      <div data-outline-room>
        <div className="note-column px-2 pt-2 pb-12 lg:px-4" data-note-column data-daily-note={day}>
          <DailyContent day={day} />
        </div>
      </div>
    </PanelFrame>
  )
}

/** The daily note as a page on a phone. */
export function DailyNotePage({ day }: { day: string }) {
  useDayKeys(day)
  return (
    <PageBody width="form" data-daily-note={day}>
      <PageHeader title={dailyTitle(day)} back={{ label: t('Notes'), onClick: toList }} menu={<DailyActions day={day} />} />
      <DailyContent day={day} />
    </PageBody>
  )
}

