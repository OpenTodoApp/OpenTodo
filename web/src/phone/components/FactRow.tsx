// A fact of a task on its phone page (OpenSpec change phone-ui-trial, "Phone task
// page"): the fact's icon and name at the start, its value at the end, 48 px tall.
// A tap opens that fact's sheet. Facts without a value are not rows: they are the
// buttons of `FactChips` under the cards, so the page lists what the task has.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../ui'

export interface FactModel {
  id: string
  label: string
  icon: IconName
  /** The value in words, or null when the task has none. */
  value: ReactNode | null
  /** The value's colour as a text class (overdue, today), when it has one. */
  tone?: string
  /** Read, never edited: a reader's task, an origin without a link. */
  fixed?: boolean
}

/** Hands the fact's control to what anchors a sheet to it. */
export type FactAnchor = (id: string, el: HTMLButtonElement | null) => void

const ROW = 'flex min-h-12 w-full min-w-0 items-center gap-3 px-4 text-start text-prose'

export function FactRow({ fact, open = false, anchor, onOpen }: { fact: FactModel; open?: boolean; anchor?: FactAnchor; onOpen: (id: string) => void }) {
  const inner = (
    <>
      <Icon name={fact.icon} size="md" className="text-muted" />
      <span className="shrink-0 text-default">{fact.label}</span>
      <span className={`ms-auto min-w-0 truncate text-end ${fact.tone ?? 'text-muted'}`}>{fact.value}</span>
    </>
  )
  return (
    <li data-fact={fact.id}>
      {fact.fixed ? <span className={ROW} data-part={fact.id}>{inner}</span> : (
        <button type="button" aria-haspopup="dialog" aria-expanded={open} ref={(el) => anchor?.(fact.id, el)} onClick={() => onOpen(fact.id)} data-part={fact.id}
          className={`${ROW} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`}>
          {inner}
          <Icon name="chevron-right" size="sm" className="-me-1 text-faint" />
        </button>
      )}
    </li>
  )
}

/** The facts as one card, hairlines starting at the names. */
export function FactCard({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="overflow-hidden rounded-phone-card bg-surface shadow-1 dark:bg-raised [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-s-12 [&>li+li]:before:inset-e-0 [&>li+li]:before:top-0 [&>li+li]:before:border-t [&>li+li]:before:border-soft">
      {children}
    </ul>
  )
}

/** A chip's look, for a chip drawn elsewhere (the Attach menu's trigger). */
export const FACT_CHIP = 'press-selected inline-flex min-h-10 items-center gap-1.5 rounded-full border border-soft bg-surface px-3 text-meta text-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus dark:bg-raised'

/** The facts the task does not have yet, as small chips in one wrapping row: one tap adds one (phone-calm D1). */
export function FactChips({ facts, label, open, anchor, onOpen, end }: {
  facts: Pick<FactModel, 'id' | 'label' | 'icon'>[]
  /** The list's accessible name. */
  label: string
  /** The fact whose sheet is open. */
  open?: string | null
  anchor?: FactAnchor
  onOpen: (id: string) => void
  /** A last chip of its own (Attach). */
  end?: ReactNode
}) {
  if (!facts.length && !end) return null
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2" data-fact-chips>
      {facts.map((f) => (
        <li key={f.id} className="min-w-0">
          <button type="button" aria-haspopup="dialog" aria-expanded={open === f.id} ref={(el) => anchor?.(f.id, el)} onClick={() => onOpen(f.id)} data-fact-add={f.id} data-part={f.id}
            className={FACT_CHIP}>
            <Icon name={f.icon} size="sm" className="text-muted" /><span className="truncate">{f.label}</span>
          </button>
        </li>
      ))}
      {end && <li className="min-w-0" data-fact-chip-end>{end}</li>}
    </ul>
  )
}
