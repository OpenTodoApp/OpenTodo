// The metadata language of rows and cards (OpenSpec change ux-overhaul,
// task-list-presentation "Metadata language", design D7): three styles only.
// `ToneText` for a date or a deadline (a tone, an optional icon, the text),
// `LabelChip` for a label (its colour dot and name; `LabelChips` for a row's labels,
// rows-v2 D5: the only pills of a row) and `NeutralChip` for a count or a name in
// the task panel and settings (rows use muted text instead, rows-v2 D4), in the
// metadata size with tabular figures, never a monospace face. Icons in chips are
// 12 px ("Secondary text is one size").
//
// A chip's full phrase ("3 comments", "Has notes") is visually hidden text inside it,
// never an aria-label: a span has no role, so screen readers ignore a name on it
// (OpenSpec assistive-tech-semantics; the lint rule a11y/no-generic-aria-label).
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './Tooltip'
import { t } from '../lib/i18n'

export type Tone = 'danger' | 'success' | 'warning' | 'accent' | 'violet' | 'indigo' | 'default' | 'muted' | 'faint'

/**
 * Text read differently than it is shown: the visible text is hidden from assistive
 * technology and `label` is read in its place ("3" is read "3 comments"). Without a
 * label the children are read as shown.
 */
export function ReadAs({ label, children }: { label?: string | null; children?: ReactNode }) {
  if (!label) return <>{children}</>
  // `relative`: the hidden text is positioned against this span, not against a far
  // ancestor, so it never widens a scroller it sits in (a board column, issue #95).
  return (
    <span className="relative">
      {children !== undefined && children !== null && <span aria-hidden="true">{children}</span>}
      <span className="sr-only">{label}</span>
    </span>
  )
}

const TONE: Record<Tone, string> = {
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent',
  violet: 'text-(--ot-hue-violet-text)',
  indigo: 'text-(--ot-hue-indigo-text)',
  default: 'text-default',
  muted: 'text-muted',
  faint: 'text-faint',
}

export interface ToneTextProps {
  tone?: Tone
  /** 12 px, before the text (the deadline's hourglass). */
  icon?: IconName
  children: ReactNode
  /** The full phrase for assistive technology when the text is abbreviated. */
  label?: string
  className?: string
  'data-testid'?: string
}

/** A short phrase in a tone colour: the date ("Today · evening · repeats") or the deadline. */
export function ToneText({ tone = 'muted', icon, children, label, className, ...rest }: ToneTextProps & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-meta tabular-nums ${TONE[tone]}${className ? ` ${className}` : ''}`} {...rest}>
      {icon && <Icon name={icon} size="xs" />}
      <span className="truncate"><ReadAs label={label}>{children}</ReadAs></span>
    </span>
  )
}

export interface NeutralChipProps {
  icon?: IconName
  children?: ReactNode
  /** The full phrase for assistive technology ("3 comments"). */
  label?: string
  /** A colour dot before the text (the project). */
  dot?: string | null
  className?: string
}

/** A quiet chip for a count or a name: sunken fill, metadata size, tabular figures. */
export function NeutralChip({ icon, children, label, dot, className, ...rest }: NeutralChipProps & Record<`data-${string}`, string | undefined>) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-chip bg-sunken px-1.5 py-px text-meta tabular-nums text-muted dark:bg-raised${className ? ` ${className}` : ''}`} {...rest}>
      {dot && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      {icon && <Icon name={icon} size="xs" />}
      {children !== undefined && children !== null && <span className="truncate"><ReadAs label={label}>{children}</ReadAs></span>}
      {(children === undefined || children === null) && label && <ReadAs label={label} />}
    </span>
  )
}

export interface LabelChipProps {
  name: string
  color: string
  /** With a handler, a remove control follows the name (the label picker's chips). */
  onRemove?: () => void
  className?: string
}

/** A label: its colour dot and name in an outlined chip; not a button unless it can be removed. */
export function LabelChip({ name, color, onRemove, className }: LabelChipProps) {
  return (
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-chip border border-default px-1.5 py-px text-meta text-muted${className ? ` ${className}` : ''}`} data-label-chip>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
      {onRemove && (
        <button type="button" aria-label={t('Remove label {name}', { name })} onClick={onRemove} className="ml-0.5 leading-none text-faint hover:text-danger"><Icon name="x" size={10} /></button>
      )}
    </span>
  )
}

export interface LabelChipsProps {
  /** The task's labels in its order (already resolved). */
  labels: readonly { id: string; name: string; color: string }[]
  /** A label left out because its own view is open (the omission table). */
  omit?: string
  /** Chips shown before "+n" (rows-v2 D5: two). */
  max?: number
  /** One line with as many chips as its width holds, then "+n" (row-layouts D2); `max` is ignored. */
  fit?: boolean
}

/** Room kept for "+n" while measuring, in px. */
const MORE_W = 28
const CHIP_GAP = 4

/**
 * How many of a group's chips fit its width on one line (row-layouts D2): every chip
 * stays in the page to be measured, the ones past the count are taken out of the flow.
 * Without a measurable width (tests, before layout) every chip counts as fitting.
 */
function useChipsThatFit(ref: RefObject<HTMLElement | null>, total: number, on: boolean): number {
  const [n, setN] = useState(total)
  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el) return
    const measure = () => {
      const avail = el.clientWidth
      const widths = [...el.querySelectorAll<HTMLElement>('[data-fit-chip]')].map((c) => c.offsetWidth)
      if (!avail || widths.every((w) => w === 0)) return setN(total)
      let used = 0
      let fit = 0
      for (let i = 0; i < widths.length; i++) {
        const next = used + (i ? CHIP_GAP : 0) + widths[i]
        const room = i < widths.length - 1 ? CHIP_GAP + MORE_W : 0
        if (next + room > avail) break
        used = next
        fit++
      }
      // One chip always shows (truncated by its maximum width), so a label is never only "+n".
      setN(Math.max(1, fit))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, total, on])
  return on ? Math.min(n, total) : total
}

/**
 * A row's labels (rows-v2 D5, task-list-presentation "Metadata language"): the only
 * chips of a row, each with its colour dot and name, at most `max`, then "+n". The
 * group is read as "Labels: a, b, c" with every name in order, and while it has
 * hidden names it is a tab stop whose tooltip lists them all.
 */
export function LabelChips({ labels, omit, max = 2, fit = false }: LabelChipsProps) {
  const shown = omit ? labels.filter((l) => l.id !== omit) : labels
  const ref = useRef<HTMLSpanElement>(null)
  const fitting = useChipsThatFit(ref, shown.length, fit)
  if (shown.length === 0) return null
  const names = shown.map((l) => l.name).join(', ')
  const count = fit ? fitting : max
  const more = shown.length - count
  const group = (
    // The chips wrap in a narrow row (a dashboard panel), or keep one line when they fit
    // (row-layouts D2); the full list is read once, as visually hidden text, while the
    // chips themselves are hidden from assistive technology.
    <span ref={ref} role="group" data-label-chips="" data-fit={fit ? '' : undefined} tabIndex={more > 0 ? 0 : undefined}
      className={`relative inline-flex max-w-full min-w-0 items-center gap-1 rounded-chip outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus ${fit ? 'w-full flex-nowrap overflow-hidden' : 'flex-wrap'}`}>
      <span className="sr-only">{t('Labels: {names}', { names })}</span>
      {(fit ? shown : shown.slice(0, max)).map((l, i) => (
        <span key={l.id} aria-hidden="true" data-fit-chip={fit ? '' : undefined}
          className={`inline-flex max-w-full min-w-0 ${fit && i >= count ? 'invisible absolute' : ''} ${fit ? 'shrink-0' : ''}`}><LabelChip name={l.name} color={l.color} className="max-w-32" /></span>
      ))}
      {more > 0 && <span aria-hidden="true" className="text-meta tabular-nums text-muted" data-label-more="">+{more}</span>}
    </span>
  )
  return more > 0 ? <Tooltip label={names} side="top">{group}</Tooltip> : group
}
