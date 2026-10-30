// Capture screen for shared pages (OpenSpec `share-capture`). Reached from the
// system share sheet (manifest share_target), the Settings bookmarklet and the
// browser extension, all of which open /share?title=…&text=…&url=… A share with
// files arrives as /share?inbox=<id>: the service worker put the files and text in
// the device-local hand-over store (OpenSpec attachments, design D9).
import { ProjectPickerField } from './ProjectPickerField'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commitFiles, formatBytes, isImage, planFiles, useAttachmentLimits } from '../lib/attachments'
import { useAllLabels, useProjects } from '../lib/localData'
import { useDemo } from '../lib/demo'
import { createTask, planNewTasks, planReminders, planTask } from '../lib/ops'
import { addTasksUndoable } from '../lib/pasteTasks'
import { showBulkToast } from './bulk/toastStore'
import { captureFiles, type CapturedFile, isEmptyShare, parseShare, proposedDescription, proposedOrigin, proposedTitle, titleFromFiles, type SharePayload } from '../lib/share'
import { deleteInboxEntry, getInboxEntry, type SharedFile } from '../lib/shareInbox'
import type { Task } from '../lib/types'
import { IconButton } from '../ui'
import { Icon } from '../ui'
import { InstanceMark, useInstanceName } from './InstanceBrand'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { navigate, type Route } from './router'
import { useShortcutDispatcher, useShortcutScope } from './shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { t } from '../lib/i18n'
import { messageOf } from '../lib/errorText'

/** How files come with this share: the hand-over store, the extension's message, or lost on the way. */
export type ShareFiles = { inbox?: string | null; mode?: 'extension' | 'denied' | 'lost' | null }

// The payload lives in memory only, read once from the address bar before the auth
// gate renders. The query string is then removed from the address bar and history so
// the shared content is not kept anywhere before the user saves; it survives sign-in
// (no page load) but not a reload of the sign-in page.
let pending: SharePayload | null = null
let pendingFiles: ShareFiles = {}

if (typeof location !== 'undefined' && location.pathname.replace(/\/+$/, '') === '/share') {
  const q = new URLSearchParams(location.search)
  pending = parseShare(q)
  const mode = q.get('files')
  pendingFiles = { inbox: q.get('inbox'), mode: mode === '1' ? 'extension' : mode === 'denied' ? 'denied' : mode === 'lost' ? 'lost' : null }
  if (location.search) history.replaceState(history.state, '', '/share')
}

/** The shared payload waiting on the capture screen, if any. */
export function pendingShare(): SharePayload | null {
  return pending
}

/** Test hook and post-save cleanup. */
export function setPendingShare(p: SharePayload | null, files: ShareFiles = {}): void {
  pending = p
  pendingFiles = files
}

/** A data: URL from the extension's screenshot hand-over, as a Blob (or null when it is not one). */
export function blobFromDataUrl(data: unknown, type: string): Blob | null {
  if (typeof data !== 'string') return null
  const m = /^data:([a-z0-9.+/-]+)?;base64,([a-z0-9+/=]+)$/i.exec(data)
  if (!m) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: type || m[1] || 'application/octet-stream' })
}

/**
 * Leave the capture screen: a popup (bookmarklet, extension) or a window opened just
 * for the share closes itself; otherwise go back into the app. The shared files
 * leave the hand-over store either way.
 */
function leave(to: Route) {
  const inbox = pendingFiles.inbox
  setPendingShare(null)
  if (inbox) void deleteInboxEntry(inbox).catch(() => undefined)
  if (window.opener || history.length <= 1) window.close()
  // window.close() is ignored for windows a script did not open; then stay in the app.
  setTimeout(() => navigate(to, { replace: true }), 50)
}

export function ShareCapture() {
  const app = useInstanceName()
  const [files] = useState(() => pendingFiles)
  const [payload, setPayload] = useState<SharePayload>(() => pending ?? { title: '', text: '', url: null })
  // A share with files waits for the hand-over store before the form shows its text.
  const [ready, setReady] = useState(() => !files.inbox)
  const [shared, setShared] = useState<SharedFile[]>([])
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const demo = useDemo()
  const limits = useAttachmentLimits()
  useEffect(() => {
    if (!files.inbox) return
    void getInboxEntry(files.inbox).then((entry) => {
      if (entry) {
        const text = parseShare(new URLSearchParams({ title: entry.title, text: entry.text, url: entry.url }))
        setPayload((p) => (isEmptyShare(p) ? text : p))
        setDescription((d) => d || proposedDescription(text))
        setShared(entry.files)
      }
    }, () => undefined).finally(() => setReady(true))
  }, [files.inbox])
  // The extension's screenshot (design D10): once, from this page only, and only
  // when the popup was opened for it.
  useEffect(() => {
    if (files.mode !== 'extension') return
    let taken = false
    function onMessage(e: MessageEvent) {
      if (taken || e.source !== window || e.origin !== location.origin) return
      const data = e.data as { type?: unknown; files?: { name?: unknown; type?: unknown; data?: unknown }[] } | null
      if (data?.type !== 'opentodo-files' || !Array.isArray(data.files)) return
      taken = true
      // Tells the extension's injected script to stop posting.
      document.documentElement.dataset.opentodoFiles = 'received'
      const list: SharedFile[] = []
      for (const f of data.files) {
        const type = typeof f.type === 'string' ? f.type : ''
        const blob = blobFromDataUrl(f.data, type)
        if (blob) list.push({ name: typeof f.name === 'string' ? f.name : 'screenshot.png', type: blob.type, blob })
      }
      setShared((s) => [...s, ...list])
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [files.mode])
  const captured = useMemo(() => captureFiles(shared, limits?.max_file_bytes ?? null, formatBytes), [shared, limits])
  const listed = captured.files.filter((f) => !removed.has(f.key))
  const attach = demo || limits?.enabled === false ? [] : listed.filter((f) => !f.refused)
  const [description, setDescription] = useState(() => proposedDescription(payload))
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // Same inputs as the task views' quick add, so `#project`, `@label`, dates and `p1` in the title parse alike.
  const projects = useProjects()
  const labels = useAllLabels()

  useEffect(() => { titleRef.current?.focus() }, [])
  // The capture screen renders outside the shell, so it installs the dispatcher itself; Esc leaves without saving.
  useShortcutDispatcher()
  useShortcutScope('view', { 'share.escape': () => leave({ view: 'inbox' }) }, { view: 'share' })

  async function save(input: QuickAddInput) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      // A `#project` typed in the title wins over the picker, as in the task views.
      const project = input.project_id ?? (projectId || null)
      // Where it came from (task-origin): the shared URL and title, in the same batch as the task.
      const task = { ...input, description: description.trim(), project_id: project, origin: proposedOrigin(payload) }
      if (attach.length) {
        // The task and its files in one batch, locally first; the bytes upload after sync.
        const { id, change } = await planTask(task)
        const asFiles = await Promise.all(attach.map(async (f) => new File([await f.blob.arrayBuffer()], f.name, { type: f.type })))
        const planned = await planFiles(id, asFiles, { projectId: project })
        // Typed reminders ride in the same batch, as createTask writes them (quick-add-recurrence D3).
        await commitFiles(planned, [change, ...planReminders(id, (change.patch as { due: Task['due'] }).due, input.reminders)])
      } else {
        // One mutate: title, parsed attributes, description and project land as one op set, locally first.
        await createTask(task)
      }
      leave(project ? { view: 'project', id: project } : { view: 'inbox' })
    } catch (err) {
      setSaving(false)
      setError(messageOf(err))
    }
  }

  /**
   * A pasted list (paste-to-tasks D3): one task per line, each with the picked project
   * (unless its line names one) and the share as its origin; the description and the
   * files go with the first, as they would with a single task. One batch; a refused
   * line leaves the offer open with the reason.
   */
  async function saveMany(inputs: QuickAddInput[]) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const picked = projectId || null
      const origin = proposedOrigin(payload)
      const tasks = inputs.map((input, i) => ({ ...input, project_id: input.project_id ?? picked, origin, ...(i === 0 ? { description: description.trim() } : {}) }))
      if (attach.length) {
        const { ids, changes } = await planNewTasks(tasks)
        const asFiles = await Promise.all(attach.map(async (f) => new File([await f.blob.arrayBuffer()], f.name, { type: f.type })))
        await commitFiles(await planFiles(ids[0], asFiles, { projectId: tasks[0].project_id }), changes)
      } else {
        const added = await addTasksUndoable(tasks)
        showBulkToast(added.label, added.undoId)
      }
      leave(picked ? { view: 'project', id: picked } : { view: 'inbox' })
    } catch (err) {
      setSaving(false)
      throw err
    }
  }

  return (
    <div className="flex min-h-full justify-center bg-canvas p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-card border border-default bg-surface p-5 shadow-1">
        <div className="mb-4 flex items-center gap-2">
          <InstanceMark size={24} />
          <h1 className="text-body font-semibold">{t('Add to {app}', { app })}</h1>
        </div>
        {ready && isEmptyShare(payload) && shared.length === 0 && files.mode !== 'extension' && (
          <p className="mb-3 text-body text-muted">{t('Nothing was shared. Type a task to add it anyway.')}</p>
        )}
        {!ready ? <p className="text-body text-muted" role="status">{t('Opening the shared files…')}</p> : (
        <div className="rounded-control border border-input px-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-focus/30">
          <QuickAdd
            ref={titleRef}
            formId="share-capture"
            placeholder={t('Task title')}
            label={t('Task title')}
            initialValue={proposedTitle(payload) || titleFromFiles(listed)}
            hideHint
            projects={projects}
            labels={labels}
            onAdd={save}
            onAddMany={saveMany}
          />
        </div>
        )}
        <label className="mt-3 block text-body">
          <span className="mb-1 block text-muted">{t('Description')}</span>
          <textarea
            className="ui-input min-h-28 font-normal"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                ;(document.getElementById('share-capture') as HTMLFormElement | null)?.requestSubmit()
              }
            }}
          />
        </label>
        <div className="mt-3 block text-body">
          <span className="mb-1 block text-muted" aria-hidden>{t('Project')}</span>
          <ProjectPickerField label={t('Project')} projects={projects} value={projectId || null} onChange={(id) => setProjectId(id ?? '')} rankContext="capture.project" />
        </div>
        <SharedFiles files={listed} dropped={captured.dropped} demo={!!demo} disabled={limits?.enabled === false} mode={files.mode ?? null}
          onRemove={(key) => setRemoved((r) => new Set(r).add(key))} />
        {error && <p className="mt-3 text-body text-danger" role="alert">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto hidden text-meta text-faint sm:inline">
            {t.rich('{enter} saves · {esc} cancels', { enter: <Kbd k="Enter" />, esc: <Kbd k="Esc" /> })}
          </span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={() => leave({ view: 'inbox' })}>{t('Cancel')}</button>
          <button type="submit" form="share-capture" className="ui-btn ui-btn--primary ui-btn--md" disabled={saving || !ready}>{saving ? t('Saving…') : t('Save')}</button>
        </div>
      </div>
    </div>
  )
}

/** The shared files: name, type and size (a thumbnail for images), removable; never rendered as documents. */
function SharedFiles({ files, dropped, demo, disabled, mode, onRemove }: {
  files: CapturedFile[]
  dropped: number
  demo: boolean
  disabled: boolean
  mode: ShareFiles['mode']
  onRemove: (key: string) => void
}) {
  const notes: string[] = []
  if (mode === 'denied') notes.push(t('The screenshot could not be handed over. Allow the extension to reach your server in its options, then try again.'))
  if (mode === 'lost') notes.push(t('The shared files did not arrive: open the app once so it can receive files, then share again.'))
  if (files.length && demo) notes.push(t('Files are not attached on this demo instance.'))
  else if (files.length && disabled) notes.push(t('Attachments are turned off on this server, so the files are not attached.'))
  if (dropped) notes.push(t('{n, plural, one {# more file was left out: a share takes at most 10.} other {# more files were left out: a share takes at most 10.}}', { n: dropped }))
  if (!files.length && !notes.length) return null
  return (
    <div className="mt-3 text-body" data-testid="shared-files">
      {files.length > 0 && !demo && (
        <>
          <span className="mb-1 block text-muted" id="shared-files-label">{t('Files')}</span>
          <ul aria-labelledby="shared-files-label" className="space-y-1">
            {files.map((f) => <SharedFileRow key={f.key} file={f} onRemove={() => onRemove(f.key)} />)}
          </ul>
        </>
      )}
      {notes.map((n) => <p key={n} className="mt-1 text-meta text-muted" role="status">{n}</p>)}
    </div>
  )
}

function SharedFileRow({ file, onRemove }: { file: CapturedFile; onRemove: () => void }) {
  const thumb = useMemo(() => (isImage(file.type) && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file.blob) : null), [file])
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb) }, [thumb])
  return (
    <li className="flex items-center gap-2 rounded-control border border-default px-2 py-1" data-shared-file={file.name}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken text-faint">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon name={isImage(file.type) ? 'image' : 'file'} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-default">{file.name}</p>
        <p className="truncate text-meta text-faint">{file.type} · {formatBytes(file.size)}</p>
        {file.refused && <p className="text-meta text-danger">{file.refused}</p>}
      </div>
      <IconButton icon="x" size="sm" label={t('Remove {name}', { name: file.name })} onClick={onRemove} />
    </li>
  )
}
