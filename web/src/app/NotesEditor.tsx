// The rich-text notes editor (OpenSpec changes `collaborative-rich-text` and
// `editor-everywhere`). This module is loaded with React.lazy from TaskDetail and
// ProjectNote, so ProseMirror and Yjs are a separate chunk fetched when a note is
// first opened.
import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import { closeHistory, undoDepth } from 'prosemirror-history'
import type { Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import * as Y from 'yjs'
import { noteParent, queueFiles, isImage } from '../lib/attachments'
import { byteLength, MAX_PLAINTEXT_BYTES } from '../lib/crypto'
import { DocTooLargeError, MAX_DOC_CHARS_ENCRYPTED, MAX_TEXT_VALUE } from '../lib/docfields'
import { encryptionSnapshot } from '../lib/e2ee'
import { checkLinesIn, linesToLinks, mentionIds, sameIds } from '../lib/editorNotes'
import { planLineTasks, type NoteTaskHome } from '../lib/noteTasks'
import { foldNote, mutateMany, saveNote, type Change, type PushTiming } from '../lib/ops'
import { activeBody, activeBodyName, decodeDoc, docBytes, encodeDoc, MAX_DOC_CHARS, renderMarkdown, toModel, WARN_DOC_CHARS } from '../lib/richtext'
import { applyBody, createState, insertBlocks, linkSpaceKey, markdownSlice, pmToModel, remoteKey, schema, writeBody, type EditorHooks } from '../lib/richtextEditor'
import { pushPendingNotes } from '../lib/sync'
import { useMe } from '../lib/timeEntries'
import type { Suggest } from '../lib/editorSuggest'
import { suggestKey } from '../lib/editorSuggest'
import { linkCandidates, type LinkCandidate } from '../lib/linkPicker'
import { useMembershipMap, useProjects } from '../lib/localData'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { hrefOf } from '../lib/noteLinks'
import { planNote } from '../lib/noteOps'
import { useNoteRows } from '../lib/noteRows'
import type { Clock } from '../lib/types'
import { EditorToolbar, openCellMenu, useEditorChrome } from './EditorChrome'
import { FormattingToggle, useFormattingToggle } from './FormattingToggle'
import type { CommandEnv, LinkPickerEnv } from './editorCommands'
import { imageViews } from './editorImage'
import { refViews } from './editorRef'
import { LinkDialog } from './LinkDialog'
import { Markdown } from './Markdown'
import { useMentionTargets } from './useMentionTargets'
import { filesFrom } from './task-detail/AttachmentsRow'
import type { OutlinePlace } from './editor/NoteOutline'
import { headingStops, useNoteOutline } from './editor/useNoteOutline'
import { useSourceMode } from './editor/useSourceMode'
import { IconButton, useMediaQuery } from '../ui'
import type { ReactNode } from 'react'
import { t } from '../lib/i18n'
import { keysOf } from '../lib/shortcuts'
import { messageOf } from '../lib/errorText'

/**
 * Debounce between the last keystroke and saving the note on the device (design D3).
 * The timed save is pushed after the note's pause (notes-save-cadence D2); leaving
 * the editor pushes at once.
 */
const SAVE_MS = 400
const NO_TARGETS: ReturnType<typeof useMentionTargets> = []
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

/**
 * Whose note the editor edits: a task's, a project's (OpenSpec change project-notes,
 * D3) or a standalone note's (notes-overview D7: no mentions or Make subtask; images since note-attachments).
 */
export interface NoteTarget {
  entity: 'task' | 'project' | 'note'
  id: string
  notes_doc?: string
  description?: string
  /** A task's project (members to mention) and the members its note mentions (editor-everywhere D7). */
  project_id?: string | null
  note_mentions?: string[]
  /** A standalone note's workspace: Make tasks puts tasks without a project in its Inbox (note-checklist-tasks). */
  workspace_id?: string | null
  _clock?: Clock
}

/** The editor behind a notes element (tests and scripts drive it like a person would). */
const views = new WeakMap<Element, EditorView>()
export function noteViewOf(el: Element): EditorView | undefined {
  return views.get(el)
}

/**
 * Make subtask in a task's note, Make tasks in a project or standalone note (design D6,
 * note-checklist-tasks D1 to D3): each check-list line of the selection becomes a link
 * to its new task; `save` writes the tasks and the note in one batch and remembers the
 * history depth for Undo. More than 50 lines: the first 50, and the editor says so.
 */
function makeTasksCommand(o: { enabled: boolean; home: () => NoteTaskHome; notify: (m: string) => void; save: (changes: Change[], ids: string[], depth: number) => Promise<void> }): Command {
  return (state, dispatch, v) => {
    const { lines, more } = checkLinesIn(state)
    if (!o.enabled || lines.length === 0) return false
    if (!dispatch || !v) return true
    void (async () => {
      const planned = await planLineTasks(lines, o.home())
      // The lines as they are now (a remote merge may have moved them meanwhile).
      const now = checkLinesIn(v.state).lines
      if (v.isDestroyed || now.length !== lines.length || now.some((l, i) => l.title !== lines[i].title)) return
      v.dispatch(closeHistory(linesToLinks(v.state, now, planned.map((p) => p.id), planned.map((p) => String(p.change.patch.title)))))
      await o.save(planned.map((p) => p.change), planned.map((p) => p.id), undoDepth(v.state))
      if (more) o.notify(t('{n, plural, one {# line was left: at most 50 at once.} other {# lines were left: at most 50 at once.}}', { n: more }))
    })()
    return true
  }
}

/** A link node in place of the typed `[[text`, then a space (note-links D3). */
function insertLink(view: EditorView, s: Suggest, kind: LinkCandidate['kind'], id: string, title: string) {
  const node = schema.nodes.ref.create({ href: hrefOf(kind, id), label: title })
  // The space after the link: punctuation typed next takes its place (linkSpacePlugin).
  return view.state.tr.replaceWith(s.from, s.to, [node, schema.text(' ')]).setMeta(linkSpaceKey, s.from + node.nodeSize).scrollIntoView()
}

/**
 * The `[[` picker over the current workspace's rows (D3): only the project's items
 * in a note of a shared project; New note creates the note and the link in one
 * batch (`save`), which one Undo of the editor reverts.
 */
function useLinkPicker(o: { self: string; projectId: string | null; enabled: boolean; save: (change: Change, id: string, depth: number) => Promise<void> }): LinkPickerEnv | undefined {
  const tasks = useLiveTasks() ?? NO_TASKS
  const projects = useProjects()
  const notes = useNoteRows()
  const memberships = useMembershipMap()
  const scope = o.projectId && memberships.has(o.projectId) ? o.projectId : null
  if (!o.enabled) return undefined
  return {
    candidates: (query) => linkCandidates(query, { tasks, projects, notes, scope, self: o.self, untitled: t('Untitled note') }),
    insert: (view, s, item) => {
      view.dispatch(insertLink(view, s, item.kind, item.id, item.title))
      view.focus()
    },
    create: (view, _s, title) => {
      void (async () => {
        const change = await planNote({ title, project_id: o.projectId })
        // The typed text as it is now (a remote merge may have moved it meanwhile).
        const s = suggestKey.getState(view.state)?.active
        if (view.isDestroyed || !s || s.kind !== 'link') return
        view.dispatch(closeHistory(insertLink(view, s, 'note', change.entityId, title.trim())))
        view.focus()
        await o.save(change, change.entityId, undoDepth(view.state))
      })()
    },
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

/** A ref that always holds the latest value (read by callbacks made once). */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/** Calls `save` when the page is hidden or unloaded; returns the cleanup. */
function onLeave(save: () => void): () => void {
  const onHide = () => { if (document.visibilityState === 'hidden') save() }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', save)
  window.addEventListener('beforeunload', save)
  return () => {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', save)
    window.removeEventListener('beforeunload', save)
  }
}

/** A document this device cannot read: its plain text instead. */
function UnreadableNote({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      <p role="note" className="text-meta text-warning">
        {t('This note\'s formatting could not be read on this device; its text is shown instead.')}
      </p>
      <div className="rounded-control border border-default p-3 text-body">
        <Markdown source={text} />
      </div>
    </div>
  )
}

export default function NotesEditor({ note, readOnly, autoFocus = false, onEscape, outline: outlinePlace = 'menu' }: {
  note: NoteTarget
  readOnly: boolean
  /** The outline (note-outline D2): 'auto' for a column when the `[data-outline-room]` around the note is wide; else the menu. */
  outline?: OutlinePlace
  /** Focus the editor when it mounts (the project note opens in place). */
  autoFocus?: boolean
  /** Called on Escape after the editor lost focus (the project note returns to its rendered view). */
  onEscape?: () => void
}) {
  const task = note
  const host = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
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
  const imageParent = imageParentOf(entity, taskId)
  // People, then the workspace's groups (group-mentions D4); a standalone note has nobody to notify.
  const targets = useMentionTargets(isTask ? note.project_id : null)
  const members = entity === 'note' ? NO_TARGETS : targets
  const me = useMe()
  const picker = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // The Formatting toggle on a computer (notes-toolbar-desktop D1-D4); the row needs the view.
  const formatting = useFormattingToggle('notes', !readOnly)
  const rowId = `${useId()}-formatting`
  const [, setMounted] = useState(0)
  const [mentioned, projectId, workspace] = [useLatest(note.note_mentions), useLatest(note.project_id ?? null), useLatest(note.workspace_id ?? null)]
  // The subtask Make subtask created (or the note New note created), undone with the note's next undo of that step.
  const pendingSubtask = useRef<{ entity: 'task' | 'note'; ids: string[]; depth: number } | null>(null)
  // One batch: the new subtasks, tasks or note and the note that links to them.
  const saveCreated = (kind: 'task' | 'note') => async (changes: Change[], ids: string[], depth: number) => {
    pendingSubtask.current = { entity: kind, ids, depth }
    if (timer.current) clearTimeout(timer.current)
    dirty.current = false
    await mutateMany([...changes, { entity, entityId: taskId, patch: notePatch() }])
  }
  const makeSubtask = makeTasksCommand({ enabled: !readOnly, notify: (m) => chrome.notify(m), save: saveCreated('task'), home: () => (isTask ? { subtasksOf: taskId, projectId: projectId.current } : { projectId: entity === 'project' ? taskId : projectId.current, workspaceId: workspace.current }) })
  const linkTo = useLinkPicker({ self: `${entity}:${taskId}`, projectId: entity === 'project' ? taskId : note.project_id ?? null, enabled: !readOnly, save: (change, id, depth) => saveCreated('note')([change], [id], depth) })
  const source = useSourceMode(view, readOnly, () => onEscapeRef.current?.())
  const coarse = useMediaQuery('(pointer: coarse)')
  const env: CommandEnv = {
    notes: isTask, members: members.length > 0, askLink, notify: (m) => chrome.notify(m),
    pickImage: imageParent && !readOnly ? () => picker.current?.click() : undefined, makeSubtask: readOnly ? undefined : makeSubtask, linkTo, source: () => sourceRef.current.toggle(),
  }
  const chrome = useEditorChrome({ id: `${useId()}-notes`, env, members, me })
  const envRef = useLatest(env)
  const outline = useNoteOutline({ view, frame, readOnly, place: outlinePlace })
  const outlineRef = useLatest(outline)
  const sourceRef = useLatest(source)

  // Lazy upgrade of a legacy note and folding of plain-text writes (REST, older
  // clients) happen when the note is opened, and again whenever its text changes
  // without a matching document (design D2).
  const descClock = task._clock?.description
  const docClock = task._clock?.notes_doc
  useEffect(() => {
    if (readOnly) return
    void foldNote(entity, taskId)
  }, [entity, taskId, readOnly, descClock?.ts, descClock?.device, docClock?.ts, docClock?.device])

  const onEscapeRef = useLatest(onEscape)
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
  // 'now' when the editor is left (blur, hide, unload, unmount): also pushes an earlier timed save.
  const flush = useRef<(push: PushTiming) => void>(() => {})
  flush.current = (push) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current || !ydoc.current) return void (push === 'now' && pushPendingNotes())
    dirty.current = false
    saveNote(entity, taskId, notePatch(), { push }).then(
      () => setError(null),
      (err) => setError(err instanceof DocTooLargeError ? err.message : t('Could not save the note: {reason}', { reason: messageOf(err) })),
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
        void mutateMany(p.ids.map((id) => ({ entity: p.entity, entityId: id, patch: { deleted_at: Date.now() } })))
      },
      outline: () => outlineRef.current.open(),
      source: () => { sourceRef.current.toggle(); return true },
    }
    const v = new EditorView(host.current as HTMLDivElement, {
      state: createState(toModel(activeBody(doc)), hooks),
      editable: () => !readOnly,
      // A read-only note's headings take focus from the outline (note-outline D3).
      decorations: (state) => (readOnly ? headingStops(state.doc) : null),
      attributes: { 'aria-label': t('Notes'), 'aria-multiline': 'true', role: 'textbox', class: 'notes-editor' },
      nodeViews: { ...imageViews(imageParent), ...refViews },
      clipboardTextParser: (text) => markdownSlice(text),
      ...(imageParent && !readOnly ? imageHandlers(imageParent) : {}),
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
          flush.current('now')
          setEditing(false)
          return false
        },
      },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr)
        v.updateState(next)
        // Local and remote edits alike (D1).
        if (tr.docChanged) outlineRef.current.onState(next)
        if (!tr.docChanged || tr.getMeta(remoteKey) || !ydoc.current) return
        const d = ydoc.current
        d.transact(() => writeBody(activeBody(d), next.doc), LOCAL)
        size.current = usage(d, next.doc)
        setSizeNote(size.current >= WARN_DOC_CHARS ? t('This note is {percent}% of the size limit.', { percent: Math.round((size.current / MAX_DOC_CHARS) * 100) }) : null)
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => flush.current('deferred'), SAVE_MS)
      },
    })
    view.current = v
    views.set(v.dom, v)
    setMounted((n) => n + 1)
    outlineRef.current.onState(v.state)
    size.current = usage(doc, v.state.doc)
    if (autoFocus && !readOnly) v.focus()
    const unwatch = onLeave(() => flush.current('now'))
    return () => {
      sourceRef.current.leave() // eslint-disable-line react-hooks/exhaustive-deps -- the source mode as it is when the note closes
      flush.current('now')
      unwatch()
      v.destroy()
      view.current = null
      ydoc.current = null
    }
    // The editor is created per task; later values arrive through the merge effect below.
  }, [taskId, unreadable]) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per task; later notes_doc/readOnly values arrive through the merge effect

  useEffect(() => {
    view.current?.setProps({ editable: () => !readOnly, decorations: (state) => (readOnly ? headingStops(state.doc) : null) })
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
    // In the source mode, what was typed goes into the document first, so both edits merge (note-markdown-source D3).
    sourceRef.current.beforeRemote()
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
    sourceRef.current.afterRemote()
    size.current = usage(d, v.state.doc)
  }, [task.notes_doc, unreadable, sourceRef])

  if (unreadable) return <UnreadableNote text={task.description ?? ''} />
  return (
    // The corner's buttons come before the text in the Tab order, so Shift+Tab from the note reaches them (D2).
    <NotesCorner frame={frame} formatting={formatting.offered || undefined} outlinePlace={outline.place} source={source.on} buttons={[
        outline.place === 'menu' && outline.element, !coarse && <SourceButton key="source" on={source.on} onToggle={source.toggle} />,
        formatting.offered && !source.on && <FormattingToggle key="formatting" className="ui-reveal" pressed={formatting.pressed} onToggle={formatting.set} controls={rowId} data-notes-formatting="" />,
      ]}>
      {outline.place === 'column' && !source.on && outline.element}
      {!readOnly && !source.on && <EditorToolbar id={rowId} view={view.current} env={env} visible={editing || menuOpen} onMenu={setMenuOpen} always={formatting.open} />}
      <div ref={host} className="notes-host" data-notes-editing={editing || undefined} hidden={source.on} />
      {source.element}
      {chrome.overlays}
      {imageParent && !readOnly && <ImagePicker picker={picker} onFiles={(files) => { if (view.current) void embedImages(view.current, imageParent, files) }} />}
      <NoteStatus size={sizeNote} error={error} />
      {linkAsk && <LinkAsk ask={linkAsk} onDone={() => setLinkAsk(null)} />}
    </NotesCorner>
  )
}

/**
 * The note's frame with its top corner (notes-toolbar-desktop D2, note-outline D2,
 * note-markdown-source D4): the Outline button, Markdown and Formatting in one row at
 * the top end, over end padding of the first block so text never runs under them.
 */
function NotesCorner({ frame, formatting, outlinePlace, source, buttons, children }: {
  frame: RefObject<HTMLDivElement | null>; formatting?: boolean; outlinePlace?: 'column' | 'menu'; source: boolean; buttons: ReactNode[]; children: ReactNode
}) {
  const shown = buttons.filter(Boolean)
  return (
    <div ref={frame} className="notes-frame space-y-1" data-formatting={formatting} data-outline={outlinePlace} data-source={source || undefined}
      data-corner={shown.length || undefined} style={shown.length ? { '--notes-corner': `${shown.length * 2.25}rem` } as React.CSSProperties : undefined}>
      {shown.length > 0 && <div className="notes-corner">{shown}</div>}
      {children}
    </div>
  )
}

/** The size warning and a failed save under the note. */
function NoteStatus({ size, error }: { size: string | null; error: string | null }) {
  return (
    <>
      {size && <p role="status" className="text-meta text-warning">{size}</p>}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
    </>
  )
}

/** The link dialog of Mod-k, answering the editor's question. */
function LinkAsk({ ask, onDone }: { ask: { current: string; answer: (href: string | null) => void }; onDone: () => void }) {
  return <LinkDialog current={ask.current} onSubmit={(href) => { ask.answer(href); onDone() }} onCancel={() => { ask.answer(null); onDone() }} />
}

/** Markdown beside the Formatting toggle on a fine pointer (note-markdown-source D4): the source, or back to rich text. */
function SourceButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return <IconButton icon="code" size="sm" label={t('Markdown')} aria-pressed={on} shortcut={keysOf('editor.source')} className="ui-reveal source-toggle" onClick={onToggle} data-notes-source-toggle="" />
}

/** Images belong to the task or the standalone note (note-attachments); a project's notes have none. */
function imageParentOf(entity: 'task' | 'project' | 'note', id: string): string | null {
  return entity === 'task' ? id : entity === 'note' ? noteParent(id) : null
}
