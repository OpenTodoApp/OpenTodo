// A group of rows on a phone screen (OpenSpec change phone-ui-trial, design D5): a
// quiet name with its count, then the rows as one card with hairlines that start
// at the text, not at the edge. The group's own actions sit behind one control. A
// group that folds (Blocked, Waiting for a slot) has its name as the toggle.
import type { ReactNode } from 'react'
import { Icon } from '../../ui'

export function PhoneGroup({ title, count, tone, action, folded, onToggle, note, children }: {
  title: string
  count?: number
  tone?: 'danger'
  /** One control at the end of the header (the group's menu). */
  action?: ReactNode
  /** A folding group: whether it is folded now. Left out for a group that never folds. */
  folded?: boolean
  onToggle?: () => void
  /** One line under the name of an open folding group. */
  note?: string
  children?: ReactNode
}) {
  const name = (
    <>
      <h2 className={`text-meta font-semibold ${tone === 'danger' ? 'text-danger' : 'text-muted'}`}>{title}</h2>
      {count !== undefined && <span className="text-meta tabular-nums text-faint">{count}</span>}
    </>
  )
  return (
    <section data-phone-group className="px-4">
      <div className="flex min-h-9 items-center gap-2 px-1">
        {folded === undefined ? name : (
          <button type="button" aria-expanded={!folded} onClick={onToggle} data-phone-fold
            className="-ml-1 flex min-h-11 items-center gap-2 rounded-control px-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
            {name}<Icon name={folded ? 'chevron-right' : 'chevron-down'} size="xs" className="text-faint" />
          </button>
        )}
        <div className="ml-auto flex items-center">{action}</div>
      </div>
      {note && !folded && <p className="px-1 pb-1.5 text-meta text-muted">{note}</p>}
      {!folded && children && (
        <ul className="overflow-hidden rounded-card bg-surface shadow-1 [&>li+li]:before:absolute [&>li+li]:before:left-12 [&>li+li]:before:right-0 [&>li+li]:before:top-0 [&>li+li]:before:z-[1] [&>li+li]:before:border-t [&>li+li]:before:border-soft">
          {children}
        </ul>
      )}
    </section>
  )
}
