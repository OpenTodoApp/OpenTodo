// The smart picker (OpenSpec change ui-primitives, design D6): ARIA combobox with a
// listbox. Combobox opens anchored from 640 px up and as a sheet below; ComboboxPanel
// keeps field and list together (inside a dialog or a panel).
import { useEffect, useRef, useState, type ReactNode, type UIEvent } from 'react'
import { Popover } from '../overlay/Popover'
import { useWide } from '../overlay/stack'
import { Icon } from '../Icon'
import { highlight, type Range } from './match'
import { useCombobox, type ComboboxConfig, type ComboboxState, type ComboOption } from './useCombobox'
import { t } from '../../lib/i18n'

/** Windowing threshold and geometry (design D6). */
export const WINDOW_ABOVE = 200
const OVERSCAN = 8
const LIST_HEIGHT = 320
const rowHeight = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 44 : 36)

export interface ComboboxViewProps<T> extends ComboboxConfig<T> {
  /** Accessible name of the field (and the sheet title on phones). */
  label: string
  placeholder?: string
  /** Shown when nothing matches and creation is not offered. */
  emptyText?: string
  /** Leading visual of an option (avatar, colour dot). */
  renderLeading?: (item: T) => ReactNode
}

function Marked({ text, ranges }: { text: string; ranges: Range[] }) {
  return <>{highlight(text, ranges).map((p, i) => (p.hit ? <mark key={i} className="rounded-[2px] bg-accent-soft text-on-accent-soft">{p.text}</mark> : <span key={i}>{p.text}</span>))}</>
}

export function ComboboxList<T>({ state, renderLeading, emptyText, label }: { state: ComboboxState<T>; renderLeading?: (item: T) => ReactNode; emptyText?: string; label: string }) {
  const { options, activeIndex, optionId, listboxId, loading } = state
  const listRef = useRef<HTMLUListElement>(null)
  const windowed = options.length > WINDOW_ABOVE
  const rh = rowHeight()
  const [scrollTop, setScrollTop] = useState(0)

  // Keep the active option in view (and, when windowed, rendered).
  useEffect(() => {
    if (windowed) {
      const top = activeIndex * rh
      setScrollTop((st) => {
        const next = top < st ? top : top + rh > st + LIST_HEIGHT ? top + rh - LIST_HEIGHT : st
        if (listRef.current) listRef.current.scrollTop = next
        return next
      })
    } else {
      document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [activeIndex, windowed, rh, optionId])

  // The listbox always exists, so the field's aria-controls never points at nothing.
  if (options.length === 0) {
    return (
      <>
        <ul id={listboxId} role="listbox" aria-label={label} className="sr-only" />
        <p className="px-3 py-3 text-meta text-muted" role={loading ? 'status' : undefined}>{loading ? t('Loading…') : emptyText ?? t('No matches')}</p>
      </>
    )
  }

  const first = windowed ? Math.max(0, Math.floor(scrollTop / rh) - OVERSCAN) : 0
  const last = windowed ? Math.min(options.length, Math.ceil((scrollTop + LIST_HEIGHT) / rh) + OVERSCAN) : options.length
  const indices = Array.from({ length: last - first }, (_, i) => first + i)
  if (windowed && (activeIndex < first || activeIndex >= last)) indices.push(activeIndex)

  let lastGroup: string | undefined
  const rows: ReactNode[] = []
  for (const i of indices) {
    const o = options[i]
    if (!windowed && o.kind === 'item' && o.group && o.group !== lastGroup) {
      rows.push(<li key={`g:${o.group}`} role="presentation" className="px-3 pb-1 pt-2 text-hint font-semibold uppercase tracking-wide text-faint">{o.group}</li>)
    }
    if (o.kind === 'item') lastGroup = o.group
    rows.push(<OptionRow key={o.key} state={state} o={o} i={i} renderLeading={renderLeading} windowed={windowed} rh={rh} />)
  }
  return (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-label={label}
      aria-multiselectable={state.multiple || undefined}
      onScroll={windowed ? (e: UIEvent<HTMLUListElement>) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      className="relative max-h-80 overflow-y-auto overscroll-contain p-1"
      style={windowed ? { height: LIST_HEIGHT } : undefined}
    >
      {windowed && <li role="presentation" aria-hidden="true" style={{ height: options.length * rh }} />}
      {rows}
      {state.more > 0 && <li role="presentation" className="px-3 py-2 text-meta text-muted" data-more>{t('{n, plural, one {# more matches, keep typing} other {# more match, keep typing}}', { n: state.more })}</li>}
    </ul>
  )
}

function OptionRow<T>({ state, o, i, renderLeading, windowed, rh }: { state: ComboboxState<T>; o: ComboOption<T>; i: number; renderLeading?: (item: T) => ReactNode; windowed: boolean; rh: number }) {
  const active = i === state.activeIndex
  const selected = state.isSelected(o)
  return (
    <li
      id={state.optionId(i)}
      role="option"
      aria-selected={state.multiple ? selected : active}
      aria-setsize={state.options.length}
      aria-posinset={i + 1}
      data-active={active || undefined}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => state.setActive(i)}
      onClick={() => void state.pick(o)}
      className={`flex cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-body ${active ? 'bg-sunken dark:bg-raised' : ''} ${o.kind === 'create' ? 'text-accent' : 'text-default'}`}
      style={windowed ? { position: 'absolute', top: i * rh + 4, left: 4, right: 4, height: rh } : { minHeight: rh, paddingTop: 6, paddingBottom: 6, paddingLeft: o.kind === 'item' ? 10 + o.depth * 16 : undefined }}
    >
      {o.kind === 'create' ? (
        <>{t.rich('{icon}<span>Create “{query}”</span>', { icon: <Icon name="plus" />, query: o.query, span: (chunks) => <span className="truncate">{chunks}</span> })}</>
      ) : (
        <>
          {renderLeading && <span className="flex shrink-0 items-center">{renderLeading(o.item)}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate"><Marked text={o.label} ranges={o.m.label} /></span>
            {(o.secondary || (o.path.length > 0 && o.depth === 0)) && (
              <span className="block truncate text-meta text-muted">
                {o.path.length > 0 && o.depth === 0 ? o.path.join(' › ') : <Marked text={o.secondary ?? ''} ranges={o.m.secondary} />}
              </span>
            )}
          </span>
          {selected && <Icon name="check" className="text-accent" />}
        </>
      )}
    </li>
  )
}

/** The combobox field on its own, for views that lay out field and list themselves (command palette). */
export function ComboboxField<T>(props: Parameters<typeof Field<T>>[0]) {
  return <Field {...props} />
}

function Field<T>({ state, label, placeholder, inputRef, onFocus, expanded, autoFocus }: {
  state: ComboboxState<T>; label: string; placeholder?: string; inputRef?: React.Ref<HTMLInputElement>; onFocus?: () => void; expanded: boolean; autoFocus?: boolean
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" /></span>
      <input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={state.listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && state.options.length ? state.optionId(state.activeIndex) : undefined}
        value={state.query}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => state.setQuery(e.target.value)}
        onKeyDown={state.onKeyDown}
        onFocus={onFocus}
        className="ui-input pl-9"
        autoFocus={autoFocus}
        data-autofocus
      />
      <span role="status" aria-live="polite" className="sr-only">{state.announcement}</span>
    </div>
  )
}

/** Field and list always visible, for dialogs and panels. */
export function ComboboxPanel<T>({ label, placeholder, emptyText, renderLeading, ...cfg }: ComboboxViewProps<T>) {
  const state = useCombobox(cfg)
  return (
    <div className="space-y-1" data-combobox>
      {/* The panel lives in a dialog that may have mounted before this picker's data
          arrived, so it focuses its own field. */}
      <Field state={state} label={label} placeholder={placeholder} expanded autoFocus />
      <ComboboxList state={state} renderLeading={renderLeading} emptyText={emptyText} label={label} />
    </div>
  )
}

/** A field whose list opens anchored (≥640 px) or as a bottom sheet with its own field (phones). */
export function Combobox<T>({ label, placeholder, emptyText, renderLeading, ...cfg }: ComboboxViewProps<T>) {
  const [open, setOpen] = useState(false)
  const wide = useWide()
  const anchor = useRef<HTMLDivElement>(null)
  const close = () => { setOpen(false); cfg.onClose?.() }
  const state = useCombobox({ ...cfg, onClose: close })
  if (!wide) {
    return (
      <div ref={anchor} data-combobox>
        <button type="button" className="ui-input flex items-center gap-2 text-left text-muted" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="search" />{placeholder ?? label}
        </button>
        <Popover open={open} onClose={close} anchor={anchor} label={label} className="p-2">
          <div className="space-y-1">
            <Field state={state} label={label} placeholder={placeholder} expanded />
            <ComboboxList state={state} renderLeading={renderLeading} emptyText={emptyText} label={label} />
          </div>
        </Popover>
      </div>
    )
  }
  return (
    <div ref={anchor} data-combobox>
      <Field state={state} label={label} placeholder={placeholder} expanded={open} onFocus={() => setOpen(true)} />
      <Popover open={open} onClose={close} anchor={anchor} label={label} modal={false} align="start" width="sm:w-80" className="p-0">
        <ComboboxList state={state} renderLeading={renderLeading} emptyText={emptyText} label={label} />
      </Popover>
    </div>
  )
}
