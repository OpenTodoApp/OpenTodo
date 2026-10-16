// The rich-text notes editor (OpenSpec change `collaborative-rich-text`). This
// module is loaded with React.lazy from TaskDetail and ProjectNote, so ProseMirror
// and Yjs are a separate chunk fetched when a note is first opened.
import { useEffect, useRef, useState } from 'react'
import { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { byteLength, MAX_PLAINTEXT_BYTES } from '../lib/crypto'
import { DocTooLargeError, MAX_DOC_CHARS_ENCRYPTED, MAX_TEXT_VALUE } from '../lib/docfields'
import { encryptionSnapshot } from '../lib/e2ee'
import { foldNote, mutate } from '../lib/ops'
import { activeBody, activeBodyName, decodeDoc, docBytes, encodeDoc, MAX_DOC_CHARS, renderMarkdown, toModel, WARN_DOC_CHARS } from '../lib/richtext'
import { applyBody, createState, markdownSlice, pmToModel, remoteKey, writeBody, type EditorHooks } from '../lib/richtextEditor'
import type { Clock } from '../lib/types'
import { Markdown } from './Markdown'
import { t } from '../lib/i18n'

/** Debounce between the last keystroke and saving the note (design D3). */
const SAVE_MS = 400
const LOCAL = 'local'
const REMOTE = 'remote'

/**
 * How full the note is, scaled to MAX_DOC_CHARS (the unit the editor's input cap
 * uses): the larger of the encoded document against its cap and the Markdown
 * projection against the cap of an ordinary text value. Both are lower for an
 * account with end-to-end encryption.
 */
function usage(doc: Y.Doc, pm: import('prosemirror-model').Node): number {
  const encrypted = encryptionSnapshot().enabled
  const docCap = encrypted ? MAX_DOC_CHARS_ENCRYPTED : MAX_DOC_CHARS
  const textCap = encrypted ? MAX_PLAINTEXT_BYTES : MAX_TEXT_VALUE
  const text = byteLength(JSON.stringify(renderMarkdown(pmToModel(pm))))
  return Math.ceil(Math.max(encodeDoc(doc).length / docCap, text / textCap) * MAX_DOC_CHARS)
}

/** Whose note the editor edits: a task's or a project's (OpenSpec change project-notes, D3). */
export interface NoteTarget {
  entity: 'task' | 'project'
  id: string
  notes_doc?: string
  description?: string
  _clock?: Clock
}

export default function NotesEditor({ note, readOnly, autoFocus = false, onEscape }: {
  note: NoteTarget
  readOnly: boolean
  /** Focus the editor when it mounts (the project note opens in place). */
  autoFocus?: boolean
  /** Called on Escape after the editor lost focus (the project note returns to its rendered view). */
  onEscape?: () => void
}) {
  const task = note
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const ydoc = useRef<Y.Doc | null>(null)
  const bodyName = useRef('')
  const size = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const taskId = note.id
  const entity = note.entity
  const [unreadable, setUnreadable] = useState(false)
  const [sizeNote, setSizeNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // While focused the notes read as an editor; at rest they are a quiet block of
  // text, or one placeholder line when empty (ux-overhaul, "Task panel layout").
  const [editing, setEditing] = useState(false)

  // Lazy upgrade of a legacy note and folding of plain-text writes (REST, older
  // clients) happen when the note is opened, and again whenever its text changes
  // without a matching document (design D2).
  const descClock = task._clock?.description
  const docClock = task._clock?.notes_doc
  useEffect(() => {
    if (readOnly) return
    void foldNote(entity, taskId)
  }, [entity, taskId, readOnly, descClock?.ts, descClock?.device, docClock?.ts, docClock?.device])

  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  const flush = useRef<() => void>(() => {})
  flush.current = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current || !ydoc.current) return
    dirty.current = false
    const value = encodeDoc(ydoc.current)
    mutate(entity, taskId, { notes_doc: value }).then(
      () => setError(null),
      (err) => setError(err instanceof DocTooLargeError ? err.message : t('Could not save the note: {reason}', { reason: err instanceof Error ? err.message : String(err) })),
    )
  }

  // Create the editor once per task.
  useEffect(() => {
    const doc = decodeDoc(task.notes_doc ?? '')
    if (!doc) {
      setUnreadable(true)
      return
    }
    setUnreadable(false)
    ydoc.current = doc
    bodyName.current = activeBodyName(doc)
    size.current = 0
    const hooks: EditorHooks = {
      askLink: (current) => window.prompt(t('Link address (empty to remove)'), current || 'https://'),
      onEscape: () => { view.current?.dom.blur(); onEscapeRef.current?.() },
      size: () => size.current,
      placeholder: readOnly ? '' : t('Add notes…'),
    }
    const v = new EditorView(host.current as HTMLDivElement, {
      state: createState(toModel(activeBody(doc)), hooks),
      editable: () => !readOnly,
      attributes: { 'aria-label': t('Notes'), 'aria-multiline': 'true', role: 'textbox', class: 'notes-editor' },
      clipboardTextParser: (text) => markdownSlice(text),
      handleClickOn: (_view, _pos, node, nodePos, event) => {
        // A click on a check item's box (left of its text) toggles it.
        if (node.type.name !== 'list_item' || node.attrs.checked === null || readOnly) return false
        const li = (event.target as HTMLElement).closest('li')
        if (!li || event.clientX > li.getBoundingClientRect().left + parseFloat(getComputedStyle(li).paddingLeft)) return false
        v.dispatch(v.state.tr.setNodeMarkup(nodePos, undefined, { checked: !node.attrs.checked }))
        return true
      },
      handleDOMEvents: {
        click: (_view, event) => {
          // Ctrl/Cmd-click opens a link (plain clicks place the caret).
          const a = (event.target as HTMLElement).closest('a')
          if (a && (event.metaKey || event.ctrlKey) && a.getAttribute('href')) {
            window.open(a.getAttribute('href') as string, '_blank', 'noopener,noreferrer')
            return true
          }
          return false
        },
        focus: () => {
          setEditing(true)
          return false
        },
        blur: () => {
          flush.current()
          setEditing(false)
          return false
        },
      },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr)
        v.updateState(next)
        if (!tr.docChanged || tr.getMeta(remoteKey) || !ydoc.current) return
        const d = ydoc.current
        d.transact(() => writeBody(activeBody(d), next.doc), LOCAL)
        size.current = usage(d, next.doc)
        setSizeNote(size.current >= WARN_DOC_CHARS ? t('This note is {percent}% of the size limit.', { percent: Math.round((size.current / MAX_DOC_CHARS) * 100) }) : null)
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => flush.current(), SAVE_MS)
      },
    })
    view.current = v
    size.current = usage(doc, v.state.doc)
    if (autoFocus && !readOnly) v.focus()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush.current()
    }
    const onUnload = () => flush.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      flush.current()
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
      v.destroy()
      view.current = null
      ydoc.current = null
    }
    // The editor is created per task; later values arrive through the merge effect below.
  }, [taskId, unreadable]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    view.current?.setProps({ editable: () => !readOnly })
  }, [readOnly])

  // A newer stored document (a remote merge, or our own save coming back) is
  // merged into the editor's document and applied in place (design D6).
  useEffect(() => {
    const d = ydoc.current
    const v = view.current
    if (!d || !v) {
      if (unreadable && decodeDoc(task.notes_doc ?? '')) setUnreadable(false)
      return
    }
    const bytes = docBytes(task.notes_doc ?? '')
    if (!bytes) return
    try {
      Y.applyUpdate(d, bytes, REMOTE)
    } catch {
      return
    }
    const name = activeBodyName(d)
    if (name !== bodyName.current) {
      // A plain-text write was folded in: the note was replaced as a whole.
      bodyName.current = name
    }
    const tr = applyBody(v.state, activeBody(d))
    if (tr) v.dispatch(tr)
    size.current = usage(d, v.state.doc)
  }, [task.notes_doc, unreadable])

  if (unreadable) {
    return (
      <div className="space-y-1">
        <p role="note" className="text-meta text-warning">
          {t('This note\'s formatting could not be read on this device; its text is shown instead.')}
        </p>
        <div className="rounded-control border border-default p-3 text-body">
          <Markdown source={task.description ?? ''} />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div ref={host} className="notes-host" data-notes-editing={editing || undefined} />
      {sizeNote && <p role="status" className="text-meta text-warning">{sizeNote}</p>}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </div>
  )
}
