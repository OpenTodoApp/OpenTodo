// Today on a phone, as a drawing (OpenSpec change phone-ui-trial, "Phone Today"):
// everything it shows comes in as props, so the same view serves the screen (fed
// by the hook the desktop Today runs on) and the stories. One scroller, one bar,
// a large title that the bar takes over once it has scrolled away.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { Icon, IconButton } from '../../ui'
import { PhoneGroup } from '../components/PhoneGroup'
import { PhoneHeader } from '../components/PhoneHeader'
import { PhoneRow, type PhoneRowModel } from '../components/PhoneRow'

export interface PhoneEvent {
  id: string
  title: string
  /** "09:00", or empty for an all-day event. */
  time: string
  /** The calendar's colour, as a CSS colour. */
  color: string
}

export interface PhoneTodayGroup {
  id: string
  title: string
  tone?: 'danger'
  rows: PhoneRowModel[]
  /** The tasks under the name, also while the group is folded. */
  count: number
  /** A folding group (Blocked, Waiting for a slot): whether it is folded. */
  folded?: boolean
  note?: string
  /** One control at the end of the name: the group's menu. */
  action?: ReactNode
}

export interface PhoneTodayViewProps {
  /** The date in words ("Wednesday 14 October"). */
  date: string
  /** One quiet line under the date ("6 tasks, 2 late"). */
  summary?: string
  events?: PhoneEvent[]
  /** Between the events and the tasks: what Today shows that is not a task (the habits of the day). */
  above?: ReactNode
  groups: PhoneTodayGroup[]
  /** How many tasks were completed today; one row at the end shows or hides them. */
  doneCount?: number
  /** Room left at the end for what floats over the screen (the tab bar, the add button). */
  bottomRoom?: string
  menu?: ReactNode
  /** Draws one row; the screen wraps it to add the swipe. By default a plain row. */
  renderRow?: (row: PhoneRowModel) => ReactNode
  onMenu: () => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onFold?: (groupId: string) => void
  onDone?: () => void
}

/** What scrolls `el`: the nearest ancestor that scrolls, or null for the window. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return null
}

export function PhoneTodayView({ date, summary, events = [], above, groups, doneCount = 0, bottomRoom = '0px', menu, renderRow, onMenu, onToggle, onOpen, onFold, onDone }: PhoneTodayViewProps) {
  // The bar shows "Today" once the large title has scrolled under it. The screen does not
  // scroll itself: it sits in whatever scrolls it (the shell's content, a pane), design D9.
  const title = useRef<HTMLHeadingElement>(null)
  const [titled, setTitled] = useState(false)
  useEffect(() => {
    const el = title.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setTitled(!e.isIntersecting), { root: scrollParent(el), rootMargin: '-48px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const empty = groups.every((g) => g.count === 0)
  const row = renderRow ?? ((r: PhoneRowModel) => <PhoneRow key={r.id} row={r} onToggle={onToggle} onOpen={onOpen} />)

  return (
    <div data-phone-screen="today" className="min-h-full bg-canvas">
      <PhoneHeader title={t('Today')} shown={titled}
        lead={<IconButton icon="menu" label={t('Open menu')} onClick={onMenu} className="touch-target" />}
        trailing={menu} />
      <div className="px-5 pb-4 pt-1">
        <h1 ref={title} tabIndex={-1} className="text-display text-strong outline-none" data-page-title>{t('Today')}</h1>
        <p className="text-prose text-muted">{date}</p>
        {summary && <p className="mt-0.5 text-body text-muted" data-phone-summary>{summary}</p>}
      </div>

      <div className="flex flex-col gap-5" style={{ paddingBottom: `calc(${bottomRoom} + 1.5rem)` }}>
        {events.length > 0 && (
          <section className="px-4" aria-label={t('Events')} data-phone-events>
            <ul className="overflow-hidden rounded-card bg-surface shadow-1 [&>li+li]:border-t [&>li+li]:border-soft">
              {events.map((e) => (
                <li key={e.id} className="flex min-h-11 items-center gap-3 px-4 text-prose">
                  <span aria-hidden className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="w-14 shrink-0 tabular-nums text-muted">{e.time || t('All day')}</span>
                  <span className="min-w-0 truncate text-strong">{e.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {above && <div className="px-4" data-phone-above>{above}</div>}

        {groups.filter((g) => g.count > 0).map((g) => (
          <PhoneGroup key={g.id} title={g.title} count={g.count} tone={g.tone} action={g.action} note={g.note}
            folded={g.folded} onToggle={() => onFold?.(g.id)}>
            {g.rows.length > 0 ? g.rows.map(row) : undefined}
          </PhoneGroup>
        ))}

        {empty && (
          <div className="px-8 py-12 text-center" data-phone-empty>
            <p className="text-h2 text-strong">{t('Nothing left for today')}</p>
          </div>
        )}

        {doneCount > 0 && (
          <div className="px-4">
            <button type="button" onClick={onDone} data-phone-done
              className="flex min-h-11 w-full items-center gap-3 rounded-card px-4 text-left text-prose text-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
              <Icon name="check" size="md" className="text-faint" />
              <span>{t('Done today')}</span>
              <span className="ml-auto tabular-nums text-muted">{doneCount}</span>
              <Icon name="chevron-right" size="sm" className="text-faint" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
