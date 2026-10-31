// The results of a view (OpenSpec change views-and-display, design D2): its groups as a
// list under group bars, or as a board with one column per group. Both layouts render
// the same groups in the same order, so the keyboard cursor, the selection and bulk
// actions behave alike; the board only places them side by side. A group collapsed in
// the list is a folded column on the board and the other way round, per device
// (OpenSpec change board-polish, design D1).
import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { ListGroupHeader } from '../../ui'
import type { Task } from '../../lib/types'
import type { ViewLayout } from '../../lib/types'
import { t } from '../../lib/i18n'
import { groupKey, setGroupCollapsed, useCollapsedGroups } from '../collapsedGroups'
import { ActionMenu } from '../menus/ActionMenu'
import { useShortcutScope } from '../shortcuts'

// A folded column's button (board-polish D2), loaded with the first fold.
const FoldedStrip = lazy(() => import('../FoldedStrip'))

export interface ResultGroup {
  key: string
  /** Empty for a single ungrouped list. */
  heading: string
  tasks: Task[]
  /** Collapsed in the list, folded on the board, on this device (board-polish D1). */
  folded?: boolean
}

/**
 * The groups with their per-device fold state under `scope` (`view:<id>` for a saved
 * view, `filter` on the New view page), and the rows the keyboard walks: a folded
 * group's tasks are not on screen, so they are left out.
 */
export function useFoldedGroups<G extends ResultGroup>(scope: string, groups: G[]): { groups: G[]; shown: G[] } {
  const collapsed = useCollapsedGroups()
  return useMemo(() => {
    const out = groups.map((g) => (g.heading && collapsed.has(groupKey(scope, g.key)) ? { ...g, folded: true } : g))
    return { groups: out, shown: out.filter((g) => !g.folded) }
  }, [groups, collapsed, scope])
}

export interface ViewResultsProps {
  groups: ResultGroup[]
  layout: ViewLayout
  /** A row of the list, or a card of the board; the key is unique across groups. */
  renderTask: (task: Task, key: string, shape: 'row' | 'card') => ReactNode
  /** Where the groups' fold state is kept (see useFoldedGroups); absent: groups do not fold. */
  foldScope?: string
  /** The group of the selected card, for `z` on the board (board-polish D5). */
  selectedGroup?: string | null
}

export function ViewResults({ groups, layout, renderTask, foldScope, selectedGroup = null }: ViewResultsProps) {
  const fold = (key: string, on: boolean) => { if (foldScope) setGroupCollapsed(foldScope, key, on) }
  // `z` on a view's board: the selected card's column, else the focused header or strip.
  useShortcutScope('board', {
    'board.fold': () => {
      const focused = (document.activeElement as HTMLElement | null)?.closest?.('[data-column]')?.getAttribute('data-column')
      const g = groups.find((x) => x.key === (selectedGroup ?? focused))
      if (!g || !g.heading) return false
      fold(g.key, !g.folded)
    },
  }, { enabled: layout === 'board' && !!foldScope })
  if (layout === 'board') {
    return (
      <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:snap-none md:px-0" data-board data-view-board data-scroll-x>
        {groups.map((g) => {
          const name = g.heading || t('All tasks')
          if (g.folded) return <FoldedGroup key={g.key} group={g} name={name} onUnfold={() => fold(g.key, false)} />
          const menu = foldScope && g.heading ? (
            <ActionMenu label={t('Column menu for {title}', { title: name })} title={name} width="sm:w-60"
              groups={[{ items: [{ kind: 'action', id: 'fold', label: t('Fold column'), icon: 'panel-left-close', shortcut: 'z', onSelect: () => fold(g.key, true) }] }]}
              triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1.5 py-0.5 text-meta" />
          ) : undefined
          return (
            <section key={g.key} data-group={g.key} data-column={g.key} aria-label={t('{name}, {n, plural, one {# task} other {# tasks}}', { name, n: g.tasks.length })}
              className="ui-column flex max-h-[calc(100dvh-14rem)] w-[88vw] shrink-0 snap-start flex-col sm:w-72 sm:max-w-72">
              <ListGroupHeader title={name} count={g.tasks.length} countTone="muted" bar={false} actions={menu} />
              <ul className="ui-cards--lift min-h-8 space-y-1.5 overflow-y-auto px-0.5 pb-1">
                {g.tasks.map((tk) => renderTask(tk, `${g.key}:${tk.id}`, 'card'))}
              </ul>
            </section>
          )
        })}
      </div>
    )
  }
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} data-group={g.key} className="mb-3">
          {g.heading && <ListGroupHeader title={g.heading} count={g.tasks.length}
            collapsed={foldScope ? !!g.folded : undefined} onToggle={foldScope ? () => fold(g.key, !g.folded) : undefined} />}
          {!g.folded && <ul>{g.tasks.map((tk) => renderTask(tk, `${g.key}:${tk.id}`, 'row'))}</ul>}
        </section>
      ))}
    </>
  )
}

/** A folded column of a view's board (board-polish D2): one button that unfolds it. A view's columns take no drops. */
function FoldedGroup({ group, name, onUnfold }: { group: ResultGroup; name: string; onUnfold: () => void }) {
  const n = group.tasks.length
  return (
    <section data-group={group.key} data-column={group.key} data-folded="" className="ui-column-strip">
      <Suspense fallback={null}>
        <FoldedStrip id={group.key} name={name} label={t('{name}, {n, plural, one {# task} other {# tasks}}, folded', { name, n })} count={n} onUnfold={onUnfold} />
      </Suspense>
    </section>
  )
}
