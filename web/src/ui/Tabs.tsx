// Tabs (OpenSpec change ui-primitives, design D9): WAI-ARIA tabs with roving
// focus and automatic activation (arrow keys, Home and End). Tabs may carry a
// group (open-loops-method D6): a group's name is drawn before its first tab (from
// 640 px; a divider on phones) and read with each of its tabs. The row scrolls sideways inside itself when it is
// wider than the screen, keeping the selected tab in view, and fades at an edge while tabs are hidden past it.
// The bar (baseline, background, a sticky position) holds the scroller, so the fade never shows what is behind the bar.
// With `fit` (sidebar-brand-and-row-grid D6) the row never scrolls: when the words do not fit
// its width, every tab becomes its icon and its count, the selected one keeping its word while
// that still fits; each tab's full name stays in its accessible name and its tooltip.
import { type CSSProperties, Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useScrollEdges } from './patterns/Sidebar'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './Tooltip'

export interface TabItem {
  id: string
  label: ReactNode
  count?: number
  /** The group the tab belongs to (a phase of the review): shown before its first tab, announced with each. */
  group?: string
  /** With `fit`: the icon that stands for the word when the row is narrow. */
  icon?: IconName
  /** With `fit`: the word shown beside the icon while it fits (the label without its value). */
  word?: string
  /** With `fit`: the short value after the icon when narrow ("4", "1h 20m"); `count` when absent. */
  value?: string
  /** With `fit`: the tab's full name and value, read and shown in the tooltip when narrow ("Comments, 4"). */
  name?: string
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  /** Accessible name of the tab list. */
  label: string
  children: ReactNode
  /** Extra classes for the tab bar around the row (a sticky bar needs its own background). */
  rowClassName?: string
  /** The tab bar element, for callers that keep it in place (the task panel's conversation). */
  rowRef?: (el: HTMLDivElement | null) => void
  /** Extra props for the tab panel (a minimum height while switching). */
  panelStyle?: CSSProperties
  /** The row fits its width without scrolling: icons with counts when the words do not fit (the task panel). */
  fit?: boolean
}

/** How much of the words a fitting row shows: 0 every word, 1 the selected tab's word only, 2 icons and counts alone. */
type FitLevel = 0 | 1 | 2

/** Measures the two wider shapes of a fitting row against its width (a ResizeObserver on the row). */
function useFitLevel(fit: boolean, row: React.RefObject<HTMLDivElement | null>, full: React.RefObject<HTMLDivElement | null>, selectedWord: React.RefObject<HTMLDivElement | null>, deps: unknown[]): FitLevel {
  const [level, setLevel] = useState<FitLevel>(0)
  useLayoutEffect(() => {
    const el = row.current
    if (!fit || !el) return
    const check = () => {
      const room = el.clientWidth
      if (!room) return
      setLevel((full.current?.offsetWidth ?? 0) <= room ? 0 : (selectedWord.current?.offsetWidth ?? 0) <= room ? 1 : 2)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tabs' words and the selected tab change the shapes
  }, [fit, ...deps])
  return fit ? level : 0
}

export function Tabs({ tabs, value, onChange, label, children, rowClassName = '', rowRef, panelStyle, fit = false }: TabsProps) {
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
  const groupRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  // The selected tab comes into view with its group's name when they fit, the tab itself first;
  // again from the start once a web font still loading has arrived, since it changes the tabs' widths.
  const group = tabs.find((t) => t.id === value)?.group
  const row = useRef<HTMLDivElement>(null)
  const fullShape = useRef<HTMLDivElement>(null)
  const selectedShape = useRef<HTMLDivElement>(null)
  const level = useFitLevel(fit, row, fullShape, selectedShape, [tabs.map((x) => `${x.word ?? ''}${x.value ?? x.count ?? ''}`).join('|'), value])
  useScrollEdges(row, 'x')
  useEffect(() => {
    let live = true
    // Sideways only: scrollIntoView would also scroll the page or panel the tabs sit in,
    // which made the task panel jump on every tab change (task-panel-polish).
    const into = (el: HTMLElement | null | undefined) => {
      const r = row.current
      if (!el || !r) return
      const left = el.getBoundingClientRect().left - r.getBoundingClientRect().left + r.scrollLeft
      // Clear of the edge fade (24 px) where more tabs are hidden.
      const fade = r.scrollWidth > r.clientWidth ? 24 : 0
      if (left - fade < r.scrollLeft) r.scrollLeft = Math.max(0, left - fade)
      else if (left + el.offsetWidth + fade > r.scrollLeft + r.clientWidth) r.scrollLeft = left + el.offsetWidth + fade - r.clientWidth
    }
    const reveal = () => {
      if (group) into(groupRefs.current[group])
      into(refs.current[value])
    }
    if (fit) return
    reveal()
    if (typeof document !== 'undefined' && document.fonts?.status === 'loading') {
      void document.fonts.ready.then(() => { if (!live || !row.current) return; row.current.scrollLeft = 0; reveal() })
    }
    return () => { live = false }
  }, [value, group, fit])
  return (
    <div>
      <div ref={rowRef} className={`ui-tab-row ${rowClassName}`.trim()} data-tabs-bar>
      {/* A designated sideways scroller (data-scroll-x): a long translation scrolls here, never the page. */}
      <div ref={row} role="tablist" aria-label={label} onKeyDown={move} data-tabs-row data-tabs-fit={fit ? level : undefined} data-scroll-x={fit ? undefined : true}
        className={fit ? 'relative flex gap-1 overflow-hidden' : 'ui-scroller flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain'}>
        {fit && <>
          {/* The two wider shapes, measured off screen: every word, then the selected tab's word only. */}
          <div ref={fullShape} aria-hidden="true" className="pointer-events-none invisible absolute flex w-max gap-1">
            {tabs.map((x) => <span key={x.id} className={TAB_BOX}>{x.label}{x.count != null && <span className={COUNT}>{x.count}</span>}</span>)}
          </div>
          <div ref={selectedShape} aria-hidden="true" className="pointer-events-none invisible absolute flex w-max gap-1">
            {tabs.map((x) => <span key={x.id} className={TAB_BOX}>{narrow(x, x.id === value)}</span>)}
          </div>
        </>}
        {tabs.map((t, i) => {
          const selected = t.id === value
          const startsGroup = !!t.group && t.group !== tabs[i - 1]?.group
          return (
            <Fragment key={t.id}>
            {startsGroup && (
              <span aria-hidden="true" ref={(el) => { groupRefs.current[t.group!] = el }} data-tab-group={t.group} className={`flex shrink-0 items-center whitespace-nowrap text-hint font-semibold uppercase tracking-wide text-faint ${i > 0 ? 'ml-1 border-l border-default pl-2 sm:ml-2 sm:pl-3' : ''}`}><span className="hidden pr-1 sm:inline">{t.group}</span></span>
            )}
            {withTip(fit && level > 0 ? t.name : undefined, <button
              ref={(el) => { refs.current[t.id] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              aria-label={fit && level > 0 ? t.name : undefined}
              data-tab={t.id}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`${TAB_BOX} transition duration-(--duration-ui)
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
                ${selected ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-default'}`}
            >
              {t.group && <span className="sr-only">{`${t.group}: `}</span>}
              {fit && level > 0 ? narrow(t, level === 1 && selected) : <>
                {t.label}
                {t.count != null && <span className={COUNT}>{t.count}</span>}
              </>}
            </button>)}
            </Fragment>
          )
        })}
      </div>
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} tabIndex={0} style={panelStyle} className="pt-3 focus-visible:outline-2 focus-visible:outline-focus">
        {children}
      </div>
    </div>
  )
}

const TAB_BOX = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2 text-body sm:px-3 font-medium'
const COUNT = 'rounded-full bg-sunken px-1.5 text-hint text-muted'

/** A tab in a narrow fitting row: its icon, the word when it keeps it, then its value. */
function narrow(t: TabItem, word: boolean): ReactNode {
  const shown = t.value ?? (t.count != null ? String(t.count) : '')
  return <>
    {t.icon && <Icon name={t.icon} size="sm" />}
    {(word || !t.icon) && <span>{t.word ?? t.label}</span>}
    {shown && <span className="tabular-nums" data-tab-value>{shown}</span>}
  </>
}

const withTip = (tip: string | undefined, el: React.ReactElement<Record<string, unknown>>) => (tip ? <Tooltip label={tip}>{el}</Tooltip> : el)
