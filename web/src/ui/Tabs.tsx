// Tabs (OpenSpec change ui-primitives, design D9): WAI-ARIA tabs with roving
// focus and automatic activation (arrow keys, Home and End).
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: ReactNode
  count?: number
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
  return (
    <div>
      <div role="tablist" aria-label={label} onKeyDown={move} className="flex gap-1 border-b border-default">
        {tabs.map((t) => {
          const selected = t.id === value
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[t.id] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition duration-(--duration-ui)
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
                ${selected ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-default'}`}
            >
              {t.label}
              {t.count != null && <span className="rounded-full bg-sunken px-1.5 text-hint text-muted">{t.count}</span>}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} tabIndex={0} className="pt-3 focus-visible:outline-2 focus-visible:outline-focus">
        {children}
      </div>
    </div>
  )
}
