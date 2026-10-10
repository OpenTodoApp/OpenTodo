import { useLiveQuery } from 'dexie-react-hooks'
import { type FormEvent, useState } from 'react'
import { db } from '../lib/db'
import { todayISO } from '../lib/dates'
import { createProject } from '../lib/ops'
import type { User } from '../lib/types'
import { LabelRow, NewLabelForm, useLabelData } from './LabelsView'
import { navigate, type Route } from './router'

export function Sidebar({ route, user }: { route: Route; user: User }) {
  const projects = useLiveQuery(
    () => db.projects.filter((p) => !p.deleted_at && !p.archived).sortBy('position'),
    [], [],
  )
  const counts = useLiveQuery(async () => {
    const open = await db.tasks.filter((t) => !t.deleted_at && !t.completed_at).toArray()
    const today = todayISO()
    const byProject = new Map<string | null, number>()
    let todayCount = 0
    for (const t of open) {
      byProject.set(t.project_id, (byProject.get(t.project_id) ?? 0) + 1)
      if (t.due && t.due.date <= today) todayCount++
    }
    return { byProject, today: todayCount }
  }, [], { byProject: new Map<string | null, number>(), today: 0 })

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const { labels, counts: labelCounts, duplicates } = useLabelData()
  const [labelsOpen, setLabelsOpen] = useState(true)
  const [addingLabel, setAddingLabel] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const id = await createProject({ name })
    setName('')
    setAdding(false)
    navigate({ view: 'project', id })
  }

  const item = (r: Route, label: string, icon: string, count?: number) => {
    const active = JSON.stringify(r) === JSON.stringify(route)
    return (
      <button
        key={label}
        onClick={() => navigate(r)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}
      >
        <span className="w-5 text-center">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {count ? <span className="text-xs text-slate-400">{count}</span> : null}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-4 flex items-center gap-2 px-1">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
        <span className="font-semibold">OpenTodo</span>
      </div>
      <nav className="space-y-0.5">
        {item({ view: 'inbox' }, 'Inbox', '📥', counts.byProject.get(null))}
        {item({ view: 'today' }, 'Today', '📅', counts.today)}
        {item({ view: 'upcoming' }, 'Upcoming', '🗓️')}
        {item({ view: 'completed' }, 'Completed', '✅')}
      </nav>
      <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Projects
        <button className="rounded px-1 text-base leading-none hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => setAdding(true)} title="New project">+</button>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate({ view: 'project', id: p.id })}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'project' && route.id === p.id ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="flex-1 truncate">{p.name}</span>
            {counts.byProject.get(p.id) ? <span className="text-xs text-slate-400">{counts.byProject.get(p.id)}</span> : null}
          </button>
        ))}
        {adding && (
          <form onSubmit={(e) => void submit(e)} className="px-1 pt-1">
            <input className="input" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} onBlur={() => !name && setAdding(false)} />
          </form>
        )}
        {projects.length === 0 && !adding && <p className="px-2 py-1 text-xs text-slate-400">No projects yet.</p>}

        <div className="mt-5 mb-1 flex items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <button className="flex items-center gap-1 uppercase hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setLabelsOpen((v) => !v)} aria-expanded={labelsOpen}>
            <span className="inline-block w-3 text-[10px]">{labelsOpen ? '▾' : '▸'}</span>Labels
          </button>
          <span className="flex items-center gap-1">
            <button className={`rounded px-1 text-[10px] normal-case hover:bg-slate-200 dark:hover:bg-slate-800 ${route.view === 'labels' ? 'text-emerald-700 dark:text-emerald-300' : ''}`} onClick={() => navigate({ view: 'labels' })} title="All labels (g l)">All</button>
            <button className="rounded px-1 text-base leading-none hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => { setLabelsOpen(true); setAddingLabel(true) }} title="New label">+</button>
          </span>
        </div>
        {labelsOpen && (
          <div className="space-y-0.5">
            {labels.map((l) => <LabelRow key={l.id} label={l} labels={labels} count={labelCounts.get(l.id)} duplicate={duplicates.has(l.id)} route={route} />)}
            {addingLabel && <NewLabelForm onDone={() => setAddingLabel(false)} className="px-1 pt-1" />}
            {labels.length === 0 && !addingLabel && <p className="px-2 py-1 text-xs text-slate-400">No labels yet.</p>}
          </div>
        )}
      </nav>
      <button onClick={() => navigate({ view: 'settings' })}
        className={`mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${route.view === 'settings' ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'}`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
          {(user.name || user.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{user.name || user.email}</span>
        <span className="text-slate-400">⚙</span>
      </button>
    </div>
  )
}
