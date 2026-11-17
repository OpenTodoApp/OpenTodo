import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import type { Label } from '../lib/types'
import { LabelChip, ReadAs, Tooltip, watchLayout } from '../ui'

const COUNT = 'shrink-0 whitespace-nowrap text-meta tabular-nums text-muted'
const FOCUS = 'rounded-chip outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus'

/** Natural chip width, including text that has already been shortened. */
function chipWidth(chip: HTMLElement): number {
  const text = chip.firstElementChild
  return chip.offsetWidth + (text ? Math.max(0, text.scrollWidth - text.clientWidth) : 0)
}

/** Fit whole chips in order, keeping room for the count of everything left out. */
function fitChips(widths: number[], available: number, gap: number, plus: number, digit: number): number {
  let used = 0
  let fit = 0
  for (const [i, width] of widths.entries()) {
    used += (i ? gap : 0) + width
    if (used > available) break
    const remaining = widths.length - i - 1
    const counter = remaining ? gap + plus + digit * String(remaining).length : 0
    if (used + counter <= available) fit = i + 1
  }
  return fit
}

export default function OneLineLabels({ labels, omit, projectColumn }: { labels: Label[]; omit?: string; projectColumn: boolean }) {
  const shown = omit ? labels.filter((label) => label.id !== omit) : labels
  const ref = useRef<HTMLSpanElement>(null)
  const gauge = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState<number | null>(null)
  useLayoutEffect(() => {
    const group = ref.current
    const slot = group?.parentElement
    const row = slot?.closest<HTMLElement>('[data-row-open]')
    const probe = gauge.current
    if (!group || !slot || !row || !probe) return
    const read = () => {
      const style = getComputedStyle(slot)
      if (style.gridColumnStart !== 'labels' || !slot.clientWidth) return () => setFit(null)
      const available = slot.clientWidth - (parseFloat(style.paddingInlineStart) || 0) - (parseFloat(style.paddingInlineEnd) || 0)
      const gap = parseFloat(getComputedStyle(group).columnGap) || 0
      const widths = Array.from(group.querySelectorAll<HTMLElement>('[data-label-chip]'), chipWidth)
      const [plus, digit] = Array.from(probe.children, (part) => (part as HTMLElement).offsetWidth)
      const next = fitChips(widths, available, gap, plus, digit)
      return () => setFit(next)
    }
    // The labels slot is hidden at some widths. The row stays observable.
    const stopRow = watchLayout(row, read)
    const stopProbe = watchLayout(probe, read)
    return () => { stopRow(); stopProbe() }
  }, [labels, omit, projectColumn])

  const count = Math.min(shown.length, fit === null ? 2 : Math.max(1, fit))
  const hidden = shown.slice(count)
  const hiddenNames = hidden.map((label) => label.name).join(', ')
  return (
    <span ref={ref} role="group" aria-label={t('Labels: {names}', { names: shown.map((label) => label.name).join(', ') })} data-label-chips=""
      className="relative inline-flex max-w-full min-w-0 flex-wrap items-baseline gap-1">
      <span ref={gauge} aria-hidden="true" className={`invisible absolute start-0 top-0 inline-flex ${COUNT}`}><span>+</span><span>0</span></span>
      {shown.map((label, i) => {
        const cut = i === 0 && fit === 0
        const concealed = i >= count
        const chip = (
          <span aria-hidden={concealed ? true : undefined} tabIndex={cut ? 0 : undefined}
            className={`inline-flex min-w-0 ${cut ? `max-w-full ${FOCUS}` : 'shrink-0 max-w-full'}${concealed ? ' invisible absolute start-0 top-0' : ''}`}>
            <LabelChip name={label.name} color={label.color} className={fit === null ? 'max-w-32' : undefined} />
          </span>
        )
        return cut ? <Tooltip key={label.id} label={label.name} side="top">{chip}</Tooltip> : <Fragment key={label.id}>{chip}</Fragment>
      })}
      {hidden.length > 0 && (
        <Tooltip label={hiddenNames} side="top">
          <span data-label-more="" tabIndex={0} className={`${COUNT} ${FOCUS}`}>
            <ReadAs label={hiddenNames}>+{hidden.length}</ReadAs>
          </span>
        </Tooltip>
      )}
    </span>
  )
}
