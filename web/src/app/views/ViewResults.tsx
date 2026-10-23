// The results of a view (OpenSpec change views-and-display, design D2): its groups as a
// list under group bars, or as a board with one column per group. Both layouts render
// the same groups in the same order, so the keyboard cursor, the selection and bulk
// actions behave alike; the board only places them side by side.
import type { ReactNode } from 'react'
import { ListGroupHeader } from '../../ui'
import type { Task } from '../../lib/types'
import type { ViewLayout } from '../../lib/types'
import { t } from '../../lib/i18n'

export interface ResultGroup {
  key: string
  /** Empty for a single ungrouped list. */
  heading: string
  tasks: Task[]
}

export interface ViewResultsProps {
  groups: ResultGroup[]
  layout: ViewLayout
  /** A row of the list, or a card of the board; the key is unique across groups. */
  renderTask: (task: Task, key: string, shape: 'row' | 'card') => ReactNode
}

export function ViewResults({ groups, layout, renderTask }: ViewResultsProps) {
  if (layout === 'board') {
    return (
      <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-6 md:mx-0 md:snap-none md:px-0" data-board data-view-board data-scroll-x>
        {groups.map((g) => {
          const name = g.heading || t('All tasks')
          return (
            <section key={g.key} data-group={g.key} data-column={g.key} aria-label={t('{name}, {n, plural, one {# task} other {# tasks}}', { name, n: g.tasks.length })}
              className="ui-column flex max-h-[calc(100dvh-14rem)] w-[88vw] shrink-0 snap-start flex-col sm:w-72 sm:max-w-72">
              <ListGroupHeader title={name} count={g.tasks.length} countTone="muted" bar={false} />
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
          {g.heading && <ListGroupHeader title={g.heading} count={g.tasks.length} />}
          <ul>{g.tasks.map((tk) => renderTask(tk, `${g.key}:${tk.id}`, 'row'))}</ul>
        </section>
      ))}
    </>
  )
}
