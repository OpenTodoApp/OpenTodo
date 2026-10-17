// Views overview (`g v`) and the per-view menu shared with the sidebar and the view
// headers (OpenSpec `custom-views`). Every action is an op through lib/views, except
// the start view, which is a per-device preference in local meta.
import { useMemo, useState } from 'react'
import type { View } from '../lib/types'
import { createView, deleteView, evaluateViews, isDashboard, reorderView, setPinned, setStartView, updateView } from '../lib/views'
import { NamePrompt } from './NamePrompt'
import { navigate } from './router'
import { DEFAULT_DISPLAY_OPTIONS } from './display/displayOptions'
import { useStartView, useViewData, useViews } from './useViews'
import { Button, Icon, type IconName, ListGroupHeader, PageBody, PageHeader } from '../ui'
import { Tooltip } from '../ui'
import { ActionMenu, type ActionGroup } from './menus/ActionMenu'
import { t } from '../lib/i18n'
import { act } from './actionError'

export const viewIcon = (v: View): IconName => (isDashboard(v) ? 'kanban' : 'list')

export interface ViewMenuActions {
  rename: () => void
  move: (delta: -1 | 1) => unknown
  pin: (pinned: boolean) => unknown
  startView: () => unknown
  remove: () => unknown
  /** Opens the view in display mode (display-mode); offered for list views only. */
  display?: () => unknown
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
    { items: [{ kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', onSelect: a.rename }] },
    { items: [
      { kind: 'check', id: 'pin', label: t('Pinned to sidebar'), icon: 'pin', checked: view.pinned, onSelect: () => a.pin(!view.pinned) },
      { kind: 'check', id: 'start', label: t('Start view on this device'), icon: 'house', checked: isStart, disabled: isStart,
        reason: t('This view opens when the app starts'), onSelect: a.startView },
    ] },
    ...(a.display && !isDashboard(view) ? [{ items: [{ kind: 'action' as const, id: 'display', label: t('Display mode'), icon: 'monitor' as const, onSelect: a.display }] }] : []),
    { items: [
      { kind: 'action', id: 'up', label: t('Move up'), icon: 'arrow-up', disabled: first, reason: t('Already first'), onSelect: () => a.move(-1) },
      { kind: 'action', id: 'down', label: t('Move down'), icon: 'arrow-down', disabled: last, reason: t('Already last'), onSelect: () => a.move(1) },
    ] },
    { items: [{ kind: 'confirm', id: 'delete', label: t('Delete view'), icon: 'trash-2', tone: 'danger', confirm: {
      title: t('Delete view “{name}”?', { name: view.name }),
      body: t('The view is removed on all your devices. Your tasks are not affected.'),
      confirmLabel: t('Delete view'),
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
    display: () => navigate({ view: 'display', target: { kind: 'view', id: view.id }, options: { ...DEFAULT_DISPLAY_OPTIONS } }),
  })
  return (
    <>
      <ActionMenu label={t('Menu for view {name}', { name: view.name })} title={view.name} groups={groups} align={align}
        triggerClassName={`touch-target rounded-control px-1.5 py-0.5 text-faint hover:bg-sunken dark:hover:bg-raised ${className}`} />
      {renaming && (
        <NamePrompt title={t('Rename view')} label={t('View name')} initial={view.name} onCancel={() => setRenaming(false)}
          onSubmit={async (name) => { await updateView(view.id, { name }); setRenaming(false) }} />
      )}
    </>
  )
}

export function ViewsView() {
  const { views, ctx } = useViewData()
  const summaries = useMemo(() => evaluateViews(views, ctx, 0), [views, ctx])
  const [creating, setCreating] = useState(false)
  const byPin = (a: View, b: View) => Number(b.pinned) - Number(a.pinned)
  const filters = views.filter((v) => !isDashboard(v)).sort(byPin)
  const boards = views.filter(isDashboard).sort(byPin)

  const row = (v: View) => {
    const s = summaries.get(v.id)
    return (
      <li key={v.id} className="group flex items-center gap-2 rounded-control hover:bg-sunken dark:hover:bg-raised">
        <button className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-body" onClick={() => navigate({ view: 'view', id: v.id })}>
          <span className="flex w-5 justify-center text-faint"><Icon name={viewIcon(v)} /></span>
          <span className="truncate font-medium">{v.name}</span>
          <code className="hidden truncate text-meta text-faint sm:inline">{isDashboard(v) ? t('{n, plural, one {# panel} other {# panels}}', { n: v.panels.length }) : v.query}</code>
          <span className="flex-1" />
          {s && (s.ok ? <span className="text-meta text-faint">{s.count}</span> : <Tooltip label={s.error}><span className="text-meta text-danger">{t('error')}</span></Tooltip>)}
        </button>
        <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-meta" onClick={() => act(setPinned(v.id, !v.pinned))} aria-label={v.pinned ? t('Unpin {name}', { name: v.name }) : t('Pin {name}', { name: v.name })}>
          {v.pinned ? t('Unpin') : t('Pin')}
        </button>
        <ViewMenu view={v} />
      </li>
    )
  }

  return (
    <PageBody width="form">
      <PageHeader title={t('Filters')} meta={views.length} help="filters"
        actions={<>
          <Button variant="secondary" size="sm" icon="filter" onClick={() => navigate({ view: 'filter' })}>{t('New filter')}</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setCreating(true)}>{t('New board')}</Button>
        </>} />
      {/* Saved filters and boards of filters (custom-views "Pinned views in the sidebar"); pinned ones first in each. */}
      <ListGroupHeader title={t('Saved filters')} count={filters.length} />
      <ul className="mb-5 space-y-0.5">{filters.map(row)}</ul>
      {filters.length === 0 && <p className="mb-5 px-2 text-body text-faint">{t('None yet. Save a query from the Filter view.')}</p>}
      <ListGroupHeader title={t('Boards')} count={boards.length} />
      <ul className="space-y-0.5">{boards.map(row)}</ul>
      {boards.length === 0 && <p className="px-2 text-body text-faint">{t('None yet.')}</p>}
      {creating && (
        <NamePrompt title={t('New board')} label={t('Board name')} confirm={t('Create')} hint={t('Add up to six saved filters as panels.')}
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            const id = await createView({ name, kind: 'dashboard' })
            setCreating(false)
            navigate({ view: 'view', id })
          }} />
      )}
    </PageBody>
  )
}
