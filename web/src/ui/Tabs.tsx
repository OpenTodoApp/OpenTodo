// Tabs (OpenSpec change ui-primitives, design D9): WAI-ARIA tabs with roving
// focus and automatic activation (arrow keys, Home and End). Tabs may carry a
// group (open-loops-method D6): a group's name is drawn before its first tab and
// read with each of its tabs. The row scrolls sideways inside itself when it is
// wider than the screen, keeping the selected tab in view.
import { Fragment, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  count?: number
  /** The group the tab belongs to (a phase of the review): shown before its first tab, announced with each. */
  group?: string
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  /** Accessible name of the tab list. */
  label: string
  children: ReactNode
}

export function Tabs({ tabs, value, onChange, label, children }: TabsProps) {
  const base = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }
  useEffect(() => { refs.current[value]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }, [value])
  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={move} className="ui-scroller flex gap-1 overflow-x-auto overscroll-x-contain border-b border-default" data-tabs-row>
        {tabs.map((t, i) => {
          const selected = t.id === value
          const startsGroup = !!t.group && t.group !== tabs[i - 1]?.group
          return (
            <Fragment key={t.id}>
            {startsGroup && (
              <span aria-hidden="true" data-tab-group={t.group} className={`flex shrink-0 items-center whitespace-nowrap pr-1 text-hint font-semibold uppercase tracking-wide text-faint ${i > 0 ? 'ml-2 border-l border-default pl-3' : 'pl-1'}`}>{t.group}</span>
            )}
            <button
              ref={(el) => { refs.current[t.id] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-body font-medium transition duration-(--duration-ui)
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
                ${selected ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-default'}`}
            >
              {t.group && <span className="sr-only">{`${t.group}: `}</span>}
              {t.label}
              {t.count != null && <span className="rounded-full bg-sunken px-1.5 text-hint text-muted">{t.count}</span>}
            </button>
            </Fragment>
          )
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} tabIndex={0} className="pt-3 focus-visible:outline-2 focus-visible:outline-focus">
        {children}
      </div>
    </div>
  )
}
