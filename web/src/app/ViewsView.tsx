// Views overview (`g v`) and the per-view menu shared with the sidebar and the view
// headers (OpenSpec `custom-views`). Every action is an op through lib/views, except
// the start view, which is a per-device preference in local meta.
import { useMemo, useState } from 'react'
import type { View } from '../lib/types'
import { createView, deleteView, evaluateViews, isDashboard, reorderView, setPinned, setStartView, updateView } from '../lib/views'
import { NamePrompt } from './NamePrompt'
import { navigate } from './router'
import { useStartView, useViewData, useViews } from './useViews'
import { Icon, type IconName } from '../ui'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'

export const viewIcon = (v: View): IconName => (isDashboard(v) ? 'kanban' : 'list')

export interface ViewMenuActions {
  rename: () => void
  move: (delta: -1 | 1) => unknown
  pin: (pinned: boolean) => unknown
  startView: () => unknown
  remove: () => unknown
}

/**
 * The view menu as data (labels-and-menus D1): every call site (sidebar, views
 * overview, view header, dashboard) renders these groups, so they cannot drift.
 * `peers` are the views it is ordered among (pinned or not, in order).
 */
export function viewMenuGroups(view: View, peers: View[], isStart: boolean, a: ViewMenuActions): ActionGroup[] {
  const i = peers.findIndex((v) => v.id === view.id)
  const first = i <= 0
  const last = i < 0 || i === peers.length - 1
  return [
    { items: [{ kind: 'action', id: 'rename', label: 'Rename', icon: 'pencil', onSelect: a.rename }] },
    { items: [
      { kind: 'check', id: 'pin', label: 'Pinned to sidebar', icon: 'pin', checked: view.pinned, onSelect: () => a.pin(!view.pinned) },
      { kind: 'check', id: 'start', label: 'Start view on this device', icon: 'house', checked: isStart, disabled: isStart,
        reason: 'This view opens when the app starts', onSelect: a.startView },
    ] },
    { items: [
      { kind: 'action', id: 'up', label: 'Move up', icon: 'arrow-up', disabled: first, reason: 'Already first', onSelect: () => a.move(-1) },
      { kind: 'action', id: 'down', label: 'Move down', icon: 'arrow-down', disabled: last, reason: 'Already last', onSelect: () => a.move(1) },
    ] },
    { items: [{ kind: 'confirm', id: 'delete', label: 'Delete view', icon: 'trash-2', tone: 'danger', confirm: {
      title: `Delete view “${view.name}”?`,
      body: 'The view is removed on all your devices. Your tasks are not affected.',
      confirmLabel: 'Delete view',
      onConfirm: a.remove,
    } }] },
  ]
}

/** The view menu shared by every call site; "Rename" opens a NamePrompt owned by the menu. */
export function ViewMenu({ view, align = 'end', className = '' }: { view: View; align?: 'start' | 'end'; className?: string }) {
  const start = useStartView()
  const views = useViews()
  const isStart = start === `view:${view.id}`
  const [renaming, setRenaming] = useState(false)
  const peers = views.filter((v) => v.pinned === view.pinned)
  const groups = viewMenuGroups(view, peers, isStart, {
    rename: () => setRenaming(true),
    move: (d) => reorderView(view.id, d),
    pin: (p) => setPinned(view.id, p),
    startView: () => setStartView(`view:${view.id}`),
    remove: () => deleteView(view.id),
  })
  return (
    <>
      <ActionMenu label={`Menu for view ${view.name}`} title={view.name} groups={groups} align={align}
        triggerClassName={`touch-target rounded px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
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
      <li key={v.id} className="group flex items-center gap-2 rounded-md hover:bg-sunken dark:hover:bg-raised">
        <button className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm" onClick={() => navigate({ view: 'view', id: v.id })}>
          <span className="flex w-5 justify-center text-faint"><Icon name={viewIcon(v)} /></span>
          <span className="truncate font-medium">{v.name}</span>
          <code className="hidden truncate text-xs text-faint sm:inline">{isDashboard(v) ? `${v.panels.length} panel${v.panels.length === 1 ? '' : 's'}` : v.query}</code>
          <span className="flex-1" />
          {s && (s.ok ? <span className="text-xs text-faint">{s.count}</span> : <span className="text-xs text-danger" title={s.error}>error</span>)}
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
        <button className="btn-secondary text-xs" onClick={() => navigate({ view: 'filter' })}>+ New view from a filter</button>
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
