// The rich-text notes editor (OpenSpec changes `collaborative-rich-text` and
// `editor-everywhere`). This module is loaded with React.lazy from TaskDetail and
// ProjectNote, so ProseMirror and Yjs are a separate chunk fetched when a note is
// first opened.
import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import { closeHistory, undoDepth } from 'prosemirror-history'
import type { Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { queueFiles, isImage } from '../lib/attachments'
import { byteLength, MAX_PLAINTEXT_BYTES } from '../lib/crypto'
import { DocTooLargeError, MAX_DOC_CHARS_ENCRYPTED, MAX_TEXT_VALUE } from '../lib/docfields'
import { encryptionSnapshot } from '../lib/e2ee'
import { checkLineAt, mentionIds, sameIds, subtaskLine } from '../lib/editorNotes'
import { foldNote, mutate, mutateMany, planTask, type Change } from '../lib/ops'
import { activeBody, activeBodyName, decodeDoc, docBytes, encodeDoc, MAX_DOC_CHARS, renderMarkdown, toModel, WARN_DOC_CHARS } from '../lib/richtext'
import { applyBody, createState, insertBlocks, markdownSlice, pmToModel, remoteKey, schema, writeBody, type EditorHooks } from '../lib/richtextEditor'
import { useMe } from '../lib/timeEntries'
import type { Clock } from '../lib/types'
import { EditorToolbar, openCellMenu, useEditorChrome } from './EditorChrome'
import type { CommandEnv } from './editorCommands'
import { imageViews } from './editorImage'
import { LinkDialog } from './LinkDialog'
import { Markdown } from './Markdown'
import { useMentionTargets } from './useMentionTargets'
import { filesFrom } from './task-detail/AttachmentsRow'
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
  /** A task's project (members to mention) and the members its note mentions (editor-everywhere D7). */
  project_id?: string | null
  note_mentions?: string[]
  _clock?: Clock
}

/** The editor behind a notes element (tests and scripts drive it like a person would). */
const views = new WeakMap<Element, EditorView>()
export function noteViewOf(el: Element): EditorView | undefined {
  return views.get(el)
}

/**
 * Make subtask (design D6): the check-list line becomes a link to a new subtask;
 * `save` writes both in one batch and remembers the history depth for Undo.
 */
function makeSubtaskCommand(o: { enabled: boolean; taskId: string; projectId: () => string | null; save: (change: Change, id: string, depth: number) => Promise<void> }): Command {
  return (state, dispatch, v) => {
    const line = checkLineAt(state)
    if (!o.enabled || !line) return false
    if (!dispatch || !v) return true
    void (async () => {
      const { id, change } = await planTask({ title: line.title, parent_id: o.taskId, project_id: o.projectId() })
      if (line.checked) change.patch.completed_at = Date.now()
      const tr = subtaskLine(v.state, id)
      if (!tr || v.isDestroyed) return
      v.dispatch(closeHistory(tr))
      await o.save(change, id, undoDepth(v.state))
    })()
    return true
  }
}

/** The hidden file field behind the Image command. */
function ImagePicker({ picker, onFiles }: { picker: RefObject<HTMLInputElement | null>; onFiles: (files: File[]) => void }) {
  return (
    <input ref={picker} type="file" accept="image/*" multiple hidden aria-label={t('Choose an image for the note')}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        onFiles(files)
      }} />
  )
}

/** A pasted or dropped image is attached to the task and shown in the note. */
function imageHandlers(taskId: string) {
  const take = (view: EditorView, data: DataTransfer | null) => {
    const files = filesFrom(data).filter((f) => isImage(f.type))
    if (files.length === 0) return false
    void embedImages(view, taskId, files)
    return true
  }
  return {
    handlePaste: (view: EditorView, event: ClipboardEvent) => take(view, event.clipboardData),
    handleDrop: (view: EditorView, event: DragEvent) => take(view, event.dataTransfer),
  }
}

/** Attach image files to the task and embed them at the selection, as one change (design D5). */
async function embedImages(view: EditorView, taskId: string, files: File[]): Promise<void> {
  const images = files.filter((f) => isImage(f.type))
  if (images.length === 0) return
  const ids = await queueFiles(taskId, images)
  if (view.isDestroyed) return
  const nodes = ids.map((id, i) => schema.nodes.image.create({ id, alt: images[i].name.replace(/\.[a-z0-9]+$/i, '') }))
  view.dispatch(insertBlocks(view.state, nodes).scrollIntoView())
  view.focus()
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
  // Mod-k asks for the address in the app's link dialog; the editor applies the answer.
  const [linkAsk, setLinkAsk] = useState<{ current: string; answer: (href: string | null) => void } | null>(null)
  const askLink = (current: string) => new Promise<string | null>((answer) => setLinkAsk({ current, answer }))
  const isTask = entity === 'task'
  // People, then the workspace's groups (group-mentions D4).
  const members = useMentionTargets(isTask ? note.project_id : null)
  const me = useMe()
  const picker = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const mentioned = useRef(note.note_mentions)
  mentioned.current = note.note_mentions
  const projectId = useRef(note.project_id ?? null)
  projectId.current = note.project_id ?? null
  // The subtask Make subtask created, undone with the note's next undo of that step.
  const pendingSubtask = useRef<{ id: string; depth: number } | null>(null)
  const makeSubtask = makeSubtaskCommand({
    enabled: isTask && !readOnly, taskId, projectId: () => projectId.current,
    // One batch: the subtask and the note that links to it.
    save: async (change, id, depth) => {
      pendingSubtask.current = { id, depth }
      if (timer.current) clearTimeout(timer.current)
      dirty.current = false
      await mutateMany([change, { entity, entityId: taskId, patch: notePatch() }])
    },
  })
  const env: CommandEnv = {
    notes: isTask, members: members.length > 0, askLink, notify: (m) => chrome.notify(m),
    pickImage: isTask && !readOnly ? () => picker.current?.click() : undefined, makeSubtask,
  }
  const chrome = useEditorChrome({ id: `${useId()}-notes`, env, members, me })
  const envRef = useRef(env)
  envRef.current = env

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
  // The note, and for a task the members it mentions, in one mutation (design D7).
  const notePatch = (): Record<string, unknown> => {
    const d = ydoc.current as Y.Doc
    const patch: Record<string, unknown> = { notes_doc: encodeDoc(d) }
    if (entity === 'task') {
      const ids = mentionIds(toModel(activeBody(d)))
      if (!sameIds(mentioned.current, ids)) patch.note_mentions = ids
    }
    return patch
  }
  const flush = useRef<() => void>(() => {})
  flush.current = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current || !ydoc.current) return
    dirty.current = false
    mutate(entity, taskId, notePatch()).then(
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
      askLink: (current) => envRef.current.askLink(current),
      onEscape: () => { view.current?.dom.blur(); onEscapeRef.current?.() },
      size: () => size.current,
      placeholder: readOnly ? '' : t('Add notes…'),
      suggest: chrome.bridge,
      notify: (m) => envRef.current.notify(m),
      makeSubtask: (s, d, pv) => envRef.current.makeSubtask?.(s, d, pv) ?? false,
      onUndo: (depthBefore) => {
        const p = pendingSubtask.current
        if (!p || depthBefore !== p.depth) return
        pendingSubtask.current = null
        void mutate('task', p.id, { deleted_at: Date.now() })
      },
    }
    const v = new EditorView(host.current as HTMLDivElement, {
      state: createState(toModel(activeBody(doc)), hooks),
      editable: () => !readOnly,
      attributes: { 'aria-label': t('Notes'), 'aria-multiline': 'true', role: 'textbox', class: 'notes-editor' },
      nodeViews: imageViews(entity === 'task' ? taskId : null),
      clipboardTextParser: (text) => markdownSlice(text),
      ...(entity === 'task' && !readOnly ? imageHandlers(taskId) : {}),
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
        contextmenu: (pv, event) => !readOnly && openCellMenu(pv, event, chrome.openTableMenu),
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
    views.set(v.dom, v)
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
  }, [taskId, unreadable]) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per task; later notes_doc/readOnly values arrive through the merge effect

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
      {!readOnly && <EditorToolbar view={view.current} env={env} visible={editing || menuOpen} onMenu={setMenuOpen} />}
      <div ref={host} className="notes-host" data-notes-editing={editing || undefined} />
      {chrome.overlays}
      {isTask && !readOnly && <ImagePicker picker={picker} onFiles={(files) => { if (view.current) void embedImages(view.current, taskId, files) }} />}
      {sizeNote && <p role="status" className="text-meta text-warning">{sizeNote}</p>}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      {linkAsk && (
        <LinkDialog current={linkAsk.current}
          onSubmit={(href) => { linkAsk.answer(href); setLinkAsk(null) }}
          onCancel={() => { linkAsk.answer(null); setLinkAsk(null) }} />
      )}
    </div>
  )
}
