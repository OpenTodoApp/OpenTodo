// Capture screen for shared pages (OpenSpec `share-capture`). Reached from the
// system share sheet (manifest share_target), the Settings bookmarklet and the
// browser extension, all of which open /share?title=…&text=…&url=…
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { createTask } from '../lib/ops'
import { buildProjectTree } from '../lib/projects'
import { isEmptyShare, parseShare, proposedDescription, proposedTitle, type SharePayload } from '../lib/share'
import { flattenTree } from '../lib/tree'
import type { Label } from '../lib/types'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { navigate, type Route } from './router'

// The payload lives in memory only, read once from the address bar before the auth
// gate renders. The query string is then removed from the address bar and history so
// the shared content is not kept anywhere before the user saves; it survives sign-in
// (no page load) but not a reload of the sign-in page.
let pending: SharePayload | null = null

if (typeof location !== 'undefined' && location.pathname.replace(/\/+$/, '') === '/share') {
  pending = parseShare(location.search)
  if (location.search) history.replaceState(history.state, '', '/share')
}

/** The shared payload waiting on the capture screen, if any. */
export function pendingShare(): SharePayload | null {
  return pending
}

/** Test hook and post-save cleanup. */
export function setPendingShare(p: SharePayload | null): void {
  pending = p
}

/**
 * Leave the capture screen: a popup (bookmarklet, extension) or a window opened just
 * for the share closes itself; otherwise go back into the app.
 */
function leave(to: Route) {
  setPendingShare(null)
  if (window.opener || history.length <= 1) window.close()
  // window.close() is ignored for windows a script did not open; then stay in the app.
  setTimeout(() => navigate(to, { replace: true }), 50)
}

export function ShareCapture() {
  const payload = useMemo(() => pending ?? { title: '', text: '', url: null }, [])
  const [description, setDescription] = useState(() => proposedDescription(payload))
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  // Same inputs as the task views' quick add, so `#project`, `@label`, dates and `p1` in the title parse alike.
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at).toArray(), [], [])
  const labels = useLiveQuery(() => db.labels.toArray(), [], [] as Label[])
  const options = useMemo(() => flattenTree(buildProjectTree(projects).roots), [projects])

  useEffect(() => {
    titleRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        leave({ view: 'inbox' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function save(input: QuickAddInput) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      // A `#project` typed in the title wins over the picker, as in the task views.
      const project = input.project_id ?? (projectId || null)
      // One mutate: title, parsed attributes, description and project land as one op set, locally first.
      await createTask({ ...input, description: description.trim(), project_id: project })
      leave(project ? { view: 'project', id: project } : { view: 'inbox' })
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex min-h-full justify-center bg-slate-50 p-4 dark:bg-slate-950 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-6 w-6" />
          <h1 className="text-base font-semibold">Add to OpenTodo</h1>
        </div>
        {isEmptyShare(payload) && (
          <p className="mb-3 text-sm text-muted">Nothing was shared. Type a task to add it anyway.</p>
        )}
        <div className="rounded-md border border-slate-300 px-2 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/30 dark:border-slate-700">
          <QuickAdd
            ref={titleRef}
            formId="share-capture"
            placeholder="Task title"
            label="Task title"
            initialValue={proposedTitle(payload)}
            hideHint
            projects={projects}
            labels={labels}
            onAdd={save}
          />
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Description</span>
          <textarea
            className="input min-h-28 font-normal"
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
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Project</span>
          <select className="input" aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Inbox</option>
            {options.map((n) => (
              <option key={n.id} value={n.id}>{'  '.repeat(n.depth)}{n.item.name}</option>
            ))}
          </select>
        </label>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto hidden text-xs text-faint sm:inline">
            <span className="kbd">Enter</span> save · <span className="kbd">Esc</span> cancel
          </span>
          <button type="button" className="btn-ghost" onClick={() => leave({ view: 'inbox' })}>Cancel</button>
          <button type="submit" form="share-capture" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
