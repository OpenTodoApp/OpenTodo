// Views overview (`g v`) and the per-view menu shared with the sidebar and the view
// headers (OpenSpec `custom-views`). Every action is an op through lib/views, except
// the start view, which is a per-device preference in local meta.
import { useMemo, useState } from 'react'
import type { View } from '../lib/types'
import { createView, deleteView, evaluateViews, isDashboard, reorderView, setPinned, setStartView, updateView } from '../lib/views'
import { NamePrompt } from './NamePrompt'
import { navigate } from './router'
import { useStartView, useViewData } from './useViews'
import { Menu } from './overlay'

export const viewIcon = (v: View) => (isDashboard(v) ? '▦' : '≡')

/** "Rename" opens a NamePrompt owned by the menu, so every caller gets the same flow. */
export function ViewMenu({ view, align = 'end', className = '' }: { view: View; align?: 'start' | 'end'; className?: string }) {
  const start = useStartView()
  const isStart = start === `view:${view.id}`
  const [renaming, setRenaming] = useState(false)
  async function remove() {
    if (!confirm(`Delete view "${view.name}"? Your tasks are not affected.`)) return
    await deleteView(view.id)
  }
  return (
    <>
      <Menu label={`Menu for view ${view.name}`} title={view.name} trigger="⋯" align={align}
        triggerClassName={`touch-target rounded px-1.5 py-0.5 text-faint hover:bg-slate-300/60 dark:hover:bg-slate-700 ${className}`}>
        {(close) => {
          const act = (fn: () => unknown) => () => { close(); void fn() }
          return (
            <>
              <button className="btn-ghost w-full justify-start" onClick={act(() => setRenaming(true))}>Rename</button>
              <div className="flex">
                <button className="btn-ghost flex-1 justify-start" onClick={act(() => reorderView(view.id, -1))}>Move up</button>
                <button className="btn-ghost flex-1 justify-start" onClick={act(() => reorderView(view.id, 1))}>Move down</button>
              </div>
              <button className="btn-ghost w-full justify-start" onClick={act(() => setPinned(view.id, !view.pinned))}>{view.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}</button>
              <button className="btn-ghost w-full justify-start" disabled={isStart} onClick={act(() => setStartView(`view:${view.id}`))}>
                {isStart ? 'Start view on this device ✓' : 'Set as start view on this device'}
              </button>
              <button className="btn-danger w-full justify-start" onClick={act(remove)}>Delete view</button>
            </>
          )
        }}
      </Menu>
      {renaming && (
        <NamePrompt title="Rename view" label="View name" initial={view.name} onCancel={() => setRenaming(false)}
          onSubmit={async (name) => { await updateView(view.id, { name }); setRenaming(false) }} />
      )}
    </>
  )
}

export function ViewsView() {
  const { views, ctx } = useViewData()
  const summaries = useMemo(() => evaluateViews(views, ctx, 0), [views, ctx])
  const [creating, setCreating] = useState(false)
  const pinned = views.filter((v) => v.pinned)
  const others = views.filter((v) => !v.pinned)

  const row = (v: View) => {
    const s = summaries.get(v.id)
    return (
      <li key={v.id} className="group flex items-center gap-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/60">
        <button className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm" onClick={() => navigate({ view: 'view', id: v.id })}>
          <span className="w-5 text-center text-faint" aria-hidden>{viewIcon(v)}</span>
          <span className="truncate font-medium">{v.name}</span>
          <code className="hidden truncate text-xs text-faint sm:inline">{isDashboard(v) ? `${v.panels.length} panel${v.panels.length === 1 ? '' : 's'}` : v.query}</code>
          <span className="flex-1" />
          {s && (s.ok ? <span className="text-xs text-faint">{s.count}</span> : <span className="text-xs text-red-600 dark:text-red-400" title={s.error}>error</span>)}
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void setPinned(v.id, !v.pinned)} aria-label={`${v.pinned ? 'Unpin' : 'Pin'} ${v.name}`}>
          {v.pinned ? 'Unpin' : 'Pin'}
        </button>
        <ViewMenu view={v} />
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 md:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Views</h1>
        <span className="text-sm text-faint">{views.length}</span>
        <div className="flex-1" />
        <button className="btn-ghost border border-slate-300 text-xs dark:border-slate-700" onClick={() => navigate({ view: 'filter' })}>+ New view from a filter</button>
        <button className="btn-primary text-xs" onClick={() => setCreating(true)}>+ New dashboard</button>
      </div>
      <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-faint">Pinned to the sidebar</h2>
      <ul className="mb-5 space-y-0.5">{pinned.map(row)}</ul>
      {pinned.length === 0 && <p className="mb-5 px-2 text-sm text-faint">None.</p>}
      <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-faint">Not pinned</h2>
      <ul className="space-y-0.5">{others.map(row)}</ul>
      {others.length === 0 && <p className="px-2 text-sm text-faint">None.</p>}
      {creating && (
        <NamePrompt title="New dashboard" label="Dashboard name" confirm="Create" hint="Add up to six saved views as panels."
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            const id = await createView({ name, kind: 'dashboard' })
            setCreating(false)
            navigate({ view: 'view', id })
          }} />
      )}
    </div>
  )
}
