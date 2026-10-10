import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useState } from 'react'
import { db } from '../lib/db'
import { LABEL_PALETTE, LabelExistsError, activeLabels, countOpenByLabel, createLabel, deleteLabel, duplicateLabelIds, mergeLabels, reorderLabel, updateLabel } from '../lib/labels'
import type { Label } from '../lib/types'
import { navigate, type Route } from './router'
import { visibleTasks } from '../lib/trash'

/** Labels in sidebar order with per-label open counts (same project filter as the views). */
export function useLabelData() {
  const labels = useLiveQuery(() => db.labels.toArray().then(activeLabels), [], [] as Label[])
  const counts = useLiveQuery(async () => {
    // Same rule as TaskListView: tasks of archived projects and of trashed projects are hidden.
    const hidden = new Set((await db.projects.filter((p) => !p.deleted_at && p.archived).toArray()).map((p) => p.id))
    const open = (await visibleTasks()).filter((t) => !t.completed_at && (!t.project_id || !hidden.has(t.project_id)))
    return countOpenByLabel(open)
  }, [], new Map<string, number>())
  return { labels, counts, duplicates: duplicateLabelIds(labels) }
}

/** Inline "new label" form shared by the sidebar and the overview. */
export function NewLabelForm({ onDone, className = '' }: { onDone: () => void; className?: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<{ message: string; id?: string } | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return onDone()
    try {
      const id = await createLabel({ name })
      setName('')
      onDone()
      navigate({ view: 'label', id })
    } catch (err) {
      setError(err instanceof LabelExistsError ? { message: err.message, id: err.existing.id } : { message: err instanceof Error ? err.message : String(err) })
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className={className}>
      <input className="input" autoFocus placeholder="Label name" aria-label="New label name" value={name}
        onChange={(e) => { setName(e.target.value); setError(null) }}
        onKeyDown={(e) => e.key === 'Escape' && onDone()} onBlur={() => !name && onDone()} />
      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error.message}{error.id && <>. <button type="button" className="underline" onMouseDown={(e) => e.preventDefault()} onClick={() => navigate({ view: 'label', id: error.id! })}>Open it</button></>}
        </p>
      )}
    </form>
  )
}

export function LabelRow({ label, labels, count, duplicate, route }: { label: Label; labels: Label[]; count?: number; duplicate: boolean; route: Route }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(label.name)
  const [error, setError] = useState<string | null>(null)
  const active = route.view === 'label' && route.id === label.id

  async function save() {
    setEditing(false)
    const n = name.trim()
    if (!n || n === label.name) return setName(label.name)
    try {
      await updateLabel(label.id, { name: n })
    } catch (err) {
      setName(label.name)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={`group rounded-md ${active ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}>
      <div className="flex items-center gap-2 pr-1">
        {editing ? (
          <input className="input my-0.5 ml-1 py-0.5" autoFocus aria-label="Label name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(label.name); setEditing(false) } }} />
        ) : (
          <button onClick={() => navigate({ view: 'label', id: label.id })} onDoubleClick={() => setEditing(true)}
            className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm ${active ? 'font-medium text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'}`}>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
            <span className="flex-1 truncate">{label.name}</span>
            {duplicate && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" title="Another label has this name. Merge them from the menu.">dup</span>}
            {count ? <span className="text-xs text-slate-400">{count}</span> : null}
          </button>
        )}
        <LabelMenu label={label} labels={labels} count={count ?? 0} onRename={() => { setName(label.name); setEditing(true) }} />
      </div>
      {error && <p className="px-2 pb-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function LabelMenu({ label, labels, count, onRename }: { label: Label; labels: Label[]; count: number; onRename: () => void }) {
  const others = labels.filter((l) => l.id !== label.id)
  const close = (e: React.SyntheticEvent) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')
  async function remove(e: React.SyntheticEvent) {
    close(e)
    if (!confirm(`Delete label "${label.name}"? It is removed from ${count} open task${count === 1 ? '' : 's'}.`)) return
    await deleteLabel(label.id)
  }
  async function merge(e: React.ChangeEvent<HTMLSelectElement>) {
    const target = others.find((l) => l.id === e.target.value)
    e.target.value = ''
    close(e)
    if (!target || !confirm(`Merge "${label.name}" into "${target.name}"? Tasks carrying "${label.name}" will carry "${target.name}" instead and "${label.name}" is deleted.`)) return
    await mergeLabels(label.id, target.id)
    navigate({ view: 'label', id: target.id })
  }
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 text-slate-400 opacity-0 hover:bg-slate-300/60 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-700 [details[open]_&]:opacity-100" aria-label={`Menu for label ${label.name}`}>⋯</summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <p className="px-1 pb-1 text-xs text-slate-400">Color</p>
        <div className="mb-2 flex flex-wrap gap-1 px-1">
          {LABEL_PALETTE.map((c) => (
            <button key={c} className={`h-5 w-5 rounded-full ${c === label.color ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`} style={{ backgroundColor: c }}
              aria-label={`Set color ${c}`} onClick={() => void updateLabel(label.id, { color: c })} />
          ))}
        </div>
        <button className="btn-ghost w-full justify-start" onClick={(e) => { close(e); onRename() }}>Rename</button>
        <div className="flex">
          <button className="btn-ghost flex-1 justify-start" onClick={() => void reorderLabel(label.id, -1)}>Move up</button>
          <button className="btn-ghost flex-1 justify-start" onClick={() => void reorderLabel(label.id, 1)}>Move down</button>
        </div>
        {others.length > 0 && (
          <select className="input mt-1 py-1" aria-label={`Merge ${label.name} into`} defaultValue="" onChange={(e) => void merge(e)}>
            <option value="" disabled>Merge into…</option>
            {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <button className="btn-danger mt-1 w-full justify-start" onClick={(e) => void remove(e)}>Delete label</button>
      </div>
    </details>
  )
}

/** The `g l` overview: every label with its open count, duplicates flagged, management in the row menu. */
export function LabelsView({ route }: { route: Route }) {
  const { labels, counts, duplicates } = useLabelData()
  const [adding, setAdding] = useState(false)
  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:px-8">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Labels</h1>
        <span className="text-sm text-slate-400">{labels.length}</span>
        <div className="flex-1" />
        <button className="btn-primary text-xs" onClick={() => setAdding(true)}>+ New label</button>
      </div>
      {adding && <NewLabelForm onDone={() => setAdding(false)} className="mb-3 max-w-xs" />}
      {duplicates.size > 0 && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Some labels share a name (created on different devices while offline). Use “Merge into…” in a label's menu to combine them.
        </p>
      )}
      <div className="space-y-0.5">
        {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={counts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} />)}
      </div>
      {labels.length === 0 && !adding && (
        <p className="px-2 py-8 text-center text-sm text-slate-400">No labels yet. Press <span className="kbd">L</span> on a task or create one here.</p>
      )}
    </div>
  )
}
