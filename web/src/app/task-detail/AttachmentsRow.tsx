// The Attachments row of the task detail (OpenSpec change attachments, design D7):
// files and links on the task, from local data, with Add by picker, paste and
// drop. The list keeps one item in the tab order: arrows move between items,
// Enter opens, Delete removes, F2 renames.
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import {
  AttachmentError, contentUrl, formatBytes, isImage, openAttachment, parseLink, queueFiles, queueLink, removeAttachment, renameAttachment,
  retryUpload, stateOf, useAttachmentLimits, useUploadProgress, type AttachmentState,
} from '../../lib/attachments'
import { hasAttachmentBlob, useAttachmentBlobs, useTask, useTaskAttachments, type AttachmentBlob } from '../../lib/localData'
import { embeddedIds } from '../../lib/markdown'
import { useDemo } from '../../lib/demo'
import type { Attachment, ProjectRole } from '../../lib/types'
import { Button, ConfirmDialog, Icon, IconButton, MenuItem, Menu } from '../../ui'
import { Tooltip } from '../../ui'
import { showBulkToast } from '../bulk/toastStore'
import { onAttachRequest } from './attachRequest'
import { t, msg, translatedMap } from '../../lib/i18n'

/** "Pasted image 2026-10-15 14.03.27.png": the name a pasted image gets. */
export function pastedName(now = new Date(), ext = 'png'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t('Pasted image')} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}.${p(now.getMinutes())}.${p(now.getSeconds())}.${ext}`
}

/** Files on a clipboard or a drop, with pasted images named by date. */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return []
  const out: File[] = []
  for (const f of Array.from(data.files)) {
    // A pasted screenshot arrives as "image.png" (or with no name at all).
    if (f.type.startsWith('image/') && (!f.name || f.name === 'image.png')) {
      out.push(new File([f], pastedName(new Date(), f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'), { type: f.type }))
    } else out.push(f)
  }
  return out
}

/** "PDF", "PNG", or the name's extension; "Link" for links. */
export function typeLabel(a: Pick<Attachment, 'mime' | 'name' | 'url'>): string {
  if (a.url) return t('Link')
  const known: Record<string, string> = { 'application/pdf': 'PDF', 'text/plain': t('Text'), 'image/svg+xml': 'SVG', 'image/jpeg': 'JPEG' }
  if (known[a.mime]) return known[a.mime]
  const sub = /^(image|audio|video)\/([a-z0-9.+-]+)$/.exec(a.mime)
  if (sub) return sub[2].toUpperCase()
  const ext = /\.([a-z0-9]{1,8})$/i.exec(a.name)
  return ext ? ext[1].toUpperCase() : t('File')
}

const STATE_TEXT = translatedMap<AttachmentState>({
  link: '', available: '', uploading: msg('Uploading'), waiting: msg('Waiting'), pending: msg('Uploading on another device'),
})

export function AttachmentsRow({ taskId, userId, role, dropTarget }: {
  taskId: string
  userId?: string
  /** The user's role in the task's project ('owner' for personal tasks). */
  role: ProjectRole
  /** The element whose paste and drop also add files (the task detail panel). */
  dropTarget?: RefObject<HTMLElement | null>
}) {
  const demo = useDemo()
  const limits = useAttachmentLimits()
  const rows = useTaskAttachments(taskId)
  const task = useTask(taskId)
  const embedded = embeddedIds(task?.description ?? '')
  const blobs = useAttachmentBlobs(rows)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  const [linking, setLinking] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const focusItem = (i: number) => {
    setActive(i)
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>('[data-attachment-open]')[i]?.focus())
  }

  // Viewers attach too (design D1): anyone who can read the task and is signed in.
  const canAdd = !!userId && !demo && limits?.enabled !== false
  const canRemove = (a: Attachment) => !!userId && (a.author_id === userId || role === 'owner' || role === 'admin')
  const canRename = (a: Attachment) => !!userId && a.author_id === userId

  async function add(files: File[]) {
    if (files.length === 0 || !canAdd) return
    setError(null)
    try {
      await queueFiles(taskId, files)
    } catch (err) {
      setError(err instanceof AttachmentError ? err.message : t('Could not add the file: {reason}', { reason: String((err as Error)?.message ?? err) }))
    }
  }
  const addRef = useRef(add)
  addRef.current = add

  // Paste and drop anywhere in the panel (design D7).
  useEffect(() => {
    const el = dropTarget?.current
    if (!el || !canAdd) return
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFrom(e.clipboardData)
      // The comment box has its own attach button, and the notes embed what they
      // take (editor-everywhere D5): leave their pastes alone.
      if (e.defaultPrevented || files.length === 0 || (e.target as HTMLElement | null)?.closest?.('[data-composer]')) return
      e.preventDefault()
      void addRef.current(files)
    }
    const onDragOver = (e: globalThis.DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (e: globalThis.DragEvent) => { if (e.target === el) setDragging(false) }
    const onDrop = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files') || (e.target as HTMLElement | null)?.closest?.('[data-composer]')) return
      e.preventDefault()
      setDragging(false)
      void addRef.current(filesFrom(e.dataTransfer))
    }
    el.addEventListener('paste', onPaste)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('paste', onPaste)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [dropTarget, canAdd])

  useEffect(() => { if (active >= rows.length) setActive(Math.max(0, rows.length - 1)) }, [rows.length, active])

  async function open(a: Attachment, download = false) {
    const state = stateOf(a, blobs.get(a.id))
    if (state !== 'link' && !blobs.has(a.id)) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNotes((n) => ({ ...n, [a.id]: t('Connect to the internet to open this file.') }))
        return
      }
      if (state === 'pending') {
        setNotes((n) => ({ ...n, [a.id]: t('This file is still uploading from another device.') }))
        return
      }
    }
    setNotes((n) => { const { [a.id]: _, ...rest } = n; return rest })
    try {
      await openAttachment(a, { download })
    } catch (err) {
      setNotes((n) => ({ ...n, [a.id]: err instanceof AttachmentError ? err.message : t('This file could not be opened.') }))
    }
  }

  async function remove(a: Attachment) {
    const undoId = await removeAttachment(a.id, a.name)
    showBulkToast(t('Removed “{name}”', { name: a.name }), undoId)
    focusItem(Math.max(0, active - 1))
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (renaming || rows.length === 0) return
    const a = rows[active]
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusItem(Math.min(rows.length - 1, active + 1)); break
      case 'ArrowUp': e.preventDefault(); focusItem(Math.max(0, active - 1)); break
      case 'Home': e.preventDefault(); focusItem(0); break
      case 'End': e.preventDefault(); focusItem(rows.length - 1); break
      case 'Delete': case 'Backspace': if (canRemove(a)) { e.preventDefault(); setRemoving(a) } break
      case 'F2': if (canRename(a)) { e.preventDefault(); setRenaming(a.id) } break
    }
  }

  // Attach from the Add menu or the header menu (task-panel-facets D4): the file chooser of this task.
  useEffect(() => onAttachRequest((id, kind) => {
    if (id !== taskId || !canAdd) return
    if (kind === 'link') setLinking(true)
    else picker.current?.click()
  }), [taskId, canAdd])

  if (demo && rows.length === 0) return null

  // At rest the row is one Attach action; the heading and list appear with the
  // first file, the drop zone only while files are dragged over the panel
  // (ux-overhaul, "Task panel layout").
  return (
    <section aria-label={t('Attachments')} data-testid="attachments-row">
      {rows.length > 0 && (
        <h3 className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted">
          <Icon name="paperclip" className="text-faint" />{t('Attachments')}<span className="font-normal text-faint">{rows.length}</span>
        </h3>
      )}
      {rows.length > 0 && (
        <ul ref={listRef} aria-label={t('Attachments')} onKeyDown={onKeyDown} className="mb-2 space-y-0.5">
          {rows.map((a, i) => (
            <AttachmentItem key={a.id} a={a} blob={blobs.get(a.id)} selected={i === active} missing={missing.has(a.id)} note={notes[a.id]}
              renaming={renaming === a.id} canRename={canRename(a)} canRemove={canRemove(a)}
              onSelect={() => setActive(i)} onOpen={(download) => void open(a, download)} onRename={() => setRenaming(a.id)}
              onRenamed={async (name) => { setRenaming(null); if (name && name !== a.name) await renameAttachment(a.id, name); focusItem(i) }}
              onRemove={() => setRemoving(a)} onMissing={() => setMissing((m) => new Set(m).add(a.id))} />
          ))}
        </ul>
      )}
      {canAdd && dragging && (
        <p role="status" data-drop-zone className="mb-2 rounded-control border-2 border-dashed border-accent bg-accent-soft px-3 py-4 text-center text-meta text-accent">
          {t('Drop files to attach them to this task')}
        </p>
      )}
      {canAdd && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={picker} type="file" multiple hidden aria-label={t('Choose files to attach')} data-testid="attachment-picker"
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void add(files) }} />
          {/* With no file yet there is no Attach button at rest (attachments "At rest"): Attach is in the
              Add menu and the header menu, which ask through attachRequest; paste and drop work too. */}
          {!linking && rows.length > 0 && (
            <Menu kind="menu" label={t('Attach')} align="start" width="sm:w-64" trigger={<span className="inline-flex items-center gap-1.5"><Icon name="paperclip" size="sm" />{t('Attach')}</span>}
              triggerClassName="ui-btn ui-btn--ghost ui-btn--sm -mx-2 text-muted">
              <MenuItem label={t('Choose files…')} icon="upload" description={t('Or paste or drop files on the task')} onSelect={() => picker.current?.click()} />
              <MenuItem label={t('Add a link…')} icon="link" onSelect={() => setLinking(true)} />
            </Menu>
          )}
          {linking && <LinkForm onCancel={() => setLinking(false)} onAdd={async (url) => { await queueLink(taskId, url); setLinking(false) }} />}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-meta text-danger">{error}</p>}
      {removing && (
        <ConfirmDialog title={t('Remove attachment?')} consequence={embedded.includes(removing.id)
          // The task's notes show it (editor-everywhere D5): say so before it becomes "Removed image" there.
          ? t('“{name}” is shown in the notes of “{task}” and is removed from them too. You can undo right after.', { name: removing.name, task: task?.title ?? '' })
          : t('“{name}” is removed from this task. You can undo right after.', { name: removing.name })}
          confirmLabel={t('Remove')} onConfirm={() => remove(removing)} onCancel={() => setRemoving(null)} />
      )}
    </section>
  )
}

function LinkForm({ onAdd, onCancel }: { onAdd: (url: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => {
      e.preventDefault()
      if (!parseLink(value)) { setError(t('Links start with http:// or https://.')); return }
      void onAdd(value).catch((err: Error) => setError(err.message))
    }}>
      <input autoFocus type="url" inputMode="url" value={value} placeholder={t('https://…')} aria-label={t('Link address')} aria-invalid={!!error}
        aria-describedby={error ? 'attachment-link-error' : undefined}
        onChange={(e) => { setValue(e.target.value); setError(null) }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
        className="ui-input min-w-0 flex-1 py-1 text-body" />
      <Button type="submit" size="sm">{t('Add')}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
      {error && <span id="attachment-link-error" role="alert" className="w-full text-meta text-danger">{error}</span>}
    </form>
  )
}

export function AttachmentItem({ a, blob, selected, missing, note, renaming, canRename, canRemove, onSelect, onOpen, onRename, onRenamed, onRemove, onMissing }: {
  a: Attachment
  blob: AttachmentBlob | undefined
  selected: boolean
  missing: boolean
  note?: string
  renaming: boolean
  canRename: boolean
  canRemove: boolean
  onSelect: () => void
  onOpen: (download: boolean) => void
  onRename: () => void
  onRenamed: (name: string | null) => Promise<void>
  onRemove: () => void
  onMissing: () => void
}) {
  const state = stateOf(a, blob)
  const progress = useUploadProgress(a.id)
  const local = useObjectUrl(blob && isImage(a.mime) ? blob.blob : undefined)
  const thumb = isImage(a.mime) && !a.encrypted ? (local ?? (state === 'available' && !missing ? contentUrl(a.id) : null)) : null
  const status = missing ? t('Missing on the server') : state === 'uploading' && progress !== null ? t('Uploading {percent}%', { percent: Math.round(progress * 100) }) : STATE_TEXT[state]
  const meta = [typeLabel(a), a.url ? safeHost(a.url) : formatBytes(a.size), status].filter(Boolean).join(' · ')
  return (
    <li data-attachment={a.id} aria-current={selected || undefined} onFocus={onSelect}
      className={`group flex items-center gap-2 rounded-control px-1 py-1 ${selected ? 'bg-sunken dark:bg-raised' : 'hover:bg-sunken dark:hover:bg-raised'}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken text-faint">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" onError={() => { if (!local) onMissing() }} />
          : <Icon name={a.url ? 'link' : isImage(a.mime) ? 'image' : 'file'} />}
      </span>
      <div className="min-w-0 flex-1">
        {renaming ? <RenameField initial={a.name} onDone={onRenamed} /> : (
          <Tooltip label={a.name}>
            <button type="button" data-attachment-open tabIndex={selected ? 0 : -1} className="block w-full truncate rounded-control text-left text-body text-default hover:underline" onClick={() => onOpen(false)}>
              {a.name}
            </button>
          </Tooltip>
        )}
        <p className="truncate text-meta text-faint">{meta}</p>
        {state === 'waiting' && blob?.reason && (
          <p className="text-meta text-warning">{blob.reason} <button type="button" tabIndex={selected ? 0 : -1} className="underline" onClick={() => void retryUpload(a.id)}>{t('Try again')}</button></p>
        )}
        {note && <p role="status" className="text-meta text-muted">{note}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton icon={a.url ? 'external-link' : 'eye'} label={a.url ? t('Open link {name}', { name: a.name }) : t('Open {name}', { name: a.name })} size="sm" tabIndex={selected ? 0 : -1} onClick={() => onOpen(false)} />
        {!a.url && <IconButton icon="download" label={t('Download {name}', { name: a.name })} size="sm" tabIndex={selected ? 0 : -1} onClick={() => onOpen(true)} />}
        {canRename && <IconButton icon="pencil" label={t('Rename {name}', { name: a.name })} size="sm" tabIndex={selected ? 0 : -1} onClick={onRename} />}
        {canRemove && <IconButton icon="trash-2" label={t('Remove {name}', { name: a.name })} size="sm" tabIndex={selected ? 0 : -1} onClick={onRemove} />}
      </div>
    </li>
  )
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string | null) => Promise<void> }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    void onDone(name?.trim() || null)
  }
  return (
    <input autoFocus value={value} aria-label={t('Attachment name')} maxLength={255} className="ui-input w-full py-0.5 text-body"
      onFocus={(e) => { const dot = e.target.value.lastIndexOf('.'); e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length) }}
      onChange={(e) => setValue(e.target.value)} onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(value) }
        if (e.key === 'Escape') { e.preventDefault(); finish(null) }
      }} />
  )
}

/** An object URL for a local blob, revoked when it changes or the item goes. */
function useObjectUrl(blob: Blob | undefined): string | null {
  const url = useMemo(() => (blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}


/** The attachments of one comment, under its text (design D7): open on activation. */
export function CommentAttachments({ list }: { list: Attachment[] }) {
  const [note, setNote] = useState<string | null>(null)
  if (list.length === 0) return null
  async function open(a: Attachment) {
    setNote(null)
    if (!a.url && !(await hasAttachmentBlob(a.id))) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return setNote(t('Connect to the internet to open this file.'))
      if (!a.uploaded_at) return setNote(t('This file is still uploading.'))
    }
    try {
      await openAttachment(a)
    } catch (err) {
      setNote(err instanceof AttachmentError ? err.message : t('This file could not be opened.'))
    }
  }
  return (
    <div className="mt-1">
      <ul aria-label={t('Attached files')} className="flex flex-wrap gap-1">
        {list.map((a) => (
          <li key={a.id} className="max-w-full">
            <Tooltip label={a.name}>
              <button type="button" onClick={() => void open(a)}
                className="flex max-w-full items-center gap-1.5 rounded-control border border-default px-2 py-1 text-meta text-default hover:bg-sunken dark:hover:bg-raised">
                <Icon name={a.url ? 'link' : isImage(a.mime) ? 'image' : 'file'} size="xs" className="text-faint" />
                <span className="min-w-0 truncate">{a.name}</span>
                <span className="shrink-0 text-faint">{a.url ? typeLabel(a) : a.uploaded_at ? formatBytes(a.size) : t('Uploading')}</span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ul>
      {note && <p role="status" className="mt-0.5 text-meta text-muted">{note}</p>}
    </div>
  )
}
