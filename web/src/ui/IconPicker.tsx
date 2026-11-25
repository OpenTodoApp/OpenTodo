// The searchable icon picker (OpenSpec change icons-and-section-style, design-system
// "Icon catalogue"). It follows the Combobox pattern (a combobox field driving a
// listbox through aria-activedescendant, type to filter, Enter picks, Esc closes
// without a change), laid out as a grid of icons grouped by category, because a list
// of hundreds of named rows is not how people choose a picture. Arrow keys move
// through the grid as it is drawn; "No icon" comes first.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { pickerField, restInOverlay } from './overlay/stack'
import { CatalogueIcon } from './CatalogueIcon'
import { hueFor } from './tokens/palette'
import { Icon, isIconName } from './Icon'
import { CATALOGUE_NAMES } from './icons/catalogue.names'
import { categoryLabel, iconTitle, loadCatalogue, searchIcons, type CatalogueEntry, type IconCategory, type LoadedCatalogue, ICON_CATEGORIES, catalogueIfLoaded } from './icons/catalogue'
import { t } from '../lib/i18n'
import { inlineKey } from '../lib/direction'

/** The columns of the grid with a mouse. */
const COLS = 8
/**
 * A grid of touch targets (phone-icon-picker, GitHub issue 1369): on touch, as many columns
 * of at least 44 px as the width holds, stretched evenly, 2 px apart. With a mouse the
 * element keeps the layout its other classes give it.
 */
export const TOUCH_GRID = 'pointer-coarse:grid pointer-coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] pointer-coarse:gap-0.5'
const NONE = ''

/** The columns a grid of icons is drawn in: the tracks the browser laid out (phone-icon-picker). */
function columnsOf(grid: Element | null | undefined): number {
  const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter((w) => w.endsWith('px')).length : 0
  return tracks || COLS
}

interface Cell { key: string; row: number; col: number }

export interface IconPickerProps {
  /** The current icon name, or null for none. */
  value: string | null | undefined
  /** null: "No icon". */
  onPick: (name: string | null) => void
  /** Esc: close without a change. */
  onClose?: () => void
  /** The colour the icons are drawn in (the project's or section's). */
  color?: string
  /** What "No icon" looks like (a project's dot). */
  noneMark?: ReactNode
  label?: string
  /** Starting search text (workbench stories). */
  defaultQuery?: string
  /** Loads the catalogue; replaced in stories to show the offline state. */
  load?: () => Promise<LoadedCatalogue>
}

/** Interface icons that are also in the catalogue: what the picker offers before the catalogue has loaded. */
function offlineEntries(): CatalogueEntry[] {
  return CATALOGUE_NAMES.split(' ').filter((n) => isIconName(n)).map((name) => ({ name, category: 'symbols' as IconCategory, keywords: [] }))
}

export function IconPicker({ value, onPick, onClose, color, noneMark, label = t('Icon'), defaultQuery = '', load }: IconPickerProps) {
  const id = useId()
  const [catalogue, setCatalogue] = useState<LoadedCatalogue | null>(() => (load ? null : catalogueIfLoaded()))
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState(defaultQuery)
  const [active, setActive] = useState<string>(value ?? NONE)
  // Opened from a menu's step on a touch-only device, the field stays unfocused and focus rests on the sheet.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => restInOverlay(root.current), [])
  // The arrow keys follow the grid as drawn: eight columns with a mouse, fewer wider ones on touch.
  const [cols, setCols] = useState(COLS)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (catalogue) return
    let live = true
    const loader = load ?? loadCatalogue
    loader().then((c) => { if (live) setCatalogue(c) }, () => { if (live) setFailed(true) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is fixed for the picker's lifetime (a story replaces it once)
  }, [catalogue])

  const entries = useMemo(() => catalogue?.entries ?? (failed ? offlineEntries() : []), [catalogue, failed])
  const results = useMemo(() => searchIcons(entries, query), [entries, query])
  // Grouped by category, groups ordered by their best result when searching, in catalogue order otherwise.
  const groups = useMemo(() => {
    const by = new Map<IconCategory, CatalogueEntry[]>()
    for (const e of results) {
      const list = by.get(e.category)
      if (list) list.push(e)
      else by.set(e.category, [e])
    }
    const order = query.trim() ? [...by.keys()] : ICON_CATEGORIES.filter((c) => by.has(c))
    return order.map((c) => ({ category: c, items: by.get(c)! }))
  }, [results, query])
  const showNone = !query.trim()

  // The grid as drawn: "No icon" alone on row 0, then each group starts a new row.
  const cells = useMemo(() => {
    const out: Cell[] = []
    let row = 0
    if (showNone) out.push({ key: NONE, row: row++, col: 0 })
    for (const g of groups) {
      g.items.forEach((e, i) => out.push({ key: e.name, row: row + Math.floor(i / cols), col: i % cols }))
      row += Math.ceil(g.items.length / cols)
    }
    return out
  }, [groups, showNone, cols])
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const read = () => setCols(columnsOf(el.querySelector('[data-icon-grid]')))
    read()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [groups.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps -- measured when the first grid is drawn, then on resize

  // Typing moves the active cell to the best result.
  useEffect(() => {
    if (!cells.some((c) => c.key === active)) setActive(cells[0]?.key ?? NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the visible cells change
  }, [cells])
  // Once the icons arrive (loaded, or the offline set), the current choice is the active cell.
  useEffect(() => {
    if (!query && entries.some((e) => e.name === value)) setActive(value!)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the icons first arrive
  }, [entries])
  useEffect(() => { if (query.trim() && cells[0]) setActive(cells[0].key) }, [query]) // eslint-disable-line react-hooks/exhaustive-deps -- a new query starts at its best match
  const optionId = (key: string) => `${id}-icon-${key || 'none'}`
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from the stable id
  }, [active])

  const move = (dRow: number, dCol: number) => {
    const at = cells.find((c) => c.key === active) ?? cells[0]
    if (!at) return
    if (dCol) {
      const i = cells.indexOf(at) + dCol
      if (cells[i]) setActive(cells[i].key)
      return
    }
    const target = at.row + dRow
    const row = cells.filter((c) => c.row === target)
    if (row.length) setActive(row.reduce((best, c) => (Math.abs(c.col - at.col) < Math.abs(best.col - at.col) ? c : best)).key)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(0, 1), ArrowLeft: () => move(0, -1),
      ArrowDown: () => move(1, 0), ArrowUp: () => move(-1, 0),
      Home: () => cells[0] && setActive(cells[0].key), End: () => cells.length && setActive(cells[cells.length - 1].key),
      Enter: () => { if (cells.some((c) => c.key === active)) onPick(active === NONE ? null : active) },
    }
    // Home and End move the text caret while there is a query.
    const caretKey = (e.key === 'Home' || e.key === 'End') && query !== ''
    if (keys[inlineKey(e)] && !caretKey) {
      e.preventDefault()
      keys[inlineKey(e)]()
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const listboxId = `${id}-list`
  const count = results.length
  const cell = (key: string, title: string, mark: ReactNode) => {
    const selected = (value ?? NONE) === key
    const isActive = active === key
    return (
      <div key={key || 'none'} id={optionId(key)} role="option" aria-selected={selected} aria-label={title}
        data-icon-option={key || 'none'} data-active={isActive || undefined}
        onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(key)} onClick={() => onPick(key === NONE ? null : key)}
        data-hue={color ? hueFor(color) : undefined}
        className={`touch-target flex h-9 w-9 items-center justify-center pointer-coarse:w-auto rounded-control ${color ? 'text-hue-solid' : ''} ${isActive ? 'bg-sunken ring-2 ring-focus dark:bg-raised' : ''} ${selected ? 'bg-accent-soft' : ''}`}>
        {mark}
      </div>
    )
  }

  return (
    <div ref={root} className="space-y-1 in-data-[overlay=sheet]:px-2" data-icon-picker>
      <div className="relative">
        <span className="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" /></span>
        <input role="combobox" aria-label={label} aria-expanded aria-controls={listboxId} aria-autocomplete="list"
          aria-activedescendant={cells.some((c) => c.key === active) ? optionId(active) : undefined}
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
          placeholder={t('Search icons')} autoComplete="off" spellCheck={false} {...pickerField()}
          className="ui-input ps-9" />
        <span role="status" aria-live="polite" className="sr-only">
          {query.trim() ? (count ? t('{n, plural, one {# result available} other {# results available}}', { n: count }) : t('No matches')) : ''}
        </span>
      </div>
      {!catalogue && failed && <p className="px-1 text-meta text-muted" data-icons-offline>{t('Icons are not available offline yet.')}</p>}
      <div ref={list} id={listboxId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain p-1">
        {!catalogue && !failed && <p className="px-2 py-3 text-meta text-muted" role="status">{t('Loading…')}</p>}
        {showNone && (
          <div role="group" aria-label={t('No icon')} className="mb-1 flex">
            {cell(NONE, t('No icon'), noneMark ?? <span className="block h-3 w-3 rounded-full border border-dashed border-default" />)}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.category} role="group" aria-label={catalogue ? categoryLabel(g.category) : label} className="mb-1">
            {catalogue && <div role="presentation" className="px-1 pb-0.5 pt-1.5 text-hint font-semibold uppercase tracking-wide text-faint">{categoryLabel(g.category)}</div>}
            <div data-icon-grid className={`grid grid-cols-8 gap-0.5 ${TOUCH_GRID}`}>
              {g.items.map((e) => cell(e.name, iconTitle(e.name), <CatalogueIcon name={e.name} />))}
            </div>
          </div>
        ))}
        {(catalogue || failed) && count === 0 && <p className="px-2 py-3 text-meta text-muted">{t('No icons match “{query}”.', { query: query.trim() })}</p>}
      </div>
    </div>
  )
}
